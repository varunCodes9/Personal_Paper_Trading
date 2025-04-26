import 'dotenv/config';
export default {
    MONGODB_URI: process.env.MONGODB_URI,
    ZERODHA: {
      API_KEY: process.env.ZERODHA_API_KEY,
      ACCESS_TOKEN: process.env.ZERODHA_ACCESS_TOKEN
    },
    WATCHLIST: process.env.WATCHLIST.split(','),
    RISK_PERCENT: parseFloat(process.env.RISK_PERCENT),
    CAPITAL: 10000 // ₹10k virtual
  };