const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

let metaAdsData = []; // In-memory store for Meta ads data

// Middleware to handle CORS and JSON requests
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve dashboard (Optional: Uncomment if you want to serve the dashboard on the root URL)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// POST: n8n / Meta → server (Receives meta ads data from n8n)
app.post('/api/meta', (req, res) => {
    try {
        console.log('Meta data received:', req.body);
        metaAdsData = req.body; // Store received data in the in-memory store
        res.json({ success: true }); // Send success response
    } catch (error) {
        console.error('Error processing Meta data:', error);
        res.status(500).json({ success: false, message: 'Error processing data' });
    }
});

// GET: Dashboard → server (Fetch stored Meta ads data)
app.get('/api/ads', (req, res) => {
    try {
        if (metaAdsData.length === 0) {
            return res.status(404).json({ success: false, message: 'No data found' });
        }
        res.json(metaAdsData); // Send stored Meta ads data
    } catch (error) {
        console.error('Error fetching Meta data:', error);
        res.status(500).json({ success: false, message: 'Error fetching data' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Dashboard running at http://localhost:${PORT}`);
});
