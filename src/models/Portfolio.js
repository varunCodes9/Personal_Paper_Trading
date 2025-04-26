import mongoose from 'mongoose';

const portfolioSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  buyPrice: { type: Number, required: true },
  quantity: { type: Number, required: true },
  buyDate: { type: Date, default: Date.now },
  sold: { type: Boolean, default: false },
  sellPrice: { type: Number },
  sellDate: { type: Date },
  stopLoss: { type: Number },  // Dynamic stop-loss (e.g., 5% below buyPrice)
  target: { type: Number },    // Take-profit level
  exitReason: { type: String, enum: ['STRATEGY', 'STOP_LOSS', 'TARGET_HIT'] }
});

export default mongoose.model('Portfolio', portfolioSchema);