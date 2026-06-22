require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const docsRouter = require('./routes/docs');
const chatRouter = require('./routes/chat');
const adminRouter = require('./routes/admin');
const { securityHeaders, noSqlSanitizer, rateLimiter } = require('./middleware/security');

const app = express();

// Enable trust proxy if running behind reverse proxies to get correct IP for rate limiting
app.set('trust proxy', true);

// Connect to MongoDB
connectDB();

// Security Middlewares
app.use(securityHeaders);
app.use(noSqlSanitizer);
app.use(cors());

// Limit JSON payload size to 100kb to prevent denial of service (DoS) attacks
app.use(express.json({ limit: '100kb' }));

// Global rate limit: max 100 requests per minute per IP
app.use(rateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many requests. Please try again later.'
}));



// Routes
app.use('/api/docs', docsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/admin', adminRouter);

// Base route for status check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'OpsMind AI Server is running.' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
