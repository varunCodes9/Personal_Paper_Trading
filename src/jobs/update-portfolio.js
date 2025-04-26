import Portfolio from '../models/Portfolio.js';
import yahooFinance from 'yahoo-finance2';

async function updatePortfolio() {
  const holdings = await Portfolio.find({ sold: false }); // Active holdings

  for (const item of holdings) {
    const quote = await yahooFinance.quote(`${item.symbol}.NS`);
    const currentPrice = quote.regularMarketPrice;
    const profitLoss = (currentPrice - item.buyPrice) * item.quantity;

    await Portfolio.updateOne(
      { _id: item._id },
      { 
        currentValue: currentPrice * item.quantity,
        profitLoss,
        lastUpdated: new Date()
      }
    );
  }
}

// Schedule at 6 PM daily
scheduleJob('0 18 * * 1-5', updatePortfolio);