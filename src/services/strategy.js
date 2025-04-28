import News from '../models/News.js';
import yahooFinance from 'yahoo-finance2';
import Trade from '../models/Trade.js';
import Portfolio from '../models/Portfolio.js';
import * as ta from 'technicalindicators';
import marketDataService from './market-data.js';
import { MACD } from 'technicalindicators';
import config from '../config/index.js';
import logger from '../utils/logger.js';

class StrategyService {
  constructor() {
    this.priceHistory = {};
  }
  /**
   * Evaluates a stock based on technical indicators and news sentiment
   * to generate trading signals (BUY, SELL, STRONG_BUY, STRONG_SELL, HOLD)
   *
   * @param {string} symbol - Stock symbol to evaluate
   * @returns {Promise<string>} Trading signal
   */
  async evaluateStock(symbol) {
    try {
      // Validate input
      if (!symbol || typeof symbol !== 'string') {
        throw new Error('Invalid symbol provided');
      }

      // Get technical indicator (RSI)
      const rsiData = await this.getRSI(symbol);
      if (!rsiData || rsiData.length < 3) { // Need at least 3 data points for trend
        logger.warn(`Insufficient RSI data available for ${symbol}`);
        return 'HOLD';
      }

      // Get current RSI and analyze trend
      const currentRSI = rsiData[rsiData.length - 1];
      const rsiTrend = this.analyzeRsiTrend(rsiData.slice(-5)); // Last 5 days for trend    

      logger.debug(`Current RSI for ${symbol}: ${currentRSI}, Trend: ${rsiTrend}`);

      // Get news sentiment
      const sentimentData = await this.getNewsSentiment(symbol);
      const { avgSentiment, newsCount, recentTrend } = sentimentData;

      logger.debug(`Sentiment for ${symbol}: ${avgSentiment} (${newsCount} news items), Trend: ${recentTrend}`);

      // Enhanced strategy rules with more conditions
      const isStronglyOversold = currentRSI < 25;
      const isOversold = currentRSI < 30;
      const isStronglyOverbought = currentRSI > 75;
      const isOverbought = currentRSI > 70;

      const isStrongBullish = avgSentiment > 0.5;
      const isBullish = avgSentiment > 0.2;
      const isStrongBearish = avgSentiment < -0.5;
      const isBearish = avgSentiment < -0.2;

      const hasSufficientNews = newsCount >= 3;
      const hasHighVolumeNews = newsCount >= 5;

      // Create decision matrix with strength signals
      const decision = this.determineTradeDecision({
        rsi: { current: currentRSI, trend: rsiTrend },
        sentiment: { value: avgSentiment, count: newsCount, trend: recentTrend },
        technicalConditions: {
          isStronglyOversold, isOversold, isStronglyOverbought, isOverbought
        },
        sentimentConditions: {
          isStrongBullish, isBullish, isStrongBearish, isBearish,
          hasSufficientNews, hasHighVolumeNews
        }
      });

      logger.info(`${decision} signal for ${symbol} (RSI: ${currentRSI}, Sentiment: ${avgSentiment})`);
      return decision;

    } catch (error) {
      logger.error(`Error evaluating ${symbol}:`, error);
      // Fail-safe - when in doubt, hold
      return 'HOLD';
    }
  }

  /**
   * Generates a trading signal (BUY, SELL, HOLD) based on moving averages and RSI.
   *
   * @param {string} symbol - The stock symbol.
   * @param {number} shortTermPeriod - The period for the short-term moving average.
   * @param {number} longTermPeriod - The period for the long-term moving average.
   * @param {number} rsiPeriod - The period for RSI calculation.
   * @returns {Promise<string>} - The trading signal.
   */
  async getTradingSignal(symbol, shortTermPeriod, longTermPeriod, rsiPeriod) {
    try {
      const { quotes } = await yahooFinance.chart(`${symbol}.NS`, {
        period1: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        period2: new Date().toISOString().split('T')[0],
        interval: '1d'
      });

      const closes = quotes.map(q => q.close);
      const shortTermMA = ta.SMA.calculate({ values: closes, period: shortTermPeriod });
      const longTermMA = ta.SMA.calculate({ values: closes, period: longTermPeriod });
      const rsiData = ta.RSI.calculate({ values: closes, period: rsiPeriod });

      const currentShortTermMA = shortTermMA[shortTermMA.length - 1];
      const currentLongTermMA = longTermMA[longTermMA.length - 1];
      const currentRSI = rsiData[rsiData.length - 1];

      const shortTermMA_previous = shortTermMA[shortTermMA.length - 2];
      const longTermMA_previous = longTermMA[longTermMA.length - 2];
      // Check if the short-term MA crossed above the long-term MA
      const isMACrossedAbove = shortTermMA_previous < longTermMA_previous && currentShortTermMA > currentLongTermMA;

      // Calculate MACD
      const macdInput = {
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      };
      const macdOutput = MACD.calculate(macdInput);

      const currentMACD = macdOutput[macdOutput.length - 1];
      const isMACDBelowSignal = currentMACD.MACD < currentMACD.signal;

      // Check if the short-term MA crossed below the long-term MA
      const isMACrossedBelow = shortTermMA_previous > longTermMA_previous && currentShortTermMA < currentLongTermMA;

      const isMACDAboveSignal = currentMACD.MACD > currentMACD.signal;

      if (isMACrossedAbove && currentRSI < 30 && isMACDAboveSignal) return 'BUY';
      if (isMACrossedAbove && currentRSI < 30) return 'BUY';
      if (isMACrossedBelow && currentRSI > 70) return 'SELL';
      return 'HOLD';
    } catch (error) {
      logger.error(`Error evaluating ${symbol}:`, error);
      return 'HOLD';
    }
  }

