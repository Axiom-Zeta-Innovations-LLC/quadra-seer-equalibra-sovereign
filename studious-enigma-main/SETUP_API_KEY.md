# Setup Gemini API Key (Cloud — Consent-Gated)

> ⚠️  **SECURITY NOTICE**
> The API key that was previously hard-coded in this file has been **revoked and
> must be treated as compromised**.  Never commit a real API key to this file.
> All real keys belong in `.env.local` (git-ignored) or in the Profile settings
> modal (stored in the browser's localStorage, never sent to source control).

Gemini is an **opt-in cloud provider**.  By default the app routes all inference
through the local Python backend.  To enable Gemini:

1. **Revoke any previously exposed key** at
   [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Generate a **new** API key.
3. Store it in the Profile modal **or** in `.env.local` (never commit that file):

## Add to Environment (never commit)

Edit `.env.local` (this file is git-ignored):

```bash
# .env.local — do NOT commit this file
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
```

Then restart the backend:

```bash
pkill -f "python.*atlantean_backend"
python atlantean_backend.py
```

## Verify Backend Has Key

Make sure the backend process has the key loaded:

```bash
# Check if key is set
echo $GEMINI_API_KEY

# Restart backend to pick up new key
pkill -f "python.*atlantean_backend"
python atlantean_backend.py
```

## Verify It's Working

When you chat, you should see:
- ✅ Real Gemini responses (not "This is a demo response")
- ✅ Intelligence state context in responses
- ✅ Learning signals being applied

## Current Status

Without API key: You'll see demo responses with intelligence field stats

With API key: Full Gemini AI responses powered by Atlantean Intelligence Core!
