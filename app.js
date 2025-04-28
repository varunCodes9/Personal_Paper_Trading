import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import {fileURLToPath} from 'url';
import {scheduleJob} from 'node-schedule';
import MarketDataService from './src/services/market-data.js'; // Import the class
import connectDB from './src/db/index.js';
import NewsServiceConstructor from './src/services/news.js';
import {executeDailyTrades} from './src/jobs/daily-trade.js';
import Portfolio from './src/models/Portfolio.js'; 

// Initialize
await connectDB();

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// New endpoint to get transactions
app.get('/api/transactions', (req, res) => {
    try {
      // const transactions = getTransactions();
      // res.json(transactions);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      res.status(500).json({error: 'Internal server error'});
    }
  });

// Routes
app.get('/portfolio', async (req, res) => {
  try {
      const portfolio = await Portfolio.find();
      res.json(portfolio);
  } catch (error) {
      console.error('Failed to fetch portfolio:', error);
      res.status(500).json({error: 'Internal server error'});
  }
});

// Scheduled job (9:15 AM IST, Mon-Fri)
scheduleJob('15 9 * * 1-5', async () => {
  console.log('🏁 Starting daily trading job...');
    try {
        const newsService = NewsServiceConstructor;
        await newsService.processNews();
          await executeDailyTrades();
        console.log('✅ Daily job completed');
  } catch (error) {
      console.error('❌ Daily job failed:', error);
  }
});

// Manual test endpoint
app.post('/test-trade', async (req, res) => {
    try {
        const newsService = NewsServiceConstructor;
        await newsService.processNews();
          await executeDailyTrades();
          res.json({message: 'Manual trade executed successfully'});
    } catch (error) {
      console.error('Manual trade failed:', error);
      res.status(500).json({error: 'Trade execution failed'});
  }
});

// Instantiate Services
const marketDataService = new MarketDataService(); // Create an instance of MarketDataService

marketDataService.checkMarketHours();
  
// Start server, listening on all IP addresses
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
