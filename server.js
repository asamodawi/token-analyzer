// server.js
// Simple Express server to proxy Dexscreener API requests
// With rate limiting and caching to prevent 429 errors

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const DEXSCREENER_API = 'https://api.dexscreener.com/latest';

// Rate limiting and caching
const requestCache = new Map();
const CACHE_DURATION = 30000; // 30 seconds cache
const REQUEST_DELAY = 500; // 500ms between requests

let lastRequestTime = 0;

function getCacheKey(method, url) {
    return `${method}:${url}`;
}

function isCached(key) {
    if (!requestCache.has(key)) return false;
    const cached = requestCache.get(key);
    if (Date.now() - cached.timestamp > CACHE_DURATION) {
        requestCache.delete(key);
        return false;
    }
    return true;
}

function getFromCache(key) {
    return requestCache.get(key)?.data;
}

function setCache(key, data) {
    requestCache.set(key, { data, timestamp: Date.now() });
}

async function throttledRequest(url) {
    // Wait if requests are coming too fast
    const timeSinceLastRequest = Date.now() - lastRequestTime;
    if (timeSinceLastRequest < REQUEST_DELAY) {
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY - timeSinceLastRequest));
    }
    lastRequestTime = Date.now();
    return axios.get(url, { timeout: 10000 });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Server running', timestamp: new Date() });
});

// Proxy: Get pairs by chainId and pairId
app.get('/pairs/:chainId/:pairId', async (req, res) => {
  try {
    const { chainId, pairId } = req.params;
    const cacheKey = getCacheKey('GET', `/pairs/${chainId}/${pairId}`);
    
    if (isCached(cacheKey)) {
        console.log(`[CACHE HIT] pairs ${chainId}/${pairId}`);
        return res.json(getFromCache(cacheKey));
    }
    
    const response = await throttledRequest(
      `${DEXSCREENER_API}/dex/pairs/${chainId}/${pairId}`
    );
    
    setCache(cacheKey, response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching pair:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Proxy: Search pairs
app.get('/search', async (req, res) => {
  try {
    const { q, chainId } = req.query;
    const searchQuery = q || '*';
    const cacheKey = getCacheKey('GET', `/search?q=${searchQuery}&chainId=${chainId || ''}`);
    
    if (isCached(cacheKey)) {
        console.log(`[CACHE HIT] search ${searchQuery}`);
        return res.json(getFromCache(cacheKey));
    }
    
    let url = `${DEXSCREENER_API}/dex/search?q=${encodeURIComponent(searchQuery)}`;
    if (chainId) {
      url += `&chainId=${chainId}`;
    }
    
    const response = await throttledRequest(url);
    setCache(cacheKey, response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error searching:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Proxy: Get top tokens by volume for a chain
app.get('/top-tokens/:chainId', async (req, res) => {
  try {
    const { chainId } = req.params;
    const cacheKey = getCacheKey('GET', `/top-tokens/${chainId}`);
    
    if (isCached(cacheKey)) {
        console.log(`[CACHE HIT] top-tokens ${chainId}`);
        return res.json(getFromCache(cacheKey));
    }
    
    const response = await throttledRequest(
      `${DEXSCREENER_API}/dex/search?chainId=${chainId}`
    );
    
    // Sort by volume and limit to top 20
    const pairs = (response.data.pairs || [])
      .filter(p => p.volume?.h24 > 0 && p.priceUsd)
      .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
      .slice(0, 20);
    
    const result = { pairs };
    setCache(cacheKey, result);
    res.json(result);
  } catch (error) {
    console.error('Error fetching top tokens:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Proxy: Get token profiles (trending)
app.get('/token-profiles/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const cacheKey = getCacheKey('GET', `/token-profiles/${type}`);
    
    if (isCached(cacheKey)) {
        console.log(`[CACHE HIT] token-profiles ${type}`);
        return res.json(getFromCache(cacheKey));
    }
    
    const response = await throttledRequest(
      `${DEXSCREENER_API}/../token-profiles/${type}/v1`
    );
    
    setCache(cacheKey, response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching token profiles:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Proxy: Get token boosts (trending tokens)
app.get('/token-boosts/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const cacheKey = getCacheKey('GET', `/token-boosts/${type}`);
    
    if (isCached(cacheKey)) {
        console.log(`[CACHE HIT] token-boosts ${type}`);
        return res.json(getFromCache(cacheKey));
    }
    
    const response = await throttledRequest(
      `${DEXSCREENER_API}/../token-boosts/${type}/v1`
    );
    
    setCache(cacheKey, response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching token boosts:', error.message);
    res.status(500).json({ error: error.message });
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
});