  /**
   * Live trade function. Will evaluate in real time the market condition and
   * execute the trades based on it.
   * The logic of the function will be that if there is a sudden increase
   * in price of 1% in the last 1 minute it will buy and if there is a sudden decrease
   * in price of 1% in the last minute it will sell.
   *
   * @param {string} symbol - Stock symbol
   */
  async liveTrade(symbol) {
    try {
      const currentPrice = await marketDataService.getLatestPrice(symbol);
      const lastMinutePrice = await marketDataService.getLastMinutePrice(symbol);
      // get the prices of the current and the last minute
      if (!currentPrice) {
        logger.warn(`Current price not found for ${symbol}`);
        return;
      }
      if (!lastMinutePrice) {
        logger.warn(`Last minute price not found for ${symbol}`);
        return;
      }

      if (lastMinutePrice >= currentPrice && lastMinutePrice - currentPrice < 0.000001) {
        logger.warn(`Invalid prices for ${symbol} Current ${currentPrice}, lastMinute: ${lastMinutePrice}`);
        return;
      }

      // Calculate the percentage change    
      const percentageChange = ((currentPrice - lastMinutePrice) / lastMinutePrice) * 100;

      // Logic for live trading
      if (percentageChange >= 1) {
        // Buy if there's a sudden increase of 1%
        logger.info(`Live Trade: Buying ${symbol} due to 1% increase in price.`);
        await this.executeTrade(symbol, 1, 'buy'); // Buy 1 quantity of the stock
      } else if (percentageChange <= -1) {
        // Sell if there's a sudden decrease of 1%
        logger.info(`Live Trade: Selling ${symbol} due to 1% decrease in price.`);
        await this.executeTrade(symbol, 1, 'sell'); // Sell 1 quantity of the stock
      } else {
        logger.info(`No live trade action for ${symbol} with a ${percentageChange}% change`);
      }
    } catch (error) {
      logger.error(`Error in live trading for ${symbol}:`, error);
    }
  }

  /**
   * Executes a trade order. Placeholder for actual order placement logic.
   *
   * @param {string} symbol - Stock symbol.
   * @param {number} quantity - Quantity of stock to trade.
   * @param {string} side - 'buy' or 'sell'.
   * @returns {Promise<void>}
   */
  async executeTrade(symbol, quantity, side) {
    const currentPrice = await marketDataService.getLatestPrice(symbol);
    try {
        if (side === 'buy') {            
          // Check if we already have an open position for this symbol
          const existingPosition = await Portfolio.findOne({ symbol, sold: false });
          if (!existingPosition) {
              // Create a new portfolio entry
              const newPosition = new Portfolio({
                  symbol,
                  buyPrice: currentPrice,
                  quantity,
                  buyDate: new Date(),
                  sold: false
              });
              await newPosition.save();
              logger.info(`Bought ${quantity} of ${symbol} at ${currentPrice}`);

               // Create a new trade record
              await new Trade({
                symbol,
                action: 'BUY',
                price: currentPrice,
                quantity,
              }).save();
          } else {
              logger.warn(`Already have an open position for ${symbol}. Cannot open a new position.`);
          }

        } else if (side === 'sell') {
            const holding = await Portfolio.findOne({ symbol, sold: false });
            if (holding) {
                holding.sold = true;
                holding.sellPrice = currentPrice;
                holding.sellDate = new Date();
                holding.exitReason = "liveTrade";
                await holding.save();
                const profitLoss = (currentPrice - holding.buyPrice) * quantity;
                const trade = new Trade({
                    symbol: symbol,
                    action: side.toUpperCase(),
                   price: currentPrice,
                    quantity: holding.quantity,
                    capitalUsed: holding.buyPrice * quantity,
                    profitLoss: profitLoss,
                    signalStrength: signalStrength
                });
                await trade.save();
                logger.info(`Executed SELL order for ${quantity} of ${symbol} at price ${currentPrice}`);
            } else {
                logger.warn(`No open position found to SELL for ${symbol}`);
            }

        } else {
          logger.warn(`No open position found for ${symbol}. Cannot sell.`);
        }
    } catch (error) {
        logger.error(`Error executing trade for ${symbol} :`, error);
    }
}

