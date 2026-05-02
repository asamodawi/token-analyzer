// server.js
// Simple Express server to proxy Dexscreener API requests
// No CORS issues, works with both desktop and mobile apps

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const DEXSCREENER_API = 'https://api.dexscreener.com/latest';

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Server running', timestamp: new Date() });
});

// Proxy: Get pairs by chainId and pairId
app.get('/pairs/:chainId/:pairId', async (req, res) => {
  try {
    const { chainId, pairId } = req.params;
    const response = await axios.get(
      `${DEXSCREENER_API}/dex/pairs/${chainId}/${pairId}`,
      { timeout: 10000 }
    );
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
    let url = `${DEXSCREENER_API}/dex/search?q=${encodeURIComponent(q || '*')}`;
    if (chainId) {
      url += `&chainId=${chainId}`;
    }
    
    const response = await axios.get(url, { timeout: 10000 });
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
    const response = await axios.get(
      `${DEXSCREENER_API}/dex/search?chainId=${chainId}`,
      { timeout: 10000 }
    );
    
    // Sort by volume and limit to top 20
    const pairs = (response.data.pairs || [])
      .filter(p => p.volume?.h24 > 0 && p.priceUsd)
      .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
      .slice(0, 20);
    
    res.json({ pairs });
  } catch (error) {
    console.error('Error fetching top tokens:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Proxy: Get token profiles (trending)
app.get('/token-profiles/:type', async (req, res) => {
  try {
    const { type } = req.params; // 'latest' or 'recent-updates'
    const response = await axios.get(
      `${DEXSCREENER_API}/../token-profiles/${type}/v1`,
      { timeout: 10000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching token profiles:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Proxy: Get token boosts (trending tokens)
app.get('/token-boosts/:type', async (req, res) => {
  try {
    const { type } = req.params; // 'latest' or 'top'
    const response = await axios.get(
      `${DEXSCREENER_API}/../token-boosts/${type}/v1`,
      { timeout: 10000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching token boosts:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Proxy: Get all pairs for a chain (for top tokens)
app.get('/all-pairs/:chainId', async (req, res) => {
  try {
    const { chainId } = req.params;
    // Use wildcard search to get multiple pairs
    const response = await axios.get(
      `${DEXSCREENER_API}/dex/search?q=*&chainId=${chainId}`,
      { timeout: 15000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching all pairs:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend (optional - put your HTML in public folder)
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
