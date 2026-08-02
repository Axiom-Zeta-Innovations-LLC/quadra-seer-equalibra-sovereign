
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load local-first environment files so npm start works without manual mapping.
dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const port = 3001;

// --- CORS Configuration ---
// Restrict CORS to specific origins (development and production)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173').split(',').map(o => o.trim());

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS policy: Origin ${origin} not allowed`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600 // Preflight cache duration in seconds
};

// --- Middleware ---
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Allow larger payloads for file uploads

// --- API Key and Service Initialization ---
// Gemini is a consent-gated cloud option — this server no longer requires it.
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
// Sovereign/offline mode disables all outbound API calls, including ElevenLabs.
const allowOutboundNetwork = process.env.ALLOW_OUTBOUND_NETWORK === '1';


// --- Basic Routes ---
app.get('/', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'Q.M.A.I. backend',
        message: 'Primary route: POST /api/atlantean/query (Python backend). Utilities: POST /api/tts (ElevenLabs). /api/chat and /api/summarize have been removed.'
    });
});

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});


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


// --- Server Start ---
app.listen(port, () => {
    console.log(`Q.M.A.I. backend server listening on port ${port}`);
});
