const express = require('express');
const mongoose = require('mongoose');

function createHealthRouter(client) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    const botReady = Boolean(client?.isReady?.());

    res.status(dbConnected && botReady ? 200 : 503).json({
      ok: dbConnected && botReady,
      timestamp: new Date().toISOString(),
      bot: {
        ready: botReady,
        userTag: client?.user?.tag || null,
        guilds: client?.guilds?.cache?.size ?? 0
      },
      database: {
        connected: dbConnected,
        state: mongoose.STATES[mongoose.connection.readyState]
      }
    });
  });

  return router;
}

module.exports = {
  createHealthRouter
};
