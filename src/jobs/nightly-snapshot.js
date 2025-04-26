import Portfolio from '../models/Portfolio.js';
import PortfolioSnapshot from '../models/PortfolioSnapshot.js';
import { scheduleJob } from 'node-schedule';

export async function takeSnapshot() {
  try {
    const holdings = await Portfolio.find();
    const totalValue = holdings.reduce((sum, item) => sum + (item.currentValue || 0), 0);
    const totalPnl = holdings.reduce((sum, item) => sum + (item.profitLoss || 0), 0);

    await new PortfolioSnapshot({
      date: new Date(),
      totalValue,
      totalPnl,
      holdings: holdings.map(item => ({
        symbol: item.symbol,
        pnl: item.profitLoss,
        quantity: item.quantity
      }))
    }).save();

    console.log('📸 Portfolio snapshot saved');
  } catch (error) {
    console.error('Snapshot failed:', error);
  }
}

// Schedule at 11:59 PM daily
scheduleJob('59 23 * * *', takeSnapshot);