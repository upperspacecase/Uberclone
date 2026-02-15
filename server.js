const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const authRoutes = require('./routes/auth');
const rideRoutes = require('./routes/rides');
const driverRoutes = require('./routes/drivers');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Make io accessible to routes
app.set('io', io);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/rides', authenticateToken, rideRoutes);
app.use('/api/drivers', driverRoutes);

// Socket.IO for real-time updates
const connectedUsers = new Map();

io.on('connection', (socket) => {
  socket.on('register', ({ userId, role }) => {
    connectedUsers.set(userId, { socketId: socket.id, role });
    socket.userId = userId;
    socket.role = role;

    if (role === 'driver') {
      socket.join('drivers');
    }
  });

  socket.on('driver-location-update', ({ lat, lng }) => {
    if (socket.userId) {
      db.prepare(`UPDATE users SET lat = ?, lng = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(lat, lng, socket.userId);
      // Broadcast to riders who have active rides with this driver
      const activeRides = db.prepare(
        `SELECT rider_id FROM rides WHERE driver_id = ? AND status IN ('accepted', 'in_progress')`
      ).all(socket.userId);
      activeRides.forEach(ride => {
        const rider = connectedUsers.get(ride.rider_id);
        if (rider) {
          io.to(rider.socketId).emit('driver-location', { driverId: socket.userId, lat, lng });
        }
      });
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
      if (socket.role === 'driver') {
        db.prepare(`UPDATE users SET is_online = 0 WHERE id = ?`).run(socket.userId);
      }
    }
  });
});

// Make connected users available
app.set('connectedUsers', connectedUsers);

// SPA fallback - serve index.html for all non-API routes
app.use((req, res, next) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io') && req.method === 'GET') {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    next();
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`RideMarket server running on port ${PORT}`);
});
