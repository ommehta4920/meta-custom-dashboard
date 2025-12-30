const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// External Meta / n8n API (pull source)
const META_API_URL = 'https://primary-production-e873.up.railway.app/api/meta';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1️⃣ PUSH route (Webhook / n8n → your server)
app.post('/api/meta', (req, res) => {
    console.log('Incoming POST data received');

    // For now just acknowledge
    res.json({
        success: true,
        received: true
    });
});

// 2️⃣ PULL route (Dashboard → your server)
app.get('/api/meta', async (req, res) => {
    try {
        console.log('Fetching Meta Ads data...');

        const response = await axios.get(META_API_URL, {
            timeout: 15000
        });

        res.json(response.data);
    } catch (error) {
        console.error('Meta API fetch error:', error.message);
        res.status(500).json({
            error: 'Failed to fetch Meta Ads data',
            details: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Dashboard running at http://localhost:${PORT}`);
});
