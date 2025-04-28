import config from '../config/index.js';
import moment from 'moment-timezone';
import logger from '../utils/logger.js';

class SymbolData {
  constructor(symbol) {
    this.symbol = symbol;
    this.priceHistory = [];
  }

  updatePrice(price) {
    const timestamp = Date.now();
    this.priceHistory.push({ timestamp, price });
    // Keep only the last 2 minutes of data
    this.priceHistory = this.priceHistory.filter(item => item.timestamp >= timestamp - 120000);
  }

  getLatestPrice() {
    return this.priceHistory.length > 0 ? this.priceHistory[this.priceHistory.length - 1].price : null;
  }

  getLastMinutePrice() {
    const oneMinuteAgo = Date.now() - 60000;
    const lastMinuteData = this.priceHistory.filter(item => item.timestamp >= oneMinuteAgo);
    return lastMinuteData.length > 0 ? lastMinuteData[0].price : null;
  }
}

class MarketDataService {
  constructor() {
    this.isMarketOpen = false;
    this.symbolsData = {};
    this.initializeSymbols();
    this.simulateMarketData();
    this.checkMarketHours(); // Check market hours at startup
    setInterval(() => this.checkMarketHours(), 60000); // Check every minute
  }

  initializeSymbols() {
    config.WATCHLIST.forEach(symbol => {
      this.symbolsData[symbol] = new SymbolData(symbol);
    });
  }  

  simulateMarketData() {
    setInterval(() => {
      if (!this.isMarketOpen) return;
      config.WATCHLIST.forEach(symbol => {
        const newPrice = Math.random() * (160 - 150) + 150; // Random price between 150 and 160
        this.symbolsData[symbol].updatePrice(newPrice);        
      });
    }, 2000); // Every 2 seconds
  }

  checkMarketHours() {
    const now = moment().tz('Asia/Kolkata');
    const marketOpenTime = moment().tz('Asia/Kolkata').set({ hour: 9, minute: 15, second: 0, millisecond: 0 });
    const marketCloseTime = moment().tz('Asia/Kolkata').set({ hour: 15, minute: 30, second: 0, millisecond: 0 });

    this.isMarketOpen = now.isBetween(marketOpenTime, marketCloseTime);

    if (this.isMarketOpen) {
      logger.info('Market is open.');
    } else {
      logger.info('Market is closed.');
    }
  }

  getLatestPrice(symbol) {
    return this.symbolsData[symbol]?.getLatestPrice();
  }

  getLastMinutePrice(symbol) {
    return this.symbolsData[symbol]?.getLastMinutePrice();
  }
}

export default MarketDataService;
