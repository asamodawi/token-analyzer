// server.js - Using ScraperAPI to proxy Dexscreener (bypasses IP blocks)

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

// Cache responses
const cache = new Map();
const CACHE_TTL = 180000; // 3 minutes

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

async function makeDexscreenerRequest(url) {
    const cacheKey = url;
    const cached = getCached(cacheKey);
    if (cached) {
        console.log(`[CACHE HIT]`);
        return cached;
    }

    try {
        console.log(`[DEXSCREENER API]`);
        // Direct call to Dexscreener - simple and no IP block issues if we wait
        const response = await axios.get(url, {
            timeout: 25000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        setCached(cacheKey, response.data);
        return response.data;
    } catch (error) {
        console.error(`[ERROR] ${error.response?.status || error.message}`);
        throw error;
    }
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'Running', cache: cache.size });
});

// Search endpoint - exact symbol search only
app.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json({ pairs: [] });
        
        console.log(`[SEARCH] "${q}"`);
        
        // Search by exact symbol (no wildcard)
        const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
        const data = await makeDexscreenerRequest(url);
        
        // Filter to only exact symbol matches
        const pairs = (data.pairs || []).filter(p => 
            p.baseToken?.symbol?.toUpperCase() === q.toUpperCase()
        );
        
        console.log(`[SEARCH] Found ${pairs.length} exact matches`);
        res.json({ pairs });
    } catch (error) {
        console.error('Search error:', error.message);
        res.status(500).json({ error: error.message, pairs: [] });
    }
});

// Top tokens by volume
app.get('/top-tokens/:chainId', async (req, res) => {
    try {
        const { chainId } = req.params;
        console.log(`[TOP TOKENS] ${chainId}`);
        
        // Get all pairs for chain
        const url = `https://api.dexscreener.com/latest/dex/search?chainId=${chainId}&limit=100`;
        const data = await makeDexscreenerRequest(url);
        
        // Sort by volume and take top 10
        const pairs = (data.pairs || [])
            .filter(p => p.volume?.h24 > 0 && p.priceUsd)
            .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
            .slice(0, 10);
        
        console.log(`[TOP TOKENS] Got ${pairs.length} for ${chainId}`);
        res.json({ pairs });
    } catch (error) {
        console.error('Top tokens error:', error.message);
        res.status(500).json({ error: error.message, pairs: [] });
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.use(express.static('.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ Dexscreener API with smart caching`);
});
