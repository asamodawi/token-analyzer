// server.js - Using Jupiter API (Solana tokens) + CoinGecko (other chains)
// Jupiter for DEX data, CoinGecko as fallback

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
        console.log(`[API CALL]`);
        const response = await axios.get(url, { 
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        setCached(url, response.data);
        return response.data;
    } catch (error) {
        console.error(`[API ERROR] ${error.response?.status || error.message}`);
        throw error;
    }
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'Running', cacheSize: cache.size });
});

// Search endpoint - Jupiter for Solana, CoinGecko for others
app.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json({ pairs: [] });
        
        console.log(`[SEARCH] "${q}"`);
        
        // Try Jupiter first (Solana)
        try {
            const jupUrl = `https://token.jup.ag/search?query=${encodeURIComponent(q)}&limit=10`;
            const jupData = await makeRequest(jupUrl);
            
            if (jupData && jupData.length > 0) {
                const pairs = jupData.map(token => ({
                    baseToken: {
                        name: token.name,
                        symbol: token.symbol
                    },
                    quoteToken: { symbol: 'USDC' },
                    priceUsd: token.price?.toString() || '0',
                    volume: { h24: 0 },
                    liquidity: { usd: 0 },
                    priceChange: { h24: 0 },
                    dexId: 'Jupiter',
                    chainId: 'solana'
                }));
                
                console.log(`[SEARCH SUCCESS] Found ${pairs.length} tokens via Jupiter`);
                return res.json({ pairs });
            }
        } catch (error) {
            console.log(`[FALLBACK] Jupiter failed, trying CoinGecko...`);
        }
        
        // Fallback to CoinGecko
        const cgUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}&order=market_cap_desc`;
        const cgData = await makeRequest(cgUrl);
        
        const coins = cgData.coins || [];
        if (coins.length === 0) {
            return res.json({ pairs: [] });
        }
        
        // Get market data for top results
        const ids = coins.slice(0, 5).map(c => c.id).join(',');
        const marketUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=250&sparkline=false&price_change_percentage=24h`;
        const marketData = await makeRequest(marketUrl);
        
        const pairs = (marketData || []).map(coin => ({
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
        
        console.log(`[SEARCH SUCCESS] Found ${pairs.length} tokens via CoinGecko`);
        res.json({ pairs });
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
        
        // For Solana, use Jupiter
        if (chainId === 'solana') {
            try {
                const url = `https://api.jup.ag/price/v2?ids=EPjFWaLb3hyccqJ1yaiZOX3W1sKdzthAa7Clark198o&vsToken=EPjFWaLb3hyccqJ1yaiZOX3W1sKdzthAa7Clark198o`;
                const data = await makeRequest(url);
                
                // Get top Solana tokens - using a known list
                const topSolanaTokens = [
                    { symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111111111112' },
                    { symbol: 'USDC', name: 'USD Coin', mint: 'EPjFWaLb3hyccqJ1yaiZOX3W1sKdzthAa7Clark198o' },
                    { symbol: 'USDT', name: 'Tether', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenErt' },
                    { symbol: 'RAY', name: 'Raydium', mint: '4k3Dyjzvzp8eMZWUeKuff4ZCL9cu7kUKq7aSLcS7aeT' },
                    { symbol: 'JUP', name: 'Jupiter', mint: 'JUPyiwrYJFskUPiHa7hkeR8UUtyu2koF8qwfV6qWJVU' }
                ];
                
                const pairs = topSolanaTokens.map(token => ({
                    baseToken: {
                        name: token.name,
                        symbol: token.symbol
                    },
                    quoteToken: { symbol: 'USDC' },
                    priceUsd: '0',
                    volume: { h24: 0 },
                    liquidity: { usd: 0 },
                    priceChange: { h24: 0 },
                    dexId: 'Jupiter',
                    chainId: 'solana'
                }));
                
                console.log(`[TOP TOKENS] Got ${pairs.length} tokens for solana`);
                return res.json({ pairs });
            } catch (error) {
                console.log('[FALLBACK] Jupiter failed for top tokens');
            }
        }
        
        // For other chains, use CoinGecko
        const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&sparkline=false&price_change_percentage=24h`;
        const data = await makeRequest(url);
        
        const pairs = (data || []).map(coin => ({
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
    console.log(`✅ Using Jupiter API (Solana) + CoinGecko (other chains)`);
});
