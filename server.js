// server.js
// Express server with AGGRESSIVE rate limiting for Dexscreener API
// Uses 2-second delays and request deduplication

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const DEXSCREENER_API = 'https://api.dexscreener.com/latest';

// Aggressive rate limiting
let lastRequestTime = 0;
const RATE_LIMIT_DELAY = 2000; // 2 seconds between requests
const REQUEST_TIMEOUT = 20000;

// Cache with long TTL
const cache = new Map();
const CACHE_TTL = 120000; // 2 minutes

// In-flight requests to prevent duplicates
const inFlightRequests = new Map();

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
    console.log(`[CACHE HIT] ${key}`);
    return item.data;
}

function setCached(key, data) {
    cache.set(key, { data, time: Date.now() });
}

async function throttledRequest(url) {
    // Check cache first
    const cached = getCached(url);
    if (cached) {
        return cached;
    }
    
    // Check if request is already in flight
    if (inFlightRequests.has(url)) {
        console.log(`[IN-FLIGHT] Waiting for duplicate request: ${url}`);
        return inFlightRequests.get(url);
    }
    
    // Create promise for this request
    const requestPromise = (async () => {
        // Wait for rate limit
        const timeSinceLastRequest = Date.now() - lastRequestTime;
        const waitTime = Math.max(0, RATE_LIMIT_DELAY - timeSinceLastRequest);
        
        if (waitTime > 0) {
            console.log(`[WAIT] Waiting ${waitTime}ms before request to Dexscreener`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        lastRequestTime = Date.now();
        
        try {
            console.log(`[API CALL] ${url}`);
            const response = await axios.get(url, { 
                timeout: REQUEST_TIMEOUT,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            console.log(`[SUCCESS] ${url}`);
            setCached(getCacheKey(url), response.data);
            inFlightRequests.delete(url);
            return response.data;
        } catch (error) {
            inFlightRequests.delete(url);
            console.error(`[API ERROR] ${url}: ${error.response?.status || error.message}`);
            throw error;
        }
    })();
    
    // Store in-flight request
    inFlightRequests.set(url, requestPromise);
    return requestPromise;
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'Server running',
        cacheSize: cache.size,
        inFlightRequests: inFlightRequests.size,
        timestamp: new Date() 
    });
});

// Proxy: Get pairs by chainId and pairId
app.get('/pairs/:chainId/:pairId', async (req, res) => {
    try {
        const { chainId, pairId } = req.params;
        const url = `${DEXSCREENER_API}/dex/pairs/${chainId}/${pairId}`;
        
        const data = await throttledRequest(url);
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
        
        console.log(`[SEARCH REQUEST] Query: "${searchQuery}" Chain: ${chainId || 'all'}`);
        const data = await throttledRequest(url);
        
        res.json(data);
    } catch (error) {
        console.error('Error searching:', error.message);
        res.status(500).json({ 
            error: `Search failed: ${error.message}`,
            query: req.query.q,
            suggestion: 'Try waiting 30 seconds and searching again'
        });
    }
});

// Proxy: Get top tokens by volume for a chain
app.get('/top-tokens/:chainId', async (req, res) => {
    try {
        const { chainId } = req.params;
        const url = `${DEXSCREENER_API}/dex/search?chainId=${chainId}`;
        
        console.log(`[TOP TOKENS REQUEST] Chain: ${chainId}`);
        const data = await throttledRequest(url);
        
        // Sort by volume and limit to top 20
        const pairs = (data.pairs || [])
            .filter(p => p.volume?.h24 > 0 && p.priceUsd)
            .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
            .slice(0, 20);
        
        const result = { pairs, chainId, count: pairs.length };
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
        
        const data = await throttledRequest(url);
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
        
        const data = await throttledRequest(url);
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
    console.log(`⏱️  AGGRESSIVE Rate limit: 2 seconds between Dexscreener API calls`);
    console.log(`💾 Cache TTL: 120 seconds`);
    console.log(`🔄 Request deduplication: enabled`);
});
