#!/usr/bin/env node
/**
 * Quadra-Seer Sovereign — build the distributable bundle (no source code).
 *
 * Produces dist-package/ containing ONLY built artifacts:
 *   frontend/            vite build output (minified JS/CSS, no .tsx source)
 *   server.bundle.cjs    esbuild-minified Node server (no server.js source)
 *   python/              compiled .pyc files (no .py source, except license_check.py)
 *   docker/              distribution Dockerfiles + compose (no repo Dockerfiles)
 *   scripts/license/     lib.mjs + activate.mjs (customer activation CLI)
 *   EULA.md, README-DIST.md, WATERMARK.json (placeholder, stamped at package time)
 *
 * Usage: node scripts/dist/build.mjs [--skip-frontend]
 */
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "dist-package");
const log = (m) => console.log(`[dist] ${m}`);
const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });

const skipFrontend = process.argv.includes("--skip-frontend");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1. Frontend — vite build (minified, no source)
if (!skipFrontend) {
  log("building frontend (vite)…");
  run("npm run build");
  cpSync(join(ROOT, "dist"), join(OUT, "frontend"), { recursive: true });
} else {
  log("skipping frontend build");
}

// 2. Node server — esbuild bundle, minified
log("bundling server.js (esbuild, minified)…");
run("npx -y esbuild@0.24.2 server.js --bundle --minify --platform=node --format=cjs --outfile=dist-package/server.bundle.cjs --log-level=warning");
// Watermark token placeholder (package.mjs replaces it per customer)
{
  const p = join(OUT, "server.bundle.cjs");
  writeFileSync(p, readFileSync(p, "utf8") + '\nglobalThis.__QS_WATERMARK__="__QS_WATERMARK__";\n');
}

// 3. Python — compile to .pyc, strip source
log("compiling Python (no .py source shipped)…");
const PY_SRC = ["atlantean_backend.py", "atlantean_quadra_bridge.py", "event_normalization.py"];
const PY_DIRS = ["atlantean_core", "hrm"];
const pyOut = join(OUT, "python");
mkdirSync(pyOut, { recursive: true });
for (const f of PY_SRC) cpSync(join(ROOT, f), join(pyOut, f));
for (const d of PY_DIRS) cpSync(join(ROOT, d), join(pyOut, d), { recursive: true });
// license check stays readable (verification logic; security is in the signature)
cpSync(join(ROOT, "scripts", "license", "license_check.py"), join(pyOut, "license_check.py"));
run(`python3 -m compileall -b -q "${pyOut}"`);
// delete .py sources, keep license_check.py (readable; security is in the signature)
run(`find "${pyOut}" -name "*.py" ! -name "license_check.py" -delete`);

// 4. Distribution Docker files + compose + nginx + requirements
log("copying distribution container files…");
cpSync(join(ROOT, "scripts", "dist", "docker"), join(OUT, "docker"), { recursive: true });
cpSync(join(ROOT, "nginx.conf"), join(OUT, "docker", "nginx.conf"));
cpSync(join(ROOT, "requirements.txt"), join(OUT, "docker", "requirements.txt"));

// 5. License tooling for the customer (activate CLI; NO private keys)
mkdirSync(join(OUT, "scripts", "license"), { recursive: true });
for (const f of ["lib.mjs", "activate.mjs"]) {
  cpSync(join(ROOT, "scripts", "license", f), join(OUT, "scripts", "license", f));
}
if (existsSync(join(ROOT, "scripts", "license", "license-public.pem"))) {
  cpSync(join(ROOT, "scripts", "license", "license-public.pem"), join(OUT, "license-public.pem"));
} else if (existsSync(join(ROOT, "license-public.pem"))) {
  cpSync(join(ROOT, "license-public.pem"), join(OUT, "license-public.pem"));
} else {
  writeFileSync(join(OUT, "LICENSE-PUBLIC-KEY-MISSING.txt"),
    "license-public.pem was not present at build time.\nPlace the public key here before distributing, or set QS_LICENSE_PUBLIC_KEY.\n");
}

// 6. Legal + docs + watermark placeholder
cpSync(join(ROOT, "EULA.md"), join(OUT, "EULA.md"));
cpSync(join(ROOT, "scripts", "dist", "docker", "README-DIST.md"), join(OUT, "README.md"));
writeFileSync(join(OUT, "WATERMARK.json"), JSON.stringify({ watermark: "__QS_WATERMARK__" }, null, 2) + "\n");

log(`done → ${OUT}`);
log("next: node scripts/dist/package.mjs --license \"QS1…\" --out quadra-seer-licensed.zip");
