import 'dotenv/config';
export default {
    MONGODB_URI: process.env.MONGODB_URI,
    ZERODHA: {
      API_KEY: process.env.ZERODHA_API_KEY,
      ACCESS_TOKEN: process.env.ZERODHA_ACCESS_TOKEN
    },
    WATCHLIST: process.env.WATCHLIST ? process.env.WATCHLIST.split(',') : ['RELIANCE','TCS','HDFCBANK','INFOSYS','ICICIBANK','KOTAKBANK','HINDUNILVR','ITC','LT','AXISBANK'],
    RISK_PERCENT: parseFloat(process.env.RISK_PERCENT),
    CAPITAL: 100000 // ₹1L virtual
  };