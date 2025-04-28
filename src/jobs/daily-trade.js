import { KiteConnect } from 'kiteconnect';
import Trade from '../models/Trade.js';
import Portfolio from '../models/Portfolio.js';
import config from '../config/index.js';
import yahooFinance from 'yahoo-finance2';
import { getTradingSignal } from '../services/strategy.js';
import logger from '../utils/logger.js';
import { processNews } from '../services/news.js'; // Import processNews
import moment from 'moment';

const kc = new KiteConnect({
  api_key: config.ZERODHA.API_KEY,
  access_token: config.ZERODHA.ACCESS_TOKEN
});

/**
 * Calculates position size based on risk management rules
 * @param {number} price - Current price of the asset
 * @param {number} riskPercent - Percentage of capital to risk (default: 2%)
 * @param {number} multiplier - Position size multiplier for strong signals
 * @returns {number} - Quantity to trade
 */
function calculateQuantity(price, riskPercent = config.RISK_PERCENT || 2, multiplier = 1) {
  const riskAmount = (config.CAPITAL * riskPercent) / 100;
  return Math.floor((riskAmount * multiplier) / price);
}

/**
 * Gets current market price for a symbol
 * @param {string} symbol - Stock symbol
 * @returns {Promise<number|null>} - Current price or null on error
 */
async function getCurrentPrice(symbol) {
  try {
    const quote = await yahooFinance.quote(`${symbol}.NS`);
    return quote.regularMarketPrice;
  } catch (error) {
    logger.error(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Failed to get price for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Places an order with the broker
 * @param {Object} orderParams - Order parameters
 * @returns {Promise<Object>} - Order response
 */
async function placeOrder(orderParams) {
  try {
    logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Placing order: ${JSON.stringify(orderParams)}`);
    return await kc.placeOrder(orderParams);
  } catch (error) {
    logger.error(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Order placement failed:`, error);
    throw error;
  }
}

/**
 * Executes daily trading strategy for the watchlist
 */
export async function executeDailyTrades() {
  try {
    logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Starting daily trading execution`);

    // Check if market is open
    const today = new Date();
    if (today.getDay() === 0 || today.getDay() === 6) {
      logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Market closed (weekend). Skipping trades.`);
      return;
    }

    // Process news (if available) - This happens before we start trading.
    let newsData;
    try {
      newsData = await processNews();
    } catch (newsError) {
      logger.error(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Error processing news:`, newsError);
      logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Continuing with core trading strategy.`);
    }

    // Process each symbol in watchlist
    for (const symbol of config.WATCHLIST) {
      try {
        logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Processing ${symbol}`);

        // Get current price
        const currentPrice = await getCurrentPrice(symbol);
        if (!currentPrice) {
          logger.warn(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Unable to get price for ${symbol}. Skipping.`);
          continue;
        }

        const action = await getTradingSignal(symbol, 20, 50, 14);

        // Log the trading signal
        logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Trading signal for ${symbol}: ${action} at price ${currentPrice}`);

        // Get the news data for the current symbol
        const symbolNews = newsData ? newsData.find((news) => news.symbol === symbol) : null;
        const newsSentiment = symbolNews ? symbolNews.sentiment : 0;

        let tradingMetrics = { action, price: currentPrice, newsSentiment };

        // Handle existing positions first
        await handleExistingPositions(symbol, currentPrice, action, tradingMetrics);

        // Check for new buy opportunities
        await checkForBuyOpportunities(symbol, currentPrice, action, tradingMetrics);

      } catch (symbolError) {
        logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Trading signal for ${symbol}: HOLD`);
        // Continue with next symbol
      }
    }
    await printPortfolioSummary();
    await printCurrentCapital();
    await printTradeHistoryForToday();
    logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Daily trading execution completed`);
  } catch (error) {
    logger.error(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Trade execution failed:`, error);
    throw error;
  }
}

/**
 * Handles existing positions (check for exit conditions)
 * @param {string} symbol - Stock symbol
 * @param {number} currentPrice - Current market price
 * @param {string} action - Strategy action
 * @param {Object} tradingMetrics - Metrics for logging
 */
