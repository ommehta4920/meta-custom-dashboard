const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CONFIG: Your n8n Webhook URLs (Production URLs)
const N8N_WEBHOOK_URL = 'https://primary-production-e873.up.railway.app/webhook/meta-ads-data';
const N8N_CAMPAIGN_WEBHOOK_URL = 'https://primary-production-e873.up.railway.app/webhook/meta-campaign';

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Route 1: Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Dashboard server is running',
        timestamp: new Date().toISOString()
    });
});

// Route 2: Serve the Dashboard HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route 3: Test n8n connection
app.get('/api/test-connection', async (req, res) => {
    try {
        console.log('Testing n8n connection...');
        console.log('Webhook URL:', N8N_WEBHOOK_URL);
        
        const response = await axios.get(N8N_WEBHOOK_URL, {
            timeout: 10000,
            validateStatus: () => true // Accept any status for testing
        });
        
        res.json({
            success: response.status < 400,
            status: response.status,
            statusText: response.statusText,
            webhookUrl: N8N_WEBHOOK_URL,
            message: response.status < 400 
                ? 'Connection successful' 
                : `Webhook returned status ${response.status}`,
            dataPreview: Array.isArray(response.data) 
                ? `Array with ${response.data.length} items` 
                : typeof response.data === 'object' 
                    ? `Object with keys: ${Object.keys(response.data).join(', ')}` 
                    : typeof response.data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            code: error.code,
            webhookUrl: N8N_WEBHOOK_URL,
            message: 'Failed to connect to n8n webhook'
        });
    }
});

// Route 4: API Proxy to n8n
// This prevents CORS issues by making the request server-to-server
app.get('/api/ads', async (req, res) => {
    try {
        console.log('Syncing with n8n...');
        console.log('Webhook URL:', N8N_WEBHOOK_URL);
        
        const response = await axios.get(N8N_WEBHOOK_URL, {
            timeout: 30000, // 30 second timeout
            validateStatus: function (status) {
                return status >= 200 && status < 500; // Accept 2xx and 4xx as valid responses
            }
        });
        
        if (response.status >= 400) {
            console.error('n8n returned error status:', response.status);
            return res.status(502).json({ 
                error: 'n8n webhook returned an error',
                status: response.status,
                details: response.data || 'No response data'
            });
        }
        
        console.log('Data received from n8n, status:', response.status);
        console.log('Response type:', typeof response.data);
        console.log('Is array:', Array.isArray(response.data));
        
        // Log first item structure for debugging
        if (Array.isArray(response.data) && response.data.length > 0) {
            console.log('First item keys:', Object.keys(response.data[0]));
            console.log('First item sample:', JSON.stringify(response.data[0]).substring(0, 200));
        }
        
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching data from n8n:');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.error('Connection refused - n8n server may be down');
            return res.status(503).json({ 
                error: 'Cannot connect to n8n webhook',
                details: 'The n8n server appears to be unreachable. Please check if the webhook URL is correct and the n8n service is running.',
                code: 'ECONNREFUSED'
            });
        }
        
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            console.error('Request timed out');
            return res.status(504).json({ 
                error: 'Request to n8n timed out',
                details: 'The n8n webhook did not respond in time. Please check if the service is available.',
                code: 'ETIMEDOUT'
            });
        }
        
        if (error.code === 'ENOTFOUND') {
            console.error('DNS resolution failed');
            return res.status(502).json({ 
                error: 'Invalid webhook URL',
                details: 'Could not resolve the n8n webhook hostname. Please check the URL configuration.',
                code: 'ENOTFOUND'
            });
        }
        
        // Send a clean error to frontend
        res.status(500).json({ 
            error: 'Failed to fetch data from n8n',
            details: error.message,
            code: error.code || 'UNKNOWN'
        });
    }
});

// Route 5: API Proxy to n8n for Campaign Data
app.get('/api/campaigns', async (req, res) => {
    try {
        console.log('Syncing campaign data from n8n...');
        console.log('Campaign Webhook URL:', N8N_CAMPAIGN_WEBHOOK_URL);
        
        const response = await axios.get(N8N_CAMPAIGN_WEBHOOK_URL, {
            timeout: 30000, // 30 second timeout
            validateStatus: function (status) {
                return status >= 200 && status < 500;
            }
        });
        
        if (response.status >= 400) {
            console.error('n8n returned error status:', response.status);
            return res.status(502).json({ 
                error: 'n8n webhook returned an error',
                status: response.status,
                details: response.data || 'No response data'
            });
        }
        
        console.log('Campaign data received from n8n, status:', response.status);
        console.log('Response type:', typeof response.data);
        
        // Handle response structure - check if data is wrapped in {data: [...]}
        let campaignData = response.data;
        if (campaignData && campaignData.data && Array.isArray(campaignData.data)) {
            campaignData = campaignData.data;
        } else if (!Array.isArray(campaignData)) {
            campaignData = [campaignData];
        }
        
        // Log first item structure for debugging
        if (Array.isArray(campaignData) && campaignData.length > 0) {
            console.log('First campaign item keys:', Object.keys(campaignData[0]));
            console.log('First campaign sample:', JSON.stringify(campaignData[0]).substring(0, 200));
        }
        
        res.json(campaignData);
    } catch (error) {
        console.error('Error fetching campaign data from n8n:');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            return res.status(503).json({ 
                error: 'Cannot connect to n8n campaign webhook',
                details: 'The n8n server appears to be unreachable.',
                code: 'ECONNREFUSED'
            });
        }
        
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            return res.status(504).json({ 
                error: 'Request to n8n timed out',
                details: 'The n8n webhook did not respond in time.',
                code: 'ETIMEDOUT'
            });
        }
        
        if (error.code === 'ENOTFOUND') {
            return res.status(502).json({ 
                error: 'Invalid webhook URL',
                details: 'Could not resolve the n8n webhook hostname.',
                code: 'ENOTFOUND'
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to fetch campaign data from n8n',
            details: error.message,
            code: error.code || 'UNKNOWN'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Visa CRM Dashboard running at http://localhost:${PORT}`);
});
