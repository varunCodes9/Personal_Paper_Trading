import express from 'express';
import connectDB from './src/db/index.js';
import { processNews } from './src/services/news.js';
import { executeDailyTrades } from './src/jobs/daily-trade.js';
import { scheduleJob } from 'node-schedule';
import Portfolio from './src/models/Portfolio.js';

// Initialize
await connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

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

// Temporary test route in app.mjs
app.post('/take-snapshot', async (req, res) => {
    await takeSnapshot(); // Import the function first
    res.json({ message: 'Snapshot taken' });
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Uncomment for one-time manual testing
// await processNews();
// await executeDailyTrades();