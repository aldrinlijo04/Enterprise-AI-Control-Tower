'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const logger = require('../utils/logger');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    logger.info(`MongoDB connected: ${process.env.MONGO_URI}`);
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    // Allow system to run without MongoDB in demo mode
    logger.warn('Running in memory-only mode (no MongoDB)');
  }
}

module.exports = { connectDB };
