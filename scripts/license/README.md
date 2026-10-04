# Quadra-Seer Sovereign — license fulfillment (Phase 1, manual)

## One-time setup

```bash
node scripts/license/mint.mjs --init
```

This creates `license-private.pem` (KEEP SECRET — never commit, never share)
and `license-public.pem` (safe to embed in the app later for offline verification).

Make sure `scripts/license/*.pem` stays out of git (see `.gitignore`).

## Fulfilling an order

1. Customer pays $14.99/mo via the Stripe payment link.
2. In the Stripe dashboard, confirm the payment and copy the customer's email.
3. Mint their key (valid 1 month per payment — re-mint on each renewal):

   ```bash
   node scripts/license/mint.mjs --mint --email customer@example.com --months 1
   ```

4. Email the customer:
   - the license key (the `QS1.…` string),
   - the download: a zip of this repo at the release commit
     (`git archive --format=zip -o quadraseer-v1.zip <commit>`),
   - a link to `DEPLOYMENT.md` → "Option A — run it on your machine".

## Verifying a key (support)

```bash
node scripts/license/mint.mjs --verify --license "QS1.…"
```

## Notes

- Keys are Ed25519-signed and expire. The app does not call home; verification
  happens offline against the embedded public key (Phase 3 wires this in).
- If a key leaks, mint a replacement and let the old one expire — or rotate the
  keypair with `--init --force` (invalidates ALL previously issued keys).
- Phase 2 will automate this: Stripe webhook → mint → email → download portal.
