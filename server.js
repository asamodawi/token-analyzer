// server.js - Using Birdeye API (free DEX data without rate limits)
// Birdeye is built for token analysis and has generous rate limits

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

// Cache for responses
const cache = new Map();
const CACHE_TTL = 180000; // 3 minutes

function getCached(url) {
    if (!cache.has(url)) return null;
    const item = cache.get(url);
    if (Date.now() - item.time > CACHE_TTL) {
        cache.delete(url);
        return null;
    }
    console.log(`[CACHE HIT]`);
    return item.data;
}

function setCached(url, data) {
    cache.set(url, { data, time: Date.now() });
}

async function makeRequest(url) {
    const cached = getCached(url);
    if (cached) return cached;
    
    try {
        console.log(`[API CALL] Birdeye`);
        const response = await axios.get(url, { 
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        setCached(url, response.data);
        return response.data;
    } catch (error) {
        console.error(`[API ERROR] ${error.message}`);
        throw error;
    }
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'Running', cacheSize: cache.size });
});

// Search endpoint - search Birdeye for tokens
app.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json({ pairs: [] });
        
        console.log(`[SEARCH] "${q}"`);
        
        // Birdeye search endpoint
        const url = `https://api.birdeye.so/v1/token/search?query=${encodeURIComponent(q)}&sort_by=liquidity&limit=10`;
        
        const data = await makeRequest(url);
        
        // Convert to pairs format
        const pairs = (data.data?.result || []).map(token => ({
            baseToken: {
                name: token.name,
                symbol: token.symbol
            },
            quoteToken: { symbol: 'USD' },
            priceUsd: token.price?.toString() || '0',
            volume: { h24: token.volume24h || token.v24hUSD || 0 },
            liquidity: { usd: token.liquidity || 0 },
            priceChange: { h24: token.priceChange24h || 0 },
            dexId: 'Birdeye',
            chainId: token.chain || 'solana'
        }));
        
        console.log(`[SEARCH SUCCESS] Found ${pairs.length} tokens`);
        res.json({ pairs });
    } catch (error) {
        console.error('Search error:', error.message);
        res.status(500).json({ error: error.message, pairs: [] });
    }
});

// Top tokens endpoint - get top tokens from Birdeye
app.get('/top-tokens/:chainId', async (req, res) => {
    try {
        const { chainId } = req.params;
        console.log(`[TOP TOKENS] Chain: ${chainId}`);
        
        // Map chainId to Birdeye chain
        const chainMap = {
            'solana': 'solana',
            'ethereum': 'ethereum',
            'bsc': 'bsc',
            'polygon': 'polygon',
            'arbitrum': 'arbitrum'
        };
        
        const chain = chainMap[chainId] || 'solana';
        
        // Birdeye top tokens endpoint
        const url = `https://api.birdeye.so/v1/token/top_tokens?sort_by=liquidity&order=desc&limit=10&chain=${chain}`;
        
        const data = await makeRequest(url);
        
        // Convert to pairs format
        const pairs = (data.data?.result || []).map(token => ({
            baseToken: {
                name: token.name,
                symbol: token.symbol
            },
            quoteToken: { symbol: 'USD' },
            priceUsd: token.price?.toString() || '0',
            volume: { h24: token.volume24h || token.v24hUSD || 0 },
            liquidity: { usd: token.liquidity || 0 },
            priceChange: { h24: token.priceChange24h || 0 },
            dexId: 'Birdeye',
            chainId: chain
        }));
        
        console.log(`[TOP TOKENS] Got ${pairs.length} tokens for ${chain}`);
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
    console.log(`✅ Using Birdeye API (DEX-focused, no rate limit issues)`);
    console.log(`📊 Real-time token analysis enabled`);
});
