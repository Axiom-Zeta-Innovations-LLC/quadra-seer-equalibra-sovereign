#!/usr/bin/env node
/**
 * Quadra-Seer Sovereign — license key minting & verification.
 *
 * Keys are Ed25519-signed payloads, verified offline inside the app with the
 * embedded public key. No license server, no phone-home — sovereign licensing
 * for a sovereign product.
 *
 *   node scripts/license/mint.mjs --init
 *       Generate a keypair (license-private.pem / license-public.pem).
 *       NEVER commit license-private.pem.
 *
 *   node scripts/license/mint.mjs --mint --email customer@example.com [--months 1] [--key ./license-private.pem]
 *       Print a license key for the customer.
 *
 *   node scripts/license/mint.mjs --verify --license "QS1...." --public ./license-public.pem
 *       Verify a key and print its payload.
 *
 * Requires Node 18+.
 */
import { generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const has = (name) => args.includes(name);
const die = (msg) => { console.error(`error: ${msg}`); process.exit(1); };

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => Buffer.from(s, "base64url");

if (has("--init")) {
  const privPath = flag("--out-private") || "./license-private.pem";
  const pubPath = flag("--out-public") || "./license-public.pem";
  if (existsSync(privPath) && !has("--force")) die(`${privPath} exists — pass --force to overwrite`);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const pubPem = publicKey.export({ type: "spki", format: "pem" });
  writeFileSync(privPath, privPem, { mode: 0o600 });
  chmodSync(privPath, 0o600);
  writeFileSync(pubPath, pubPem);
  console.log(`private key → ${privPath}  (KEEP SECRET — never commit)`);
  console.log(`public key  → ${pubPath}  (embed in the app for offline verification)`);
  process.exit(0);
}

if (has("--mint")) {
  const email = flag("--email") || die("--email is required");
  const months = parseInt(flag("--months") || "1", 10);
  if (!Number.isFinite(months) || months < 1) die("--months must be a positive integer");
  const keyPath = flag("--key") || "./license-private.pem";
  if (!existsSync(keyPath)) die(`private key not found at ${keyPath} — run --init first`);
  const privateKey = createPrivateKey(readFileSync(keyPath, "utf8"));

  const now = new Date();
  const exp = new Date(now);
  exp.setMonth(exp.getMonth() + months);
  const payload = {
    v: 1,
    product: "quadra-seer-sovereign",
    plan: "monthly",
    email: email.toLowerCase().trim(),
    iat: now.toISOString(),
    exp: exp.toISOString(),
  };
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = sign(null, payloadBytes, privateKey);
  const license = `QS1.${b64u(payloadBytes)}.${b64u(sig)}`;
  console.log(license);
  console.error(`\nissued to ${payload.email}, valid until ${payload.exp}`);
  process.exit(0);
}

if (has("--verify")) {
  const license = flag("--license") || die("--license is required");
  const pubPath = flag("--public") || "./license-public.pem";
  if (!existsSync(pubPath)) die(`public key not found at ${pubPath}`);
  const publicKey = createPublicKey(readFileSync(pubPath, "utf8"));
  const parts = license.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "QS1") die("malformed license key");
  const payloadBytes = unb64u(parts[1]);
  const sig = unb64u(parts[2]);
  let payload;
  try { payload = JSON.parse(payloadBytes.toString("utf8")); }
  catch { die("payload is not valid JSON"); }
  const okSig = verify(null, payloadBytes, publicKey, sig);
  const okExp = new Date(payload.exp) > new Date();
  console.log(JSON.stringify({ valid: okSig && okExp, signatureOk: okSig, notExpired: okExp, payload }, null, 2));
  process.exit(okSig && okExp ? 0 : 1);
}

console.error("usage: mint.mjs --init | --mint --email <email> [--months N] | --verify --license <key>");
process.exit(1);
