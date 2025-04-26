import mongoose from 'mongoose';

const newsSchema = new mongoose.Schema({
    symbol: String,
  headline: { type: String, required: true },
  sentiment: { type: Number, min: -1, max: 1 },
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('News', newsSchema);