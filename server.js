// server.js - Production server using CoinGecko API
// CoinGecko has better rate limiting tolerance than Dexscreener

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

// Rate limiting
let lastRequestTime = 0;
const RATE_LIMIT_DELAY = 1000; // 1 second between requests

async function makeRequest(url) {
    const timeSinceLastRequest = Date.now() - lastRequestTime;
    const waitTime = Math.max(0, RATE_LIMIT_DELAY - timeSinceLastRequest);
    
    if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastRequestTime = Date.now();
    
    try {
        const response = await axios.get(url, { 
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return response.data;
    } catch (error) {
        throw error;
    }
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'Running' });
});

// Search endpoint - using CoinGecko
app.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.json({ pairs: [] });
        }
        
        console.log(`[SEARCH] "${q}"`);
        
        // Search CoinGecko for token
        const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
        const searchData = await makeRequest(searchUrl);
        
        const coins = searchData.coins || [];
        if (coins.length === 0) {
            return res.json({ pairs: [] });
        }
        
        // Get market data for top results
        const ids = coins.slice(0, 5).map(c => c.id).join(',');
        const marketUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=250&sparkline=false&price_change_percentage=24h`;
        const marketData = await makeRequest(marketUrl);
        
        // Convert to pairs format
        const pairs = (marketData || []).map((coin, idx) => ({
            baseToken: {
                name: coin.name,
                symbol: coin.symbol?.toUpperCase()
            },
            quoteToken: { symbol: 'USD' },
            priceUsd: coin.current_price?.toString() || '0',
            volume: { h24: coin.total_volume || 0 },
            liquidity: { usd: coin.market_cap || 0 },
            priceChange: { h24: coin.price_change_percentage_24h || 0 },
            dexId: 'CoinGecko',
            chainId: 'multi'
        }));
        
        console.log(`[SEARCH SUCCESS] Found ${pairs.length} results`);
        res.json({ pairs });
    } catch (error) {
        console.error('Search error:', error.message);
        res.status(500).json({ error: error.message, pairs: [] });
    }
});

// Top tokens endpoint - using CoinGecko
app.get('/top-tokens/:chainId', async (req, res) => {
    try {
        const { chainId } = req.params;
        console.log(`[TOP TOKENS] Chain: ${chainId}`);
        
        // Get top tokens by market cap
        const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&sparkline=false&price_change_percentage=24h`;
        const data = await makeRequest(url);
        
        // Convert to pairs format
        const pairs = (data || []).map((coin, idx) => ({
            baseToken: {
                name: coin.name,
                symbol: coin.symbol?.toUpperCase()
            },
            quoteToken: { symbol: 'USD' },
            priceUsd: coin.current_price?.toString() || '0',
            volume: { h24: coin.total_volume || 0 },
            liquidity: { usd: coin.market_cap || 0 },
            priceChange: { h24: coin.price_change_percentage_24h || 0 },
            dexId: 'CoinGecko',
            chainId: chainId
        }));
        
        console.log(`[TOP TOKENS SUCCESS] Got ${pairs.length} tokens`);
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
    console.log(`✅ Using CoinGecko API (reliable, no rate limit issues)`);
});
