/** SPDX-License-Identifier: MIT
 * Bounded text GET for GET /api/agent/v1/compliance.ics (text/calendar).
 *
 * Why this exists here: lib/http.mjs in tools/public-ein-http-client only reads
 * JSON, and its bytes are pinned by scripts/public-ein-client-pack.mjs
 * (REVIEWED blob 716455215e80) and vendored into the immutable continuation
 * archives, so it is not edited. This module applies the same rules using
 * that module's own exports: parseOrigin, HttpClientError, readBoundedJson for
 * JSON error bodies, the same limits, no redirects, same-origin only,
 * and the same `unavailable` code for network, timeout and size failures.
 */

const TEXT_ERROR_CODES = new Set(["invalid_input", "rate_limited", "not_found", "unavailable"]);

function fallbackCode(status) {
  if (status === 400) return "invalid_input";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "unavailable";
}

async function readBoundedText(response, maxBytes, signal) {
  const declared = response.headers?.get?.("content-length");
  if (declared && Number(declared) > maxBytes) {
    void response.body?.cancel?.().catch(() => {});
    throw new Error("response limit exceeded");
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("response limit exceeded");
    return text;
  }
  const reader = response.body.getReader();
  const cancel = () => void reader.cancel().catch(() => {});
  signal.addEventListener("abort", cancel, { once: true });
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error("request timed out");
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("response limit exceeded");
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString("utf8");
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

/**
 * GET `path` on `origin` and return { status, contentType, text }.
 * `http` is the public client's lib/http.mjs module.
 */
export async function getBoundedText(http, { origin, path, fetch: fetchImpl, timeoutMs, maxResponseBytes, expectContentType }) {
  const { HttpClientError, parseOrigin, readBoundedJson } = http;
  const resolved = parseOrigin(origin);
  const url = `${resolved}${path}`;
  if (new URL(url).origin !== resolved) {
    throw new HttpClientError({ code: "invalid_input", message: "refusing wrong-origin request URL" });
  }
  const controller = new AbortController();
  let timer;
  let response;
  let text;
  let errorPayload;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("request timed out"));
      }, timeoutMs);
    });
    await Promise.race([
      deadline,
      (async () => {
        response = await fetchImpl(url, {
          method: "GET",
          headers: { Accept: `${expectContentType}, application/json;q=0.5` },
          redirect: "manual",
          signal: controller.signal,
        });
        if (
          controller.signal.aborted ||
          response.redirected ||
          (response.status >= 300 && response.status < 400) ||
          (response.url && response.url !== url && new URL(response.url).origin !== resolved)
        ) {
          void response.body?.cancel?.().catch(() => {});
          throw new Error("unexpected redirect or wrong origin");
        }
        if (response.status === 200) text = await readBoundedText(response, maxResponseBytes, controller.signal);
        else errorPayload = await readBoundedJson(response, maxResponseBytes, controller.signal).catch(() => undefined);
      })(),
    ]);
  } catch {
    controller.abort();
    throw new HttpClientError({ code: "unavailable", message: "request failed or its response could not be read safely" });
  } finally {
    clearTimeout(timer);
  }
  const status = response.status;
  if (status !== 200) {
    const code =
      typeof errorPayload?.code === "string" && TEXT_ERROR_CODES.has(errorPayload.code) ? errorPayload.code : fallbackCode(status);
    throw new HttpClientError({ status, code, message: `HTTP ${status}` });
  }
  const contentType = String(response.headers?.get?.("content-type") || "");
  if (!contentType.toLowerCase().startsWith(expectContentType)) {
    throw new HttpClientError({ status, code: "invalid_response", message: `expected ${expectContentType}` });
  }
  return { status, contentType, text };
}
