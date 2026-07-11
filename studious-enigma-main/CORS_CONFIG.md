# CORS Configuration Guide

## Overview

CORS (Cross-Origin Resource Sharing) is now restricted to specific origins on both backends to prevent unauthorized cross-site requests.

## Development Setup

### Default Allowed Origins (Development)
By default, the following origins are allowed:
- `http://localhost:3000` — Vite frontend dev server
- `http://127.0.0.1:3000` — Localhost fallback
- `http://localhost:5173` — Alternative Vite port
- `http://127.0.0.1:5173` — Alternative localhost

No additional configuration needed for local development.

## Production Setup

### Override for Production

Set the `ALLOWED_ORIGINS` environment variable before starting the servers:

```bash
# For docker-compose or systemd:
export ALLOWED_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"

# Then start the app:
./start.sh local
```

### Docker Compose Production

Update `.env.local` or `.env` to include:

```bash
# .env.local or .env
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

Then in `docker-compose.yml`, both backend and frontend will inherit this variable:

```yaml
backend:
  environment:
    ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-}

frontend:
  environment:
    ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-}
```

## Security Notes

1. **HTTPS in Production**: Always use `https://` origins in production, never `http://`
2. **Specific Origins**: Never use wildcards (`*`) in production
3. **Credentials**: CORS credentials are enabled (`credentials: true`), restricting by origin is critical
4. **Preflight Cache**: Responses are cached for 3600 seconds (1 hour) to reduce preflight requests

## Troubleshooting

If you see a CORS error in the browser console:

```
CORS policy: Origin ... not allowed
```

1. Check that your frontend origin matches exactly (including protocol and port)
2. Verify `ALLOWED_ORIGINS` is set correctly on the backend
3. Restart the backend after changing environment variables
4. For development, ensure you're accessing from `http://localhost:3000` (not IP address)

## Current Configuration

**Express Server** (`server.js`):
- Validates origin against whitelist before allowing request
- Returns 200 + `Access-Control-Allow-Origin` header only for allowed origins
- Blocks preflight requests from disallowed origins

**Flask Server** (`atlantean_backend.py`):
- Same whitelist mechanism
- Also enforces on `flask_cors` decorator level

Both respect the `ALLOWED_ORIGINS` environment variable.
