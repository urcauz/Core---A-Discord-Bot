let ioInstance = null;

function initializeDashboardSocket(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    console.log(`[socket] Dashboard client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`[socket] Dashboard client disconnected: ${socket.id}`);
    });
  });
}

function emitDashboardUpdate(eventType, payload = {}) {
  if (!ioInstance) return;
  ioInstance.emit('dashboard:update', {
    eventType,
    payload,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  initializeDashboardSocket,
  emitDashboardUpdate
};
