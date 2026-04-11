'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const Redis = require('ioredis');
const logger = require('./logger');

let redisClient = null;

function getRedisClient() {
  if (redisClient) return redisClient;

  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null, // don't retry — fall back to in-memory
  });

  redisClient.on('connect',  () => logger.info('Redis connected'));
  redisClient.on('error',    (e) => logger.warn(`Redis unavailable: ${e.message} — using in-memory fallback`));

  return redisClient;
}

// Simple in-memory fallback store when Redis is unavailable
const memStore = new Map();
const pubSubs   = new Map(); // channel -> [callback]

const cache = {
  async set(key, value, ttlSeconds = 300) {
    try {
      const client = getRedisClient();
      await client.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      memStore.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
    }
  },

  async get(key) {
    try {
      const client = getRedisClient();
      const raw = await client.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      const entry = memStore.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expires) { memStore.delete(key); return null; }
      return entry.value;
    }
  },

  async del(key) {
    try {
      const client = getRedisClient();
      await client.del(key);
    } catch {
      memStore.delete(key);
    }
  },

  // Pub/Sub backed by Redis or in-process EventEmitter fallback
  async publish(channel, message) {
    try {
      const client = getRedisClient();
      await client.publish(channel, JSON.stringify(message));
    } catch {
      const subs = pubSubs.get(channel) || [];
      subs.forEach(cb => cb(message));
    }
  },

  subscribe(channel, callback) {
    const subs = pubSubs.get(channel) || [];
    subs.push(callback);
    pubSubs.set(channel, subs);

    // Also try real Redis sub
    try {
      const sub = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });
      sub.subscribe(channel).catch(() => {});
      sub.on('message', (ch, msg) => {
        if (ch === channel) {
          try { callback(JSON.parse(msg)); } catch { callback(msg); }
        }
      });
    } catch { /* use in-memory */ }
  },
};

module.exports = { getRedisClient, cache };
