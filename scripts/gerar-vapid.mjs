// Gera um par de chaves VAPID (ECDSA P-256) pro Web Push (PUSH-A).
// Uso: node scripts/gerar-vapid.mjs
// Cole a saída em .env (dev) e em `wrangler secret put VAPID_PRIVATE_KEY`
// + wrangler.toml/dashboard (PUBLIC_VAPID_PUBLIC_KEY, não é segredo) em prod.
import { generateKeyPairSync } from 'node:crypto';

function bufToB64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBuf(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pubJwk = publicKey.export({ format: 'jwk' });
const privJwk = privateKey.export({ format: 'jwk' });

const x = b64urlToBuf(pubJwk.x);
const y = b64urlToBuf(pubJwk.y);
const ponto = Buffer.concat([Buffer.from([0x04]), x, y]); // ponto não-comprimido, 65 bytes

console.log(`PUBLIC_VAPID_PUBLIC_KEY=${bufToB64url(ponto)}`);
console.log(`VAPID_PRIVATE_KEY=${privJwk.d}`);
