/** SPDX-License-Identifier: MIT */

const HIDDEN = new Set([
  "claimurl",
  "claimtoken",
  "intendedemail",
  "preparebody",
  "customerkey",
  "customerkeyhash",
  "token",
  "authorization",
  "password",
  "secret",
  "grant",
  "granttoken",
]);

function hide(value) {
  if (Array.isArray(value)) return value.map(hide);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (HIDDEN.has(key.toLowerCase())) continue;
    out[key] = hide(item);
  }
  return out;
}

export function publicView(record, discovery, extra = {}, { showClaimUrl = false } = {}) {
  const phase = record?.phase ?? null;
  const status = record?.status ?? null;
  // Older callers persisted pending payments as paid. Readback must check the
  // observed application state and completion facts, not reuse stale booleans.
  const paid = status?.applicationStatus === "paid" && status.paid === true;
  const complete = paid && status.complete === true &&
    status.einIssued === true && status.nextAction == null;
  const view = {
    ok: extra.ok !== false,
    command: extra.command ?? null,
    apiOrigin: record?.apiOrigin ?? discovery?.apiOrigin ?? null,
    linkOrigin: record?.linkOrigin ?? discovery?.linkOrigin ?? null,
    taskId: record?.taskId ?? null,
    lane: record?.lane ?? null,
    phase,
    catalogSchema: record?.catalog?.schema ?? discovery?.catalogSchema ?? null,
    catalogVersion: record?.catalog?.catalogVersion ?? discovery?.catalogVersion ?? null,
    termsFingerprint: record?.catalog?.termsFingerprint ?? discovery?.termsFingerprint ?? null,
    capabilities: discovery?.capabilities ?? undefined,
    prerequisites: discovery?.prerequisites ?? undefined,
    humanClaim: discovery?.humanClaim ?? undefined,
    humanStep: discovery?.humanStep ?? undefined,
    offer: record?.assessment?.terminal || record?.phase === "assess_uncertain"
      ? null
      : discovery ? (discovery.offer ?? null) : (record?.offer ?? null),
    lanes: discovery?.lanes ?? undefined,
    assessment: record?.assessment
      ? {
          id: record.assessment.id ?? null,
          outcome: record.assessment.outcome ?? null,
          terminal: record.assessment.terminal === true,
          summary: record.assessment.summary ?? null,
          unknowns: record.assessment.unknowns ?? [],
          nextSteps: record.assessment.nextSteps ?? [],
          createsCheckout: false,
        }
      : null,
    applicationId: record?.applicationId ?? null,
    operationId: record?.operationId ?? null,
    declaredTransport: record?.declaredTransport ?? null,
    catalogTransport: record?.catalogTransport ?? null,
    uncertainCause: typeof record?.uncertain?.cause === "string" ? record.uncertain.cause : null,
    reviewUrl: record?.reviewUrl ?? null,
    claimLinkStored: typeof record?.claimUrl === "string" && record.claimUrl.length > 0,
    nextAction: extra.nextAction ?? record?.nextAction ?? null,
    server: record?.server
      ? {
          recovered: record.server.recovered ?? null,
          reconciled: record.server.reconciled ?? null,
          authorizedState: record.server.authorizedState ?? null,
          actionableAuthorized: record.server.actionableAuthorized === true,
          decisionBound: record.server.decisionBound === true,
        }
      : null,
    observedStatus: status
      ? {
          applicationStatus: status.applicationStatus ?? null,
          nextAction: status.nextAction ?? null,
          fulfillmentStatus: status.fulfillmentStatus ?? null,
          einIssued: status.einIssued === true,
          paid,
          complete,
          source: "grant_status",
        }
      : null,
    filingAuthorization: false,
    instantAgentCheckout: false,
    paid,
    complete,
    revenue: false,
    inferredFromClaimLink: false,
    autonomousMachinePurchase: "refused",
    continuation: record ? "stored" : "absent",
    ...hide(extra.public ?? {}),
  };
  if (showClaimUrl && typeof record?.claimUrl === "string") {
    view.claimUrl = record.claimUrl;
    view.handoffNotice =
      "claimUrl is shown because --show-claim-url was set. Forward it only to the intended human. A view is not a claim, payment, or filing attestation.";
  }
  return view;
}
