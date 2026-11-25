import Ajv2020 from 'ajv/dist/2020.js';
import schema from './einllc.agent-authority.v1.schema.json' with { type: 'json' };

export const LETTER_TYPE = 'einllc.agent-authority.v1+jws';
export const FIXTURE_TYPE = 'einllc.agent-authority.v1+fixture-jws';
export const TOKEN_LIMIT = 24576;
export const JWKS_PATH = '/.well-known/jwks.json';
export const SCHEMA_PATH = new URL(schema.$id).pathname;
export const SCHEMA_BYTES = JSON.stringify(schema, null, 2) + '\n';
export const KID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const COORDINATE = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
export const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const validDay = (value) => typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const validInstant = (value) => typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export const statusCheck = (id) => `https://ein.llc/letter?n=${id}`;

const ajv = new Ajv2020({ strict: true });
ajv.addFormat('date', validDay);
ajv.addFormat('date-time', validInstant);
ajv.addFormat('uri', (value) => URL.canParse(value));
const checkSchema = ajv.compile(schema);

export function validSignedManifest(value) {
  if (!checkSchema(value) || !value.signedBy.at || value.check !== statusCheck(value.id) ||
      !value.agent.name.trim() || !value.agent.reference.trim() || !value.may.length || value.validUntil < value.validFrom) return false;
  const end = new Date(`${value.validFrom}T00:00:00.000Z`);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  return Date.parse(value.validUntil) <= end.getTime();
}

export function publicJwks(value) {
  if (!isObject(value) || Object.keys(value).length !== 1 || !Array.isArray(value.keys) || !value.keys.length || value.keys.length > 32) throw new Error('invalid_jwks');
  const kids = new Set();
  for (const key of value.keys) {
    if (!isObject(key) || Object.keys(key).length !== 8 || key.kty !== 'EC' || key.crv !== 'P-256' ||
        key.alg !== 'ES256' || key.use !== 'sig' || !Array.isArray(key.key_ops) || key.key_ops.length !== 1 || key.key_ops[0] !== 'verify' ||
        typeof key.kid !== 'string' || !KID_PATTERN.test(key.kid) || kids.has(key.kid) ||
        typeof key.x !== 'string' || !COORDINATE.test(key.x) || typeof key.y !== 'string' || !COORDINATE.test(key.y)) throw new Error('invalid_jwks');
    kids.add(key.kid);
  }
  return value;
}
