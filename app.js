import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import connectDB from './src/db/index.js';
import { processNews } from './src/services/news.js';
import { executeDailyTrades } from './src/jobs/daily-trade.js';
import { scheduleJob } from 'node-schedule';
import { getTransactions } from './src/services/market-data.js';
import Portfolio from './src/models/Portfolio.js';

// Initialize
await connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

const __dirname = path.resolve();

// Middleware
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// New endpoint to get transactions
app.get('/api/transactions', (req, res) => {
  try {
    const transactions = getTransactions();
    res.json(transactions);
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Routes
app.get('/portfolio', async (req, res) => {
  try {
    const portfolio = await Portfolio.find();
    res.json(portfolio);
  } catch (error) {
    console.error('Failed to fetch portfolio:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Scheduled job (9:15 AM IST, Mon-Fri)
scheduleJob('15 9 * * 1-5', async () => {
  console.log('🏁 Starting daily trading job...');
  try {
    await processNews();
    await executeDailyTrades();
    console.log('✅ Daily job completed');
  } catch (error) {
    console.error('❌ Daily job failed:', error);
  }
});

// Manual test endpoint
app.post('/test-trade', async (req, res) => {
  try {
    await processNews();
    await executeDailyTrades();
    res.json({ message: 'Manual trade executed successfully' });
  } catch (error) {
    console.error('Manual trade failed:', error);
    res.status(500).json({ error: 'Trade execution failed' });
  }
});

// Start server, listening on all IP addresses
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
 });

// Uncomment for one-time manual testing
// await processNews();
// await executeDailyTrades();