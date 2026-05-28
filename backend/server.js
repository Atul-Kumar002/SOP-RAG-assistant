require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const docsRouter = require('./routes/docs');

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/docs', docsRouter);

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
