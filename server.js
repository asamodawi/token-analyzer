// server.js
// Express server with proper rate limiting queue for Dexscreener API
// Prevents 429 (Too Many Requests) errors

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const DEXSCREENER_API = 'https://api.dexscreener.com/latest';

// Request queue and rate limiting
const requestQueue = [];
let isProcessing = false;
const RATE_LIMIT_DELAY = 1000; // 1 second between requests to Dexscreener
const REQUEST_TIMEOUT = 15000;

// Cache with longer TTL
const cache = new Map();
const CACHE_TTL = 60000; // 60 seconds

function getCacheKey(url) {
    return url;
}

function getCached(key) {
    if (!cache.has(key)) return null;
    const item = cache.get(key);
    if (Date.now() - item.time > CACHE_TTL) {
        cache.delete(key);
        return null;
    }
    return item.data;
}

function setCached(key, data) {
    cache.set(key, { data, time: Date.now() });
}

// Queue-based request processor
async function processQueue() {
    if (isProcessing || requestQueue.length === 0) return;
    
    isProcessing = true;
    
    while (requestQueue.length > 0) {
        const { url, resolve, reject } = requestQueue.shift();
        
        try {
            console.log(`[QUEUE] Processing: ${url}`);
            const response = await axios.get(url, { timeout: REQUEST_TIMEOUT });
            resolve(response.data);
        } catch (error) {
            console.error(`[QUEUE ERROR] ${url}: ${error.message}`);
            reject(error);
        }
        
        // Wait before next request
        if (requestQueue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
    }
    
    isProcessing = false;
}

function queueRequest(url) {
    return new Promise((resolve, reject) => {
        // Check cache first
        const cached = getCached(url);
        if (cached) {
            console.log(`[CACHE HIT] ${url}`);
            return resolve(cached);
        }
        
        requestQueue.push({ url, resolve, reject });
        console.log(`[QUEUED] ${url} (queue size: ${requestQueue.length})`);
        processQueue();
    });
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'Server running',
        queueSize: requestQueue.length,
        cacheSize: cache.size,
        timestamp: new Date() 
    });
});

// Proxy: Get pairs by chainId and pairId
app.get('/pairs/:chainId/:pairId', async (req, res) => {
    try {
        const { chainId, pairId } = req.params;
        const url = `${DEXSCREENER_API}/dex/pairs/${chainId}/${pairId}`;
        
        const data = await queueRequest(url);
        setCached(getCacheKey(url), data);
        res.json(data);
    } catch (error) {
        console.error('Error fetching pair:', error.message);
        res.status(500).json({ error: `Failed to fetch pair: ${error.message}` });
    }
});

// Proxy: Search pairs
app.get('/search', async (req, res) => {
    try {
        const { q, chainId } = req.query;
        const searchQuery = q || '*';
        
        let url = `${DEXSCREENER_API}/dex/search?q=${encodeURIComponent(searchQuery)}`;
        if (chainId) {
            url += `&chainId=${chainId}`;
        }
        
        console.log(`[SEARCH] Query: ${searchQuery}, Chain: ${chainId || 'all'}`);
        const data = await queueRequest(url);
        
        setCached(getCacheKey(url), data);
        res.json(data);
    } catch (error) {
        console.error('Error searching:', error.message);
        res.status(500).json({ 
            error: `Search failed: ${error.message}`,
            query: req.query.q
        });
    }
});

// Proxy: Get top tokens by volume for a chain
app.get('/top-tokens/:chainId', async (req, res) => {
    try {
        const { chainId } = req.params;
        const url = `${DEXSCREENER_API}/dex/search?chainId=${chainId}`;
        
        const data = await queueRequest(url);
        
        // Sort by volume and limit to top 20
        const pairs = (data.pairs || [])
            .filter(p => p.volume?.h24 > 0 && p.priceUsd)
            .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
            .slice(0, 20);
        
        const result = { pairs, chainId, count: pairs.length };
        setCached(getCacheKey(url), result);
        res.json(result);
    } catch (error) {
        console.error('Error fetching top tokens:', error.message);
        res.status(500).json({ error: `Failed to load top tokens: ${error.message}` });
    }
});

// Proxy: Get token profiles (trending)
app.get('/token-profiles/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const url = `${DEXSCREENER_API}/../token-profiles/${type}/v1`;
        
        const data = await queueRequest(url);
        setCached(getCacheKey(url), data);
        res.json(data);
    } catch (error) {
        console.error('Error fetching token profiles:', error.message);
        res.status(500).json({ error: `Failed to fetch profiles: ${error.message}` });
    }
});

// Proxy: Get token boosts (trending tokens)
app.get('/token-boosts/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const url = `${DEXSCREENER_API}/../token-boosts/${type}/v1`;
        
        const data = await queueRequest(url);
        setCached(getCacheKey(url), data);
        res.json(data);
    } catch (error) {
        console.error('Error fetching token boosts:', error.message);
        res.status(500).json({ error: `Failed to fetch boosts: ${error.message}` });
    }
});

// Serve frontend HTML
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.use(express.static('.'));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Proxy server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`⏱️  Rate limit: 1 second between Dexscreener API calls`);
    console.log(`💾 Cache TTL: 60 seconds`);
});
