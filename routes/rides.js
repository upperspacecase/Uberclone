const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();

// Request a ride
router.post('/request', (req, res) => {
  try {
    const { pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng, dropoffAddress, driverId } = req.body;

    if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
      return res.status(400).json({ error: 'Pickup and dropoff locations are required' });
    }

    const rideId = uuidv4();

    // Calculate distance
    const R = 3959;
    const dLat = (dropoffLat - pickupLat) * Math.PI / 180;
    const dLng = (dropoffLng - pickupLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(pickupLat * Math.PI / 180) * Math.cos(dropoffLat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const duration = distance * 2; // ~30mph average

    if (driverId) {
      // Direct request to a specific driver
      const driver = db.prepare('SELECT * FROM users WHERE id = ? AND role = \'driver\'').get(driverId);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      const fare = Math.max(
        driver.min_fare,
        (driver.base_fare + (driver.per_mile_rate * distance) + (driver.per_minute_rate * duration)) * driver.surge_multiplier
      );

      db.prepare(`
        INSERT INTO rides (id, rider_id, driver_id, pickup_lat, pickup_lng, pickup_address,
          dropoff_lat, dropoff_lng, dropoff_address, estimated_distance, estimated_duration, estimated_fare, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested')
      `).run(rideId, req.user.id, driverId, pickupLat, pickupLng, pickupAddress || '',
        dropoffLat, dropoffLng, dropoffAddress || '',
        Math.round(distance * 10) / 10, Math.round(duration), Math.round(fare * 100) / 100);

      // Notify driver via Socket.IO
      const io = req.app.get('io');
      const connectedUsers = req.app.get('connectedUsers');
      const driverSocket = connectedUsers.get(driverId);
      if (driverSocket) {
        const rider = db.prepare('SELECT name, rating FROM users WHERE id = ?').get(req.user.id);
        io.to(driverSocket.socketId).emit('ride-request', {
          rideId,
          rider,
          pickup: { lat: pickupLat, lng: pickupLng, address: pickupAddress },
          dropoff: { lat: dropoffLat, lng: dropoffLng, address: dropoffAddress },
          estimatedFare: Math.round(fare * 100) / 100,
          estimatedDistance: Math.round(distance * 10) / 10
        });
      }

      const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId);
      return res.status(201).json(ride);
    }

    // Open request - broadcast to all nearby drivers
    db.prepare(`
      INSERT INTO rides (id, rider_id, pickup_lat, pickup_lng, pickup_address,
        dropoff_lat, dropoff_lng, dropoff_address, estimated_distance, estimated_duration, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested')
    `).run(rideId, req.user.id, pickupLat, pickupLng, pickupAddress || '',
      dropoffLat, dropoffLng, dropoffAddress || '',
      Math.round(distance * 10) / 10, Math.round(duration));

    // Broadcast to all online drivers
    const io = req.app.get('io');
    const rider = db.prepare('SELECT name, rating FROM users WHERE id = ?').get(req.user.id);
    io.to('drivers').emit('new-ride-available', {
      rideId,
      rider,
      pickup: { lat: pickupLat, lng: pickupLng, address: pickupAddress },
      dropoff: { lat: dropoffLat, lng: dropoffLng, address: dropoffAddress },
      estimatedDistance: Math.round(distance * 10) / 10
    });

    const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId);
    res.status(201).json(ride);
  } catch (err) {
    console.error('Request ride error:', err);
    res.status(500).json({ error: 'Failed to request ride' });
  }
});

