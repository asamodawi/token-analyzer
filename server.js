// server.js - Production Dexscreener proxy with exponential backoff
// Handles rate limiting intelligently without switching APIs

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const DEXSCREENER_API = 'https://api.dexscreener.com/latest';

// Exponential backoff state
const backoffState = {
    retryAfter: 0,
    lastRetryTime: 0
};

// Cache for successful responses
const cache = new Map();
const CACHE_TTL = 120000; // 2 minutes

function getCached(url) {
    if (!cache.has(url)) return null;
    const item = cache.get(url);
    if (Date.now() - item.time > CACHE_TTL) {
        cache.delete(url);
        return null;
    }
    console.log(`[CACHE HIT] ${url.substring(0, 60)}...`);
    return item.data;
}

function setCached(url, data) {
    cache.set(url, { data, time: Date.now() });
}

async function makeRequestWithBackoff(url, attempt = 1) {
    // Check cache first
    const cached = getCached(url);
    if (cached) {
        return cached;
    }
    
    // Wait if we're in backoff state
    if (backoffState.retryAfter > 0) {
        const waitTime = backoffState.retryAfter - (Date.now() - backoffState.lastRetryTime);
        if (waitTime > 0) {
            console.log(`[BACKOFF] Waiting ${waitTime}ms before retry`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
            // Backoff period expired
            backoffState.retryAfter = 0;
        }
    }
    
    try {
        console.log(`[API CALL] Attempt ${attempt}: ${url.substring(0, 60)}...`);
        const response = await axios.get(url, { 
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        // Success - reset backoff
        backoffState.retryAfter = 0;
        console.log(`[SUCCESS] Got response`);
        setCached(url, response.data);
        return response.data;
    } catch (error) {
        if (error.response?.status === 429) {
            // Rate limited - exponential backoff
            const waitTime = Math.min(
                (Math.pow(2, attempt - 1) * 5000) + Math.random() * 1000,
                60000 // Max 60 seconds
            );
            
            backoffState.retryAfter = waitTime;
            backoffState.lastRetryTime = Date.now();
            
            console.error(`[429 RATE LIMITED] Backing off for ${waitTime}ms, then will retry`);
            
            // If this is first attempt, retry after backoff
            if (attempt < 3) {
                console.log(`[RETRY] Will retry in ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return makeRequestWithBackoff(url, attempt + 1);
            } else {
                // Max retries reached
                throw new Error('Rate limited by API. Please try again in a few seconds.');
            }
        }
        
        console.error(`[ERROR] ${error.message}`);
        throw error;
    }
}

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'Running',
        backoffActive: backoffState.retryAfter > 0,
        cacheSize: cache.size
    });
});

// Search endpoint
app.get('/search', async (req, res) => {
    try {
        const { q, chainId } = req.query;
        if (!q) {
            return res.json({ pairs: [] });
        }
        
        console.log(`[SEARCH] Query: "${q}"`);
        
        let url = `${DEXSCREENER_API}/dex/search?q=${encodeURIComponent(q)}`;
        if (chainId) {
            url += `&chainId=${chainId}`;
        }
        
        const data = await makeRequestWithBackoff(url);
        res.json(data);
    } catch (error) {
        console.error('Search error:', error.message);
        res.status(500).json({ error: error.message, pairs: [] });
    }
});

// Top tokens endpoint
app.get('/top-tokens/:chainId', async (req, res) => {
    try {
        const { chainId } = req.params;
        console.log(`[TOP TOKENS] Chain: ${chainId}`);
        
        const url = `${DEXSCREENER_API}/dex/search?q=*&chainId=${chainId}`;
        const data = await makeRequestWithBackoff(url);
        
        // Sort by volume and limit to top 10
        const pairs = (data.pairs || [])
            .filter(p => p.volume?.h24 > 0 && p.priceUsd)
            .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
            .slice(0, 10);
        
        console.log(`[TOP TOKENS] Got ${pairs.length} tokens for ${chainId}`);
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
    console.log(`✅ Using Dexscreener API with exponential backoff`);
    console.log(`📊 Intelligent rate limiting enabled`);
});