  /**
   * Analyzes RSI trend over given period
   * @param {Array} rsiData - Recent RSI values
   * @returns {string} - Trend description
   */
  analyzeRsiTrend(rsiData) {
  if (rsiData.length < 2) return 'UNKNOWN';
  
  // Calculate the slope of RSI line
  const firstRSI = rsiData[0];
  const lastRSI = rsiData[rsiData.length - 1];
  const rsiChange = lastRSI - firstRSI;
  
  // Check for divergence pattern
  const maxRSI = Math.max(...rsiData);
  const minRSI = Math.min(...rsiData);
  const isVolatile = maxRSI - minRSI > 10;
  
  if (rsiChange > 5) return 'STRONGLY_BULLISH';
  if (rsiChange > 2) return 'BULLISH';
  if (rsiChange < -5) return 'STRONGLY_BEARISH';
  if (rsiChange < -2) return 'BEARISH';
  if (isVolatile) return 'VOLATILE';
  
  return 'NEUTRAL';
}

  /**
   * Gets news sentiment data for a stock
   * @param {string} symbol - Stock symbol
   * @returns {Object} - Sentiment data
   */
    async getNewsSentiment(symbol) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get recent news (today)
    const todaySentiment = await News.aggregate([
      {
        $match: {
          symbol,
          timestamp: { $gte: today }
        }
      },
      {
        $group: {
          _id: null,
          avgSentiment: { $avg: "$sentiment" },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get yesterday's news for trend comparison
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdaySentiment = await News.aggregate([
      {
        $match: {
          symbol,
          timestamp: { $gte: yesterday, $lt: today }
        }
      },
      {
        $group: {
          _id: null,
          avgSentiment: { $avg: "$sentiment" },
          count: { $sum: 1 }
        }
      }
    ]);

    const todayAvgSentiment = todaySentiment.length > 0 ? todaySentiment[0].avgSentiment : 0;
    const todayCount = todaySentiment.length > 0 ? todaySentiment[0].count : 0;
    const yesterdayAvgSentiment = yesterdaySentiment.length > 0 ? yesterdaySentiment[0].avgSentiment : 0;

    // Calculate sentiment trend
    let recentTrend = 'NEUTRAL';
    if (todayAvgSentiment > yesterdayAvgSentiment + 0.3) recentTrend = 'IMPROVING';
    if (todayAvgSentiment < yesterdayAvgSentiment - 0.3) recentTrend = 'DETERIORATING';

    return {
      avgSentiment: todayAvgSentiment,
      newsCount: todayCount,
      recentTrend
    };
  }

   /**
   * Gets RSI for a stock
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Array<number>>} - RSI data
   */
    async getRSI(symbol) {
        try {
            const { quotes } = await yahooFinance.chart(`${symbol}.NS`, {
                period1: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                period2: new Date().toISOString().split('T')[0],
                interval: '1d'
            });
            const closes = quotes.map(q => q.close);
            const rsi = ta.RSI.calculate({ values: closes, period: 14 });
            return rsi;
        } catch (error) {
            logger.error(`Error getting RSI for ${symbol}:`, error);
            return [];
        }
    }
  /**
   * Determines the final trading decision based on all factors
   * @param {Object} factors - All technical and sentiment factors
   * @returns {string} - Trading decision
   */
  determineTradeDecision(factors) {
  const rsi = factors.rsi;
  const sentiment = factors.sentiment;
  const technicalConditions = factors.technicalConditions;
  const sentimentConditions = factors.sentimentConditions;
  
  const { isStronglyOversold, isOversold, isStronglyOverbought, isOverbought } = technicalConditions;
  const { isStrongBullish, isBullish, isStrongBearish, isBearish,
    hasSufficientNews, hasHighVolumeNews } = sentimentConditions;
    
  // Strong Buy signals
  if (isStronglyOversold && isStrongBullish && hasSufficientNews && rsi.trend.includes('BULLISH')) {
    return 'STRONG_BUY';
  }
  
  // Buy signals - with symmetrical conditions
  if ((isOversold && isBullish && hasSufficientNews) || 
      (isOversold && sentiment.trend === 'IMPROVING' && hasSufficientNews)) {
    return 'BUY';
  }
  
  // Strong Sell signals
  if (isStronglyOverbought && isStrongBearish && hasSufficientNews && rsi.trend.includes('BEARISH')) {
    return 'STRONG_SELL';
  }
  
  // Sell signals - with symmetrical conditions
  if ((isOverbought && isBearish && hasSufficientNews) || 
      (isOverbought && sentiment.trend === 'DETERIORATING' && hasSufficientNews)) {
    return 'SELL';
  }
  
  // Additional confluence-based signals
  if (rsi.trend === 'STRONGLY_BULLISH' && sentiment.trend === 'IMPROVING' && hasHighVolumeNews) {
    return 'BUY'; // Trend confirmation
  }
  
  if (rsi.trend === 'STRONGLY_BEARISH' && sentiment.trend === 'DETERIORATING' && hasHighVolumeNews) {
    return 'SELL'; // Trend confirmation
  }
  
  return 'HOLD';
}
}

export default StrategyService;
