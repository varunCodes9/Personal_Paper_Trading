import News from '../models/News.js';
import { getRSI } from './market-data.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Evaluates a stock based on technical indicators and news sentiment
 * to generate trading signals (BUY, SELL, STRONG_BUY, STRONG_SELL, HOLD)
 * 
 * @param {string} symbol - Stock symbol to evaluate
 * @returns {string} Trading signal
 */
export async function evaluateStock(symbol) {
  try {
    // Validate input
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Invalid symbol provided');
    }

    // Get technical indicator (RSI)
    const rsiData = await getRSI(symbol);
    if (!rsiData || rsiData.length < 3) { // Need at least 3 data points for trend
      logger.warn(`Insufficient RSI data available for ${symbol}`);
      return 'HOLD';
    }
    
    // Get current RSI and analyze trend
    const currentRSI = rsiData[rsiData.length - 1];
    const rsiTrend = analyzeRsiTrend(rsiData.slice(-5)); // Last 5 days for trend
    
    logger.debug(`Current RSI for ${symbol}: ${currentRSI}, Trend: ${rsiTrend}`);

    // Get news sentiment
    const sentimentData = await getNewsSentiment(symbol);
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
    const decision = determineTradeDecision({
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
 * Analyzes RSI trend over given period
 * @param {Array} rsiData - Recent RSI values
 * @returns {string} - Trend description
 */
function analyzeRsiTrend(rsiData) {
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
async function getNewsSentiment(symbol) {
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
  
  const todayAvgSentiment = todaySentiment[0]?.avgSentiment || 0;
  const todayCount = todaySentiment[0]?.count || 0;
  const yesterdayAvgSentiment = yesterdaySentiment[0]?.avgSentiment || 0;
  
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
 * Determines the final trading decision based on all factors
 * @param {Object} factors - All technical and sentiment factors
 * @returns {string} - Trading decision
 */
function determineTradeDecision(factors) {
  const { rsi, sentiment, technicalConditions, sentimentConditions } = factors;
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