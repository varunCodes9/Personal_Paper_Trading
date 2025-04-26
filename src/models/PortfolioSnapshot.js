import mongoose from 'mongoose';

const snapshotSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  totalValue: Number,
  totalPnl: Number,
  holdings: [{
    symbol: String,
    pnl: Number,
    quantity: Number
  }]
});

export default mongoose.model('PortfolioSnapshot', snapshotSchema);