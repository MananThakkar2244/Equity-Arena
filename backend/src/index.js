const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { initSocket } = require('./socket');
const { startMarketTicker } = require('./services/marketTicker');
const { ensureDatabase } = require('./db/ensureDatabase');

const authRoutes = require('./routes/authRoutes');
const stockRoutes = require('./routes/stockRoutes');
const { router: tradeRoutes } = require('./routes/tradeRoutes');
const adminRoutes = require('./routes/adminRoutes');
const orderRoutes = require('./routes/orderRoutes');
const sessionRoutes = require('./routes/sessionRoutes');

const app = express();
const server = http.createServer(app);

// Environment & Dynamic CORS configuration (Supports local, Vercel & ngrok deployments)
app.use(cors({
  origin: (origin, callback) => {
    // Allow all incoming origins dynamically for seamless Vercel / ngrok / local deployment
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'ngrok-skip-browser-warning',
    'X-Requested-With',
    'Accept'
  ]
}));

app.use(express.json());

// Socket.io initialization
initSocket(server);

// API Routes
app.use('/auth', authRoutes);
app.use('/stocks', stockRoutes);
app.use('/admin', adminRoutes);
app.use('/', tradeRoutes); // Mounts GET /portfolio, POST /trade/buy, POST /trade/sell
app.use('/', orderRoutes); // Mounts POST /orders, DELETE /orders/:id, GET /orders
app.use('/', stockRoutes); // Mounts GET /news
app.use('/', sessionRoutes); // Mounts GET /api/session, POST /api/admin/session/start

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Equity Arena Backend', timestamp: new Date() });
});

// Serve frontend static build files (if compiled dist folder exists)
const distPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  // SPA Fallback: Serve index.html for non-API client routes (/trader, /admin, /login) on hard refresh
  app.get(/^.*$/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 5001;

/**
 * The ticker writes on every beat, so the database has to be up before it
 * starts — otherwise the log fills with connection errors while the server
 * claims to be running.
 */
async function boot() {
  try {
    await ensureDatabase();
  } catch (err) {
    console.error('❌ Could not prepare the database:', err.message);
    process.exit(1);
  }

  startMarketTicker();

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

if (require.main === module) {
  boot();
}

module.exports = { app, server };
