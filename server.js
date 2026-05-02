// server.js
// Express server using token-profiles endpoint (more reliable than search)
// Avoids 429 errors by using trending/latest tokens endpoint

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const DEXSCREENER_API = 'https://api.dexscreener.com/latest';

// Rate limiting
let lastRequestTime = 0;
const RATE_LIMIT_DELAY = 1500; // 1.5 seconds between requests
const REQUEST_TIMEOUT = 20000;

// Cache
const cache = new Map();
const CACHE_TTL = 120000; // 2 minutes

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
    
    // Wait for rate limit
    const timeSinceLastRequest = Date.now() - lastRequestTime;
    const waitTime = Math.max(0, RATE_LIMIT_DELAY - timeSinceLastRequest);
    
    if (waitTime > 0) {
        console.log(`[WAIT] ${waitTime}ms before API call`);
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
        
        console.log(`[SUCCESS] Got ${response.data.pairs?.length || response.data.length || 0} results`);
        setCached(url, response.data);
        return response.data;
    } catch (error) {
        console.error(`[API ERROR] ${url}: ${error.response?.status || error.message}`);
        throw error;
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'Server running',
        cacheSize: cache.size,
        timestamp: new Date() 
    });
});

// Proxy: Search pairs - USE TOKEN PROFILES INSTEAD
app.get('/search', async (req, res) => {
    try {
        const { q, chainId } = req.query;
        const searchQuery = q || '*';
        
        console.log(`[SEARCH REQUEST] Query: "${searchQuery}" Chain: ${chainId || 'all'}`);
        
        // Try the token-profiles endpoint first (more reliable)
        let url = `${DEXSCREENER_API}/../token-profiles/latest/v1`;
        
        try {
            const data = await throttledRequest(url);
            
            // Filter/search through token profiles
            let results = data || [];
            if (Array.isArray(results)) {
                // Search by symbol or name
                results = results.filter(token => {
                    const symbol = (token.tokenSymbol || '').toUpperCase();
                    const name = (token.tokenName || '').toUpperCase();
                    const query = searchQuery.toUpperCase();
                    return symbol.includes(query) || name.includes(query);
                }).slice(0, 10);
                
                // Convert to pairs format for consistency
                const pairs = results.map(token => ({
                    baseToken: {
                        name: token.tokenName,
                        symbol: token.tokenSymbol
                    },
                    quoteToken: { symbol: 'USD' },
                    priceUsd: token.price?.usd || 0,
                    volume: { h24: token.volume?.h24 || 0 },
                    liquidity: { usd: token.liquidity?.usd || 0 },
                    priceChange: { h24: token.priceChange?.h24 || 0 },
                    dexId: 'DEX',
                    chainId: 'solana'
                }));
                
                return res.json({ pairs });
            }
        } catch (error) {
            console.log(`[FALLBACK] token-profiles failed, trying search endpoint`);
        }
        
        // Fallback to search endpoint for specific chains
        url = `${DEXSCREENER_API}/dex/search?q=${encodeURIComponent(searchQuery)}`;
        if (chainId) {
            url += `&chainId=${chainId}`;
        }
        
        const data = await throttledRequest(url);
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
        
        console.log(`[TOP TOKENS REQUEST] Chain: ${chainId}`);
        
        // Use wildcard search to get all pairs on chain
        const url = `${DEXSCREENER_API}/dex/search?q=*&chainId=${chainId}`;
        
        const data = await throttledRequest(url);
        
        // Sort by volume and limit to top 20
        const pairs = (data.pairs || [])
            .filter(p => p.volume?.h24 > 0 && p.priceUsd)
            .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
            .slice(0, 20);
        
        console.log(`[TOP TOKENS] Got ${pairs.length} tokens for ${chainId}`);
        const result = { pairs, chainId, count: pairs.length };
        res.json(result);
    } catch (error) {
        console.error('Error fetching top tokens:', error.message);
        res.status(500).json({ error: `Failed to load top tokens: ${error.message}` });
    }
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
    console.log(`🔄 Using token-profiles endpoint (more stable)`);
    console.log(`⏱️  Rate limit: 1.5 seconds between calls`);
});
