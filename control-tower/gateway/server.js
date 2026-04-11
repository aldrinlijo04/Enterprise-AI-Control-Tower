'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');

const { connectDB }            = require('../config/db.config');
const { bus }                  = require('../utils/eventBus');
const logger                   = require('../utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Routes
const ingestionRoutes  = require('./routes/ingestion.routes');
const aiRoutes         = require('./routes/ai.routes');
const twinRoutes       = require('./routes/twin.routes');
const decisionsRoutes  = require('./routes/decisions.routes');

// Services (singleton bootstraps)
const AgentCoordinator = require('../services/agents/agent.coordinator');
const TwinEngine       = require('../services/digital-twin/twin.engine');

const app  = express();
const PORT = parseInt(process.env.GATEWAY_PORT || '3000');

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ─── Health ───────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  service: 'AION Control Tower Gateway',
  status:  'UP',
  timestamp: new Date().toISOString(),
  version: '1.0.0',
}));

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/ingest',    ingestionRoutes);
app.use('/api/ai',        aiRoutes);
app.use('/api/twin',      twinRoutes);
app.use('/api/decisions', decisionsRoutes);
app.use('/api/alerts',    decisionsRoutes); // alerts are served via same router

// ─── Dashboard summary ────────────────────────────────────────
app.get('/api/dashboard', async (req, res, next) => {
  try {
    const TwinEng  = TwinEngine.getInstance();
    const Decision = require('../models/Decision.model');
    const Alert    = require('../models/Alert.model');

    const [twinState, openAlerts, pendingDecisions] = await Promise.allSettled([
      TwinEng.getAllStates(),
      Alert.countDocuments({ status: 'OPEN' }),
      Decision.countDocuments({ status: 'PENDING' }),
    ]);

    res.json({
      success: true,
      dashboard: {
        plants:              twinState.status === 'fulfilled' ? twinState.value : {},
        open_alerts:         openAlerts.status === 'fulfilled' ? openAlerts.value : 0,
        pending_decisions:   pendingDecisions.status === 'fulfilled' ? pendingDecisions.value : 0,
        timestamp:           new Date().toISOString(),
      }
    });
  } catch (e) { next(e); }
});

// ─── 404 / Error ─────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Bootstrap ───────────────────────────────────────────────
async function bootstrap() {
  // DB (non-blocking — system works without it)
  await connectDB();

  // Event bus
  await bus.init();

  // Digital twin
  const twin = TwinEngine.getInstance();
  await twin.init();

  // Agent coordinator (subscribes to event bus topics)
  const coordinator = AgentCoordinator.getInstance();
  await coordinator.start();

  app.listen(PORT, () => {
    logger.info(`═══════════════════════════════════════════`);
    logger.info(` AION Control Tower Gateway running`);
    logger.info(` http://localhost:${PORT}`);
    logger.info(` http://localhost:${PORT}/api/dashboard`);
    logger.info(`═══════════════════════════════════════════`);
  });
}

bootstrap().catch(err => {
  logger.error(`Bootstrap failed: ${err.message}`);
  process.exit(1);
});

module.exports = app;
