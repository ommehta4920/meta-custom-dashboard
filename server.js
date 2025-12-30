const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CONFIG: Your n8n Webhook URL (Production URL)
const N8N_WEBHOOK_URL = 'https://primary-production-e873.up.railway.app/api/meta';

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Route 1: Serve the Dashboard HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route 2: API Proxy to n8n
// This prevents CORS issues by making the request server-to-server
app.post('/api/meta', async (req, res) => {
    try {
        console.log('POST data received from Meta / n8n');

        // If data is coming in body
        const data = req.body;

        // Just forward it to frontend
        res.json(data);
    } catch (error) {
        res.status(500).json({
            error: 'POST Meta API failed',
            details: error.message
        });
    }
});


app.listen(PORT, () => {
    console.log(`Visa CRM Dashboard running at http://localhost:${PORT}`);
});