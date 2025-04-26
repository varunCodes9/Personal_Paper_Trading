import { KiteConnect } from 'kiteconnect';
import Trade from '../models/Trade.js';
import Portfolio from '../models/Portfolio.js';
import config from '../config/index.js';
import yahooFinance from 'yahoo-finance2';
import { getTradingSignal } from '../services/strategy.js';
import logger from '../utils/logger.js';

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
    logger.error(`Failed to get price for ${symbol}:`, error.message);
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
    logger.info(`Placing order: ${JSON.stringify(orderParams)}`);
    return await kc.placeOrder(orderParams);
  } catch (error) {
    logger.error(`Order placement failed:`, error);
    throw error;
  }
}

/**
 * Executes daily trading strategy for the watchlist
 */
export async function executeDailyTrades() {
  try {
    logger.info('Starting daily trading execution');
    
    // Check if market is open
    const today = new Date();
    if (today.getDay() === 0 || today.getDay() === 6) {
      logger.info('Market closed (weekend). Skipping trades.');
      return;
    }
    
    // Process each symbol in watchlist
    for (const symbol of config.WATCHLIST) {
      try {
        logger.info(`Processing ${symbol}`);
        
        // Get current price
        const currentPrice = await getCurrentPrice(symbol);
        if (!currentPrice) {
          logger.warn(`Unable to get price for ${symbol}. Skipping.`);
          continue;
        }        
        
        const action = await getTradingSignal(symbol, 20, 50, 14);
        
        // Log the trading signal
        logger.info(`Trading signal for ${symbol}: ${action}`);

        let tradingMetrics = { action, price: currentPrice };
        
        // Handle existing positions first
        await handleExistingPositions(symbol, currentPrice, action, tradingMetrics);
        
        // Check for new buy opportunities
        await checkForBuyOpportunities(symbol, currentPrice, action, tradingMetrics);
        
      } catch (symbolError) {
        logger.info(`Trading signal for ${symbol}: HOLD`);
        // Continue with next symbol
      }
    }
    
    logger.info('Daily trading execution completed');
  } catch (error) {
    logger.error('Trade execution failed:', error);
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
    
    logger.info(`${symbol} position: ${holding.quantity} @ ${holding.buyPrice}, P&L: ${pnlPercent.toFixed(2)}%`);

    // Dynamic stop loss adjustment if in profit
    if (currentPrice > holding.buyPrice * 1.03 && holding.stopLoss < holding.buyPrice) {
      holding.stopLoss = Math.max(holding.stopLoss, holding.buyPrice);
      await holding.save();
      logger.info(`Updated stop loss to breakeven for ${symbol}`);
    }

    // Check exit conditions
    if (currentPrice <= holding.stopLoss) {
      exitReason = 'STOP_LOSS';
    } 
    else if (currentPrice >= holding.target) {
      exitReason = 'TARGET_HIT';
    }
    else if (action === 'SELL' || action === 'STRONG_SELL') {
      exitReason = 'STRATEGY';
      
      // For STRONG_SELL, we might want to exit the full position
      // For regular SELL, could implement partial exit strategy here
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
          newsSentiment: tradingMetrics.sentiment,
          capitalUsed: holding.buyPrice * holding.quantity,
          profitLoss: unrealizedPnL,
          profitLossPercent: pnlPercent
        }).save();
        
        logger.info(`Exited ${symbol} position: ${exitReason}, P&L: ${pnlPercent.toFixed(2)}%`);
      } catch (exitError) {
        logger.error(`Failed to exit ${symbol} position:`, exitError);
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
    logger.debug(`Already have position in ${symbol}. Skipping buy check.`);
    return;
  }
  
  // Check for buy signals from strategy
  if (action === 'BUY' || action === 'STRONG_BUY') {
    // Determine position size based on signal strength
    const positionMultiplier = action === 'STRONG_BUY' ? 1.5 : 1; 
    const quantity = calculateQuantity(currentPrice, config.RISK_PERCENT, positionMultiplier);
    
    // Skip if quantity would be zero
    if (quantity <= 0) {
      logger.info(`${symbol} buy signal, but quantity would be 0. Skipping.`);
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

      // Log trade with metrics
      await new Trade({
        symbol,
        action: 'BUY',
        price: currentPrice,
        quantity,
        rsiAtEntry: tradingMetrics.rsi,
        newsSentiment: tradingMetrics.sentiment,
        capitalUsed: currentPrice * quantity,
        signalStrength: action
      }).save();
      
      logger.info(`Entered ${symbol} position: ${quantity} shares @ ${currentPrice}`);
    } catch (buyError) {
      logger.error(`Failed to enter ${symbol} position:`, buyError);
    }
  }
}