
import express from 'express';
import { request as nodeRequest } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load local-first environment files so npm start works without manual mapping.
dotenv.config({ path: '.env.local' });
dotenv.config();


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// NODE_API_PORT is the dedicated var; PORT is kept for legacy compatibility.
const port = parseInt(process.env.NODE_API_PORT || process.env.PORT || '5000', 10);

// Python backend — matches VITE_ATLANTEAN_PROXY_TARGET in .env.local
const backendOrigin = process.env.VITE_ATLANTEAN_PROXY_TARGET || 'http://127.0.0.1:5001';
const _bu = new URL(backendOrigin);
const backendHost = _bu.hostname;
const backendPort = parseInt(_bu.port || '5001', 10);

// Transparent proxy — streams SSE and chunked responses without buffering
function proxyToBackend(req, res) {
    const headers = { ...req.headers, host: `${backendHost}:${backendPort}` };
    const proxyReq = nodeRequest(
        { hostname: backendHost, port: backendPort, path: req.url, method: req.method, headers },
        (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
        }
    );
    proxyReq.on('error', () => {
        if (!res.headersSent) res.status(502).json({ error: 'Backend unavailable' });
    });
    req.pipe(proxyReq, { end: true });
}

// Proxy Python backend routes BEFORE body-parsing middleware
app.all('/api/atlantean', proxyToBackend);
app.all('/api/atlantean/*', proxyToBackend);
app.all('/health', proxyToBackend);

// --- Middleware for local routes ---
app.use(express.json({ limit: '10mb' }));

// --- API Key and Service Initialization ---
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
const allowOutboundNetwork = process.env.ALLOW_OUTBOUND_NETWORK === '1';


// --- API Endpoints ---

/**
 * REMOVED — Gemini-only /api/chat endpoint deleted.
 * Use POST /api/atlantean/query (Python backend) instead.
 */
app.post('/api/chat', (_req, res) => {
    res.status(410).json({
        error: 'Gone',
        message: '/api/chat has been removed. Use POST /api/atlantean/query (Python backend).'
    });
});


/**
 * Endpoint for Text-to-Speech using ElevenLabs.
 */
app.post('/api/tts', async (req, res) => {
    const { text } = req.body;
    const voiceId = "21m00Tcm4TlvDq8ikWAM"; // Example voice
    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;

    if (!allowOutboundNetwork) {
        return res.status(403).json({
            error: 'ElevenLabs TTS is disabled in sovereign/offline mode (ALLOW_OUTBOUND_NETWORK=0). Use local Piper TTS via the Python backend.'
        });
    }

    if (!elevenLabsApiKey || elevenLabsApiKey === 'mock_key') {
         console.warn("TTS request failed: ELEVENLABS_API_KEY not configured on server.");
         return res.status(400).json({ error: 'TTS service is not configured.' });
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': elevenLabsApiKey,
            },
            body: JSON.stringify({
                text: text,
                model_id: 'eleven_turbo_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs API request failed: ${response.statusText}`);
        }

        res.setHeader('Content-Type', 'audio/mpeg');
        response.body.pipe(res);

    } catch (error) {
        console.error("Error in /api/tts:", error);
        res.status(500).json({ error: 'Failed to generate speech.' });
    }
});

/**
 * REMOVED — Gemini-only /api/summarize endpoint deleted.
 */
app.post('/api/summarize', (_req, res) => {
    res.status(410).json({
        error: 'Gone',
        message: '/api/summarize has been removed. Summarize via /api/atlantean/query.'
    });
});

// --- Serve built frontend ---
const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir));
// SPA fallback — send index.html for any route React Router handles
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

// --- Server Start ---
app.listen(port, '127.0.0.1', () => {
    console.log(`Atlantean running at http://127.0.0.1:${port}`);
});
