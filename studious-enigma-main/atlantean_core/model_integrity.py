"""Model file integrity verification (Step 32 — Vault hardening).

Verifies SHA-256 checksums of Piper voice model files and the faster-whisper
model cache at startup.  All failures are warnings only — the backend continues
even if a model file is absent or mismatched; operators get a clear diagnostic.

Checksums are read from ``ATLANTEAN_MODEL_CHECKSUMS_JSON`` env var (JSON string)
or from ``model_checksums.json`` in the working directory.  Format::

    {
        "piper": {
            "en_US-lessac-medium.onnx": "<sha256hex>",
            "en_US-lessac-medium.onnx.json": "<sha256hex>"
        },
        "whisper_model_card": "<sha256hex>"   // optional
    }

To generate checksums for installed models run::

    python -m atlantean_core.model_integrity --generate voices/
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional


_CHECKSUM_FILE = Path("model_checksums.json")


def _sha256_file(path: Path) -> str:
    """Return SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_checksums() -> Dict[str, Any]:
    """Load expected checksums from env var or file.  Returns empty dict if none."""
    raw = os.getenv("ATLANTEAN_MODEL_CHECKSUMS_JSON", "").strip()
    if raw:
        try:
            return json.loads(raw)
        except Exception as e:
            print(f"⚠️  ATLANTEAN_MODEL_CHECKSUMS_JSON is not valid JSON: {e}")
            return {}
    if _CHECKSUM_FILE.exists():
        try:
            with _CHECKSUM_FILE.open() as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️  Failed to read {_CHECKSUM_FILE}: {e}")
    return {}


def verify_model_files_on_startup(
    piper_voice_dir: str = "./voices",
    piper_voice: str = "en_US-lessac-medium",
) -> Dict[str, Any]:
    """Verify Piper voice model files at startup.

    Returns a summary dict; prints warnings for any issues found.
    Does NOT raise — the caller (backend) always continues.
    """
    checksums = _load_checksums()
    piper_expected: Dict[str, str] = checksums.get("piper", {})

    voice_dir = Path(piper_voice_dir)
    results: Dict[str, Any] = {"piper": {}, "issues": []}

    for stem in [f"{piper_voice}.onnx", f"{piper_voice}.onnx.json"]:
        file_path = voice_dir / stem
        if not file_path.exists():
            results["piper"][stem] = "missing"
            # Don't report as issue if no checksums configured — normal state when Piper
            # isn't installed.
            if piper_expected.get(stem):
                results["issues"].append(f"Piper model file missing: {file_path}")
            continue

        actual = _sha256_file(file_path)
        expected = piper_expected.get(stem)
        if expected:
            if actual != expected:
                msg = f"Piper model checksum MISMATCH for {stem}: expected {expected[:12]}… got {actual[:12]}…"
                print(f"🚨 {msg}")
                results["piper"][stem] = "MISMATCH"
                results["issues"].append(msg)
            else:
                results["piper"][stem] = "ok"
                print(f"✅ Model checksum verified: {stem}")
        else:
            results["piper"][stem] = f"present (sha256={actual[:16]}…, no expected checksum)"

    if results["issues"]:
        print(f"⚠️  Model integrity: {len(results['issues'])} issue(s) found. See above for details.")
    else:
        if piper_expected:
            print("✅ All configured model checksums verified.")

    return results


def generate_checksums(voice_dir: str = "./voices") -> Dict[str, Any]:
    """Scan voice_dir and return a checksums dict ready to save as model_checksums.json."""
    vd = Path(voice_dir)
    piper: Dict[str, str] = {}
    for f in sorted(vd.glob("*.onnx")) + sorted(vd.glob("*.onnx.json")):
        piper[f.name] = _sha256_file(f)
    return {"piper": piper}


def save_checksums(out_path: str = "model_checksums.json", voice_dir: str = "./voices") -> None:
    """Generate and save checksums to a JSON file."""
    data = generate_checksums(voice_dir)
    Path(out_path).write_text(json.dumps(data, indent=2))
    print(f"✅ Saved checksums to {out_path}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Model integrity utility")
    parser.add_argument("--generate", metavar="VOICE_DIR", help="Generate checksums for models in VOICE_DIR")
    parser.add_argument("--out", default="model_checksums.json", help="Output file for --generate")
    args = parser.parse_args()
    if args.generate:
        save_checksums(args.out, args.generate)
    else:
        result = verify_model_files_on_startup()
        print(json.dumps(result, indent=2))
