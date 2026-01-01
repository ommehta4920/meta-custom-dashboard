const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CONFIG: Your n8n Webhook URL (Production URL)
const N8N_WEBHOOK_URL = 'https://primary-production-e873.up.railway.app/webhook/meta-ads-data';

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
app.get('/api/ads', async (req, res) => {
    try {
        console.log('Syncing with n8n...');
        const response = await axios.get(N8N_WEBHOOK_URL, {
            timeout: 10000 // 10 second timeout
        });
        
        console.log('Data received from n8n');
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching data:', error.message);
        // Send a clean error to frontend
        res.status(500).json({ 
            error: 'Failed to fetch data',
            details: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Visa CRM Dashboard running at http://localhost:${PORT}`);
});