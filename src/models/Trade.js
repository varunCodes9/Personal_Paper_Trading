import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema({
  symbol: { 
    type: String, 
    required: true 
  },
  action: { 
    type: String, 
    enum: ['BUY', 'SELL', 'HOLD'], 
    required: true 
  },
  price: { 
    type: Number, 
    required: true 
  },
  quantity: { 
    type: Number, 
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  exitReason: { 
    type: String, 
    enum: ['STRATEGY', 'STOP_LOSS', 'TARGET_HIT', null],
    default: null 
  },
  // Additional useful fields
  rsiAtEntry: Number,
  newsSentiment: Number,
  capitalUsed: Number
});

export default mongoose.model('Trade', tradeSchema);