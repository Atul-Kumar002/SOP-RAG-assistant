require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const docsRouter = require('./routes/docs');
const chatRouter = require('./routes/chat');
const adminRouter = require('./routes/admin');

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

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
