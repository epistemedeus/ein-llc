import { compactVerify, decodeProtectedHeader, importJWK } from 'jose';
import { FIXTURE_TYPE, JWKS_PATH, KID_PATTERN, LETTER_TYPE, TOKEN_LIMIT, publicJwks, validInstant, validSignedManifest } from './authority-letter-profile.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const cacheMaxAge = 300000;
const cooldown = 30000;
const responseLimit = 65536;
const statuses = ['active', 'pending', 'expired', 'revoked', 'replaced'];

function trustedOrigin(value, allowLoopback) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.href !== `${url.origin}/` ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback && allowLoopback))) throw new Error('invalid_origin');
  return url.origin;
}

async function getJson(url, status) {
  const response = await fetch(url, {
    redirect: 'error', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(5000),
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
  });
  if (!response.ok || Number(response.headers.get('content-length')) > responseLimit ||
      !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') ||
      (status && (!/\bno-store\b/i.test(response.headers.get('cache-control') ?? '') ||
        Number(response.headers.get('age')) > 0))) {
    await response.body?.cancel();
    throw new Error('unusable_response');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > responseLimit) { await reader.cancel(); throw new Error('oversized_response'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(decoder.decode(Buffer.concat(chunks)));
}

function readHeader(token, fixture) {
  if (typeof token !== 'string' || token.length > TOKEN_LIMIT || !/^[A-Za-z0-9_-]{1,1024}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/.test(token)) throw new Error('invalid_token');
  const [encoded] = token.split('.', 1);
  const raw = decoder.decode(Buffer.from(encoded, 'base64url'));
  const header = decodeProtectedHeader(token);
  if (Object.keys(header).length !== 3 || [...raw.matchAll(/"(?:alg|typ|kid)"\s*:/g)].length !== 3 ||
      header.alg !== 'ES256' || header.typ !== (fixture ? FIXTURE_TYPE : LETTER_TYPE) ||
      typeof header.kid !== 'string' || !KID_PATTERN.test(header.kid)) throw new Error('invalid_header');
  return header.kid;
}

function currentStatus(value, manifest, now) {
  if (!value || value.number !== manifest.id || value.startsOn !== manifest.validFrom || value.expiresOn !== manifest.validUntil ||
      !statuses.includes(value.status) || !validInstant(value.checkedAt) ||
      (value.status === 'revoked' ? !validInstant(value.revokedAt) : value.revokedAt !== null)) return 'unknown';
  const age = now - Date.parse(value.checkedAt);
  if (age > 60000 || age < -5000) return 'unknown';
  if (value.status === 'revoked' || value.status === 'replaced') return value.status;
  const today = new Date(now).toISOString().slice(0, 10);
  const expected = today < manifest.validFrom ? 'pending' : today > manifest.validUntil ? 'expired' : 'active';
  return value.status === expected ? expected : 'unknown';
}

export function createVerifier({ origin, jwks, offline = false, fixture = false, allowLoopback = false, clock = Date.now } = {}) {
  if ((!offline && !origin) || (offline && !jwks)) throw new Error('trusted_key_source_required');
  const base = origin === undefined ? null : trustedOrigin(origin, allowLoopback);
  const pinned = jwks === undefined ? null : structuredClone(publicJwks(jwks));
  let cached;
  let loading;
  let attemptedAt = -Infinity;

  async function findKey(kid) {
    const now = clock();
    if (pinned) return pinned.keys.find(key => key.kid === kid);
    if (cached && now - cached.at < cacheMaxAge) {
      const known = cached.keys.find(key => key.kid === kid);
      if (known || now - attemptedAt < cooldown) return known;
    }
    if (!loading && now - attemptedAt >= cooldown) {
      attemptedAt = now;
      loading = getJson(base + JWKS_PATH, false).then(publicJwks).then(({ keys }) => {
        cached = { keys, at: clock() };
      }).finally(() => { loading = undefined; });
    }
    if (loading) await loading;
    if (!cached || clock() - cached.at >= cacheMaxAge) throw new Error('keys_unavailable');
    return cached.keys.find(key => key.kid === kid);
  }

  return async function verifyLetter(token) {
    const result = { signature: 'invalid', schema: 'unknown', currentStatus: 'unknown', usable: false, fixture };
    let kid;
    try { kid = readHeader(token, fixture); } catch { return { ...result, reason: 'invalid_profile' }; }
    let key;
    try { key = await findKey(kid); } catch { return { ...result, signature: 'unknown', reason: 'keys_unavailable' }; }
    if (!key) return { ...result, reason: 'unknown_kid' };
    let verified;
    try { verified = await compactVerify(token, await importJWK(key, 'ES256'), { algorithms: ['ES256'] }); }
    catch { return { ...result, reason: 'signature_invalid' }; }
    result.signature = 'valid';
    let manifest;
    try { manifest = JSON.parse(decoder.decode(verified.payload)); } catch { /* A signature can cover malformed data. */ }
    if (!validSignedManifest(manifest)) return { ...result, schema: 'invalid', reason: 'invalid_manifest' };
    result.schema = 'valid';
    if (offline) return { ...result, reason: 'offline', manifest };
    try {
      const path = fixture ? '/fixtures/api/letters/' : '/api/letters/';
      const status = await getJson(base + path + manifest.id, true);
      result.currentStatus = currentStatus(status, manifest, clock());
    } catch { /* Integrity remains independently available. */ }
    result.usable = result.currentStatus === 'active' && !fixture;
    return { ...result, reason: result.currentStatus === 'unknown' ? 'status_unknown' : result.currentStatus, manifest };
  };
}
