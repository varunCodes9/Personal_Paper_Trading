import mongoose from 'mongoose';
import config from '../config/index.js';

const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('📦 Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

export default connectDB;