async function handleExistingPositions(symbol, currentPrice, action, tradingMetrics) {
  // Get active holdings
  const activeHoldings = await Portfolio.find({ symbol, sold: false });

  for (const holding of activeHoldings) {
    let exitReason = null;

    // Calculate current P&L for logging
    const unrealizedPnL = (currentPrice - holding.buyPrice) * holding.quantity;
    const pnlPercent = ((currentPrice / holding.buyPrice) - 1) * 100;

    logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] ${symbol} position: ${holding.quantity} @ ${holding.buyPrice}, P&L: ${pnlPercent.toFixed(2)}%`);

    // Dynamic stop loss adjustment if in profit
    if (currentPrice > holding.buyPrice * 1.03 && holding.stopLoss < holding.buyPrice) {
      holding.stopLoss = Math.max(holding.stopLoss, holding.buyPrice);
      await holding.save();
      logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Updated stop loss to breakeven for ${symbol}`);
    }
    const newsSentiment = tradingMetrics.newsSentiment;
    // Check exit conditions
    if (currentPrice <= holding.stopLoss) {
      exitReason = 'STOP_LOSS';
    }
    else if (currentPrice >= holding.target) {
      exitReason = 'TARGET_HIT';
    }
    else if (action === 'SELL' || action === 'STRONG_SELL') {
      if (newsSentiment < -0.5 && action === 'SELL') {
        exitReason = 'STRATEGY_NEWS';
      } else if (newsSentiment < -0.8 && action === 'STRONG_SELL') {
        exitReason = 'STRATEGY_NEWS';
      }
      else {
        exitReason = 'STRATEGY';
      }
    }

    // Execute exit if needed
    if (exitReason) {
      try {
        const orderParams = {
          tradingsymbol: symbol,
          exchange: 'NSE',
          transaction_type: 'SELL',
          quantity: holding.quantity,
          order_type: 'MARKET',
          product: 'MIS'
        };

        await placeOrder(orderParams);

        // Update portfolio record
        holding.sold = true;
        holding.sellPrice = currentPrice;
        holding.sellDate = new Date();
        holding.exitReason = exitReason;
        holding.profitLoss = unrealizedPnL;
        await holding.save();

        // Log trade with metrics
        await new Trade({
          symbol,
          action: 'SELL',
          price: currentPrice,
          quantity: holding.quantity,
          exitReason,
          rsiAtEntry: tradingMetrics.rsi,
          newsSentiment: tradingMetrics.newsSentiment,
          capitalUsed: holding.buyPrice * holding.quantity,
          profitLoss: unrealizedPnL,
          profitLossPercent: pnlPercent
        }).save();

        logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Exited ${symbol} position: ${holding.quantity} shares @ ${currentPrice}, Exit Reason: ${exitReason}, P&L: ${pnlPercent.toFixed(2)}%`);
      } catch (exitError) {
        logger.error(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Failed to exit ${symbol} position:`, exitError);
      }
    }
  }
}

/**
 * Checks for new buying opportunities
 * @param {string} symbol - Stock symbol
 * @param {number} currentPrice - Current market price
 * @param {string} action - Strategy action 
 * @param {Object} tradingMetrics - Metrics for logging
 */
