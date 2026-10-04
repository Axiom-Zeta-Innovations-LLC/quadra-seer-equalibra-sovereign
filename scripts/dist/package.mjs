#!/usr/bin/env node
/**
 * Quadra-Seer Sovereign — package a watermarked bundle for one customer.
 *
 * Verifies the license key, stamps the bundle with a watermark derived from
 * the key (traceable per customer), and zips it for delivery.
 *
 *   node scripts/dist/package.mjs --license "QS1.…" --out quadra-seer-<customer>.zip
 *
 * Requires: dist-package/ built via scripts/dist/build.mjs, and
 * license-public.pem (or QS_LICENSE_PUBLIC_KEY) to verify the key.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadPublicKey, verifyLicense } from "../license/lib.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const die = (msg) => { console.error(`error: ${msg}`); process.exit(1); };

const license = flag("--license") || die("--license is required");
const out = resolve(flag("--out") || "quadra-seer-licensed.zip");
const distPkg = join(process.cwd(), "dist-package");
if (!existsSync(distPkg)) die("dist-package/ not found — run scripts/dist/build.mjs first");

let pubPem = process.env.QS_LICENSE_PUBLIC_KEY?.replace(/\\n/g, "\n");
for (const p of ["./license-public.pem", "./scripts/license/license-public.pem"]) {
  if (!pubPem && existsSync(p)) pubPem = readFileSync(p, "utf8");
}
if (!pubPem) die("no public key — place license-public.pem in repo root or scripts/license/");

const check = verifyLicense(license, loadPublicKey(pubPem));
if (!check.ok || !check.valid) die("license key is invalid or expired — refusing to package");

const email = check.payload.email;
const licenseId = createHash("sha256").update(license.trim()).digest("hex").slice(0, 16);
const watermark = createHash("sha256").update(`${licenseId}:${email}`).digest("hex").slice(0, 16);

const tmp = mkdtempSync(join(tmpdir(), "qs-pkg-"));
const stage = join(tmp, "quadra-seer-sovereign");
cpSync(distPkg, stage, { recursive: true });

// Stamp watermark: bundle token, WATERMARK.json, and a manifest file.
for (const rel of ["server.bundle.cjs", "WATERMARK.json"]) {
  const p = join(stage, rel);
  if (existsSync(p)) writeFileSync(p, readFileSync(p, "utf8").split("__QS_WATERMARK__").join(watermark));
}
writeFileSync(join(stage, "WATERMARK.txt"),
  ["Quadra-Seer Sovereign — licensed bundle", `licenseId: ${licenseId}`, `watermark: ${watermark}`,
   `issuedTo: ${email}`, `issuedAt: ${new Date().toISOString()}`, "",
   "This bundle is watermarked to the license above. Redistribution violates the EULA.",
  ].join("\n"));

// Zip it via a temp python script (avoids shell-quoting issues).
const zipPy = join(tmp, "make_zip.py");
writeFileSync(zipPy,
  `import shutil\nshutil.make_archive(${JSON.stringify(join(tmp, "bundle"))}, "zip", ${JSON.stringify(stage)})\n`);
execSync(`python3 ${JSON.stringify(zipPy)}`);
execSync(`mv ${JSON.stringify(join(tmp, "bundle.zip"))} ${JSON.stringify(out)}`);
rmSync(tmp, { recursive: true, force: true });

console.log(`packaged → ${out}`);
console.log(`  licenseId: ${licenseId}  watermark: ${watermark}  issuedTo: ${email}`);
