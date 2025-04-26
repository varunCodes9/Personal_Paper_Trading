import { executeDailyTrades } from '../../src/jobs/daily-trade.js';
import Trade from '../../src/models/Trade.js';

describe('Trade Execution', () => {
  it('should place paper trades for watchlist', async () => {
    await executeDailyTrades();
    const trades = await Trade.find();
    expect(trades.length).toBeGreaterThan(0);
    expect(trades[0].action).toBe('BUY');
  });
});