async function checkForBuyOpportunities(symbol, currentPrice, action, tradingMetrics) {
  // Get active holdings
  const activeHoldings = await Portfolio.find({ symbol, sold: false });

  // Check if we already have a position
  if (activeHoldings.length > 0) {
    logger.debug(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Already have position in ${symbol}. Skipping buy check.`);
    return;
  }

  // Check for buy signals from strategy
  const newsSentiment = tradingMetrics.newsSentiment;
  if (action === 'BUY' || action === 'STRONG_BUY') {
    if (newsSentiment < -0.8 && action === 'BUY') {
      logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Skipping buy opportunity on ${symbol} due to negative news sentiment`);
      return;
    }
    if (newsSentiment < -0.9 && action === 'STRONG_BUY') {
      logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Skipping buy opportunity on ${symbol} due to negative news sentiment`);
      return;
    }
    // Determine position size based on signal strength
    const positionMultiplier = action === 'STRONG_BUY' ? 1.5 : 1;
    const quantity = calculateQuantity(currentPrice, config.RISK_PERCENT, positionMultiplier);

    // Skip if quantity would be zero
    if (quantity <= 0) {
      logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] ${symbol} buy signal, but quantity would be 0. Skipping.`);
      return;
    }

    try {
      const orderParams = {
        tradingsymbol: symbol,
        exchange: 'NSE',
        transaction_type: 'BUY',
        quantity,
        order_type: 'MARKET',
        product: 'MIS'
      };

      await placeOrder(orderParams);

      // Calculate risk levels
      const stopLossLevel = action === 'STRONG_BUY' ?
        currentPrice * 0.96 : // Tighter stop for high conviction
        currentPrice * 0.95;  // Regular stop loss

      const targetLevel = action === 'STRONG_BUY' ?
        currentPrice * 1.12 : // Higher target for high conviction
        currentPrice * 1.10;  // Regular target

      // Create portfolio entry
      await new Portfolio({
        symbol,
        buyPrice: currentPrice,
        quantity,
        buyDate: new Date(),
        stopLoss: stopLossLevel,
        target: targetLevel,
        signalStrength: action
      }).save();
      const capitalUsed = currentPrice * quantity;
      // Log trade with metrics
      await new Trade({
        symbol,
        action: 'BUY',
        price: currentPrice,
        quantity,
        rsiAtEntry: tradingMetrics.rsi,
        newsSentiment: tradingMetrics.newsSentiment,
        capitalUsed: capitalUsed,
        signalStrength: action
      }).save();

      logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Bought ${symbol}: ${quantity} shares @ ${currentPrice}, Invested: ${capitalUsed}`);
    } catch (buyError) {
      logger.error(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Failed to enter ${symbol} position:`, buyError);
    }
  }
}
/**
 * Prints a summary of the current portfolio.
 */
async function printPortfolioSummary() {
  try {
    logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] --- Portfolio Summary ---`);
    const activeHoldings = await Portfolio.find({ sold: false });
    if (activeHoldings.length === 0) {
      logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] No active holdings.`);
    } else {
      let totalUnrealizedPnL = 0;
      for (const holding of activeHoldings) {
        const currentPrice = await getCurrentPrice(holding.symbol);
        const unrealizedPnL = (currentPrice - holding.buyPrice) * holding.quantity;
        totalUnrealizedPnL += unrealizedPnL;
        const pnlPercent = ((currentPrice / holding.buyPrice) - 1) * 100;
        logger.info(
          `[${moment().format('YYYY-MM-DD HH:mm:ss')}] ${holding.symbol}: ${holding.quantity} shares @ ${holding.buyPrice}, Current Price: ${currentPrice}, Unrealized P&L: ${unrealizedPnL.toFixed(2)} (${pnlPercent.toFixed(2)}%)`
        );
      }
      logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Total Unrealized P&L: ${totalUnrealizedPnL.toFixed(2)}`);
    }
    logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] --------------------------`);
  } catch (error) {
    logger.error(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Error printing portfolio summary:`, error);
  }
}

/**
 * Prints the current available capital.
 */
async function printCurrentCapital() {
  try {
    // Calculate the total capital used in active positions
    const activeHoldings = await Portfolio.find({ sold: false });
    let capitalUsed = 0;
    for (const holding of activeHoldings) {
      capitalUsed += holding.buyPrice * holding.quantity;
    }

    // Calculate the current capital available
    const currentCapital = config.CAPITAL - capitalUsed;

    logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] --- Capital Summary ---`);
    logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Initial Capital: ${config.CAPITAL}`);
    logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Capital Used in Active Positions: ${capitalUsed}`);
    logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Current Capital Available: ${currentCapital}`);
    logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] -----------------------`);
  } catch (error) {
    logger.error(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Error printing current capital:`, error);
  }
}
/**
 * Prints the trade history for today.
 */
async function printTradeHistoryForToday() {
  try {
    logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] --- Trade History (Today) ---`);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0); // Set to start of day

    const trades = await Trade.find({ createdAt: { $gte: startOfToday } });
    if (trades.length === 0) {
      logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] No trades executed today.`);
    } else {
      for (const trade of trades) {
        logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] ${trade.action} ${trade.symbol}: ${trade.quantity} shares @ ${trade.price} (Capital Used: ${trade.capitalUsed}, P&L: ${trade.profitLoss}, P&L Percent: ${trade.profitLossPercent}), Signal Strength: ${trade.signalStrength}, News Sentiment: ${trade.newsSentiment}, Entry RSI: ${trade.rsiAtEntry} `);
      }
    }
    logger.info(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] ---------------------------`);
  } catch (error) {
    logger.error(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Error printing trade history:`, error);
  }
}