// Driver makes an offer on an open ride
router.post('/:rideId/offer', (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ error: 'Only drivers can make offers' });
    }

    const { offeredFare, estimatedArrival, message } = req.body;
    const { rideId } = req.params;

    const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'requested') return res.status(400).json({ error: 'Ride is no longer available' });

    const offerId = uuidv4();
    db.prepare(`
      INSERT INTO ride_offers (id, ride_id, driver_id, offered_fare, estimated_arrival, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(offerId, rideId, req.user.id, offeredFare, estimatedArrival || null, message || null);

    // Notify rider
    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    const riderSocket = connectedUsers.get(ride.rider_id);
    const driver = db.prepare(
      'SELECT id, name, rating, total_ratings, vehicle_make, vehicle_model, vehicle_color, vehicle_plate FROM users WHERE id = ?'
    ).get(req.user.id);

    if (riderSocket) {
      io.to(riderSocket.socketId).emit('ride-offer', {
        offerId,
        rideId,
        driver,
        offeredFare,
        estimatedArrival,
        message
      });
    }

    res.status(201).json({ offerId, status: 'pending' });
  } catch (err) {
    console.error('Offer error:', err);
    res.status(500).json({ error: 'Failed to make offer' });
  }
});

// Rider accepts an offer
router.post('/offers/:offerId/accept', (req, res) => {
  try {
    const offer = db.prepare('SELECT * FROM ride_offers WHERE id = ?').get(req.params.offerId);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });

    const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(offer.ride_id);
    if (ride.rider_id !== req.user.id) return res.status(403).json({ error: 'Not your ride' });

    // Accept the offer
    db.prepare(`UPDATE ride_offers SET status = 'accepted' WHERE id = ?`).run(offer.id);
    db.prepare(`UPDATE ride_offers SET status = 'rejected' WHERE ride_id = ? AND id != ?`).run(offer.ride_id, offer.id);
    db.prepare(`
      UPDATE rides SET driver_id = ?, estimated_fare = ?, status = 'accepted', accepted_at = datetime('now')
      WHERE id = ?
    `).run(offer.driver_id, offer.offered_fare, offer.ride_id);
    db.prepare(`UPDATE users SET is_available = 0 WHERE id = ?`).run(offer.driver_id);

    // Notify driver
    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    const driverSocket = connectedUsers.get(offer.driver_id);
    if (driverSocket) {
      io.to(driverSocket.socketId).emit('offer-accepted', { rideId: offer.ride_id, offerId: offer.id });
    }

    const updatedRide = db.prepare('SELECT * FROM rides WHERE id = ?').get(offer.ride_id);
    res.json(updatedRide);
  } catch (err) {
    console.error('Accept offer error:', err);
    res.status(500).json({ error: 'Failed to accept offer' });
  }
});

// Driver accepts a direct ride request
router.post('/:rideId/accept', (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ error: 'Only drivers can accept rides' });
    }

    const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(req.params.rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'requested') return res.status(400).json({ error: 'Ride is no longer available' });
    if (ride.driver_id && ride.driver_id !== req.user.id) {
      return res.status(403).json({ error: 'This ride was requested from another driver' });
    }

    db.prepare(`
      UPDATE rides SET driver_id = ?, status = 'accepted', accepted_at = datetime('now') WHERE id = ?
    `).run(req.user.id, ride.id);
    db.prepare(`UPDATE users SET is_available = 0 WHERE id = ?`).run(req.user.id);

    // Notify rider
    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    const riderSocket = connectedUsers.get(ride.rider_id);
    const driver = db.prepare(
      'SELECT id, name, rating, vehicle_make, vehicle_model, vehicle_color, vehicle_plate, lat, lng FROM users WHERE id = ?'
    ).get(req.user.id);

    if (riderSocket) {
      io.to(riderSocket.socketId).emit('ride-accepted', { rideId: ride.id, driver });
    }

    const updatedRide = db.prepare('SELECT * FROM rides WHERE id = ?').get(ride.id);
    res.json(updatedRide);
  } catch (err) {
    res.status(500).json({ error: 'Failed to accept ride' });
  }
});

// Update ride status (driver_arriving, in_progress, completed)
router.post('/:rideId/status', (req, res) => {
  try {
    const { status } = req.body;
    const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(req.params.rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const validTransitions = {
      'accepted': ['driver_arriving', 'cancelled'],
      'driver_arriving': ['in_progress', 'cancelled'],
      'in_progress': ['completed'],
      'requested': ['cancelled']
    };

    if (!validTransitions[ride.status]?.includes(status)) {
      return res.status(400).json({ error: `Cannot transition from ${ride.status} to ${status}` });
    }

    const updates = { status };
    if (status === 'in_progress') updates.picked_up_at = "datetime('now')";
    if (status === 'completed') {
      updates.completed_at = "datetime('now')";
      updates.final_fare = ride.estimated_fare;
    }
    if (status === 'cancelled') {
      updates.cancelled_at = "datetime('now')";
      updates.cancelled_by = req.user.id;
    }

    if (status === 'completed') {
      db.prepare(`
        UPDATE rides SET status = ?, final_fare = ?, completed_at = datetime('now') WHERE id = ?
      `).run(status, ride.estimated_fare, ride.id);
      db.prepare(`UPDATE users SET is_available = 1 WHERE id = ?`).run(ride.driver_id);

      // Create payment record
      const paymentId = require('uuid').v4();
      db.prepare(`
        INSERT INTO payments (id, ride_id, rider_id, driver_id, amount, status)
        VALUES (?, ?, ?, ?, ?, 'completed')
      `).run(paymentId, ride.id, ride.rider_id, ride.driver_id, ride.estimated_fare);
    } else if (status === 'cancelled') {
      db.prepare(`
        UPDATE rides SET status = ?, cancelled_at = datetime('now'), cancelled_by = ? WHERE id = ?
      `).run(status, req.user.id, ride.id);
      if (ride.driver_id) {
        db.prepare(`UPDATE users SET is_available = 1 WHERE id = ?`).run(ride.driver_id);
      }
    } else if (status === 'in_progress') {
      db.prepare(`UPDATE rides SET status = ?, picked_up_at = datetime('now') WHERE id = ?`)
        .run(status, ride.id);
    } else {
      db.prepare(`UPDATE rides SET status = ? WHERE id = ?`).run(status, ride.id);
    }

    // Notify other party
    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    const otherUserId = req.user.id === ride.rider_id ? ride.driver_id : ride.rider_id;
    const otherSocket = connectedUsers.get(otherUserId);
    if (otherSocket) {
      io.to(otherSocket.socketId).emit('ride-status-update', { rideId: ride.id, status });
    }

    const updatedRide = db.prepare('SELECT * FROM rides WHERE id = ?').get(ride.id);
    res.json(updatedRide);
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'Failed to update ride status' });
  }
});

// Rate a ride
router.post('/:rideId/rate', (req, res) => {
  try {
    const { rating, review } = req.body;
    const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(req.params.rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'completed') return res.status(400).json({ error: 'Can only rate completed rides' });

    if (req.user.role === 'rider') {
      db.prepare('UPDATE rides SET driver_rating = ?, driver_review = ? WHERE id = ?')
        .run(rating, review || null, ride.id);
      // Update driver's average rating
      const avg = db.prepare(
        `SELECT AVG(driver_rating) as avg, COUNT(*) as count FROM rides WHERE driver_id = ? AND driver_rating IS NOT NULL`
      ).get(ride.driver_id);
      db.prepare('UPDATE users SET rating = ?, total_ratings = ? WHERE id = ?')
        .run(Math.round(avg.avg * 10) / 10, avg.count, ride.driver_id);
    } else {
      db.prepare('UPDATE rides SET rider_rating = ?, rider_review = ? WHERE id = ?')
        .run(rating, review || null, ride.id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to rate ride' });
  }
});

// Get ride history
router.get('/history', (req, res) => {
  try {
    const field = req.user.role === 'rider' ? 'rider_id' : 'driver_id';
    const rides = db.prepare(`
      SELECT r.*,
        u_rider.name as rider_name, u_rider.rating as rider_user_rating,
        u_driver.name as driver_name, u_driver.rating as driver_user_rating,
        u_driver.vehicle_make, u_driver.vehicle_model, u_driver.vehicle_color
      FROM rides r
      LEFT JOIN users u_rider ON r.rider_id = u_rider.id
      LEFT JOIN users u_driver ON r.driver_id = u_driver.id
      WHERE r.${field} = ?
      ORDER BY r.requested_at DESC
      LIMIT 50
    `).all(req.user.id);
    res.json(rides);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ride history' });
  }
});

// Get active ride
router.get('/active', (req, res) => {
  try {
    const field = req.user.role === 'rider' ? 'rider_id' : 'driver_id';
    const ride = db.prepare(`
      SELECT r.*,
        u_rider.name as rider_name, u_rider.phone as rider_phone, u_rider.rating as rider_user_rating,
        u_driver.name as driver_name, u_driver.phone as driver_phone, u_driver.rating as driver_user_rating,
        u_driver.vehicle_make, u_driver.vehicle_model, u_driver.vehicle_color, u_driver.vehicle_plate,
        u_driver.lat as driver_lat, u_driver.lng as driver_lng
      FROM rides r
      LEFT JOIN users u_rider ON r.rider_id = u_rider.id
      LEFT JOIN users u_driver ON r.driver_id = u_driver.id
      WHERE r.${field} = ? AND r.status IN ('requested', 'accepted', 'driver_arriving', 'in_progress')
      ORDER BY r.requested_at DESC
      LIMIT 1
    `).get(req.user.id);
    res.json(ride || null);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active ride' });
  }
});

// Get offers for a ride
router.get('/:rideId/offers', (req, res) => {
  try {
    const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(req.params.rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.rider_id !== req.user.id) return res.status(403).json({ error: 'Not your ride' });

    const offers = db.prepare(`
      SELECT o.*, u.name as driver_name, u.rating as driver_rating, u.total_ratings,
             u.vehicle_make, u.vehicle_model, u.vehicle_color, u.vehicle_plate, u.profile_photo
      FROM ride_offers o
      JOIN users u ON o.driver_id = u.id
      WHERE o.ride_id = ? AND o.status = 'pending'
      ORDER BY o.offered_fare ASC
    `).all(req.params.rideId);

    res.json(offers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

// Get available ride requests (for drivers)
router.get('/available', (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ error: 'Only drivers can view available rides' });
    }

    const rides = db.prepare(`
      SELECT r.*, u.name as rider_name, u.rating as rider_user_rating
      FROM rides r
      JOIN users u ON r.rider_id = u.id
      WHERE r.status = 'requested' AND (r.driver_id IS NULL OR r.driver_id = ?)
      ORDER BY r.requested_at DESC
      LIMIT 20
    `).all(req.user.id);

    res.json(rides);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch available rides' });
  }
});

module.exports = router;
