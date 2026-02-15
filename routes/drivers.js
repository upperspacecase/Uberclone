const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all online drivers (public - for map display)
router.get('/online', (req, res) => {
  try {
    const drivers = db.prepare(`
      SELECT id, name, rating, total_ratings, vehicle_make, vehicle_model, vehicle_year,
             vehicle_color, vehicle_plate, base_fare, per_mile_rate, per_minute_rate,
             surge_multiplier, min_fare, lat, lng, profile_photo
      FROM users
      WHERE role = 'driver' AND is_online = 1 AND is_available = 1
    `).all();
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

// Get nearby drivers with fare estimates
router.post('/nearby', (req, res) => {
  try {
    const { lat, lng, destLat, destLng, radiusMiles } = req.body;
    const radius = radiusMiles || 10;

    // Approximate: 1 degree lat ≈ 69 miles
    const latRange = radius / 69;
    const lngRange = radius / (69 * Math.cos((lat * Math.PI) / 180));

    const drivers = db.prepare(`
      SELECT id, name, rating, total_ratings, vehicle_make, vehicle_model, vehicle_year,
             vehicle_color, vehicle_plate, base_fare, per_mile_rate, per_minute_rate,
             surge_multiplier, min_fare, lat, lng, profile_photo
      FROM users
      WHERE role = 'driver'
        AND is_online = 1
        AND is_available = 1
        AND lat BETWEEN ? AND ?
        AND lng BETWEEN ? AND ?
    `).all(lat - latRange, lat + latRange, lng - lngRange, lng + lngRange);

    // Calculate estimated distance and fare for each driver
    const driversWithFares = drivers.map(driver => {
      const distMiles = haversineDistance(lat, lng, destLat, destLng);
      const estMinutes = distMiles * 2; // rough estimate: 30mph average
      const driverDistMiles = haversineDistance(lat, lng, driver.lat, driver.lng);
      const etaMinutes = Math.max(1, Math.round(driverDistMiles * 2));

      const fare = Math.max(
        driver.min_fare,
        (driver.base_fare + (driver.per_mile_rate * distMiles) + (driver.per_minute_rate * estMinutes)) * driver.surge_multiplier
      );

      return {
        ...driver,
        estimated_fare: Math.round(fare * 100) / 100,
        estimated_distance: Math.round(distMiles * 10) / 10,
        estimated_duration: Math.round(estMinutes),
        eta_minutes: etaMinutes,
        distance_from_pickup: Math.round(driverDistMiles * 10) / 10
      };
    });

    // Sort by fare (lowest first)
    driversWithFares.sort((a, b) => a.estimated_fare - b.estimated_fare);

    res.json(driversWithFares);
  } catch (err) {
    console.error('Nearby drivers error:', err);
    res.status(500).json({ error: 'Failed to fetch nearby drivers' });
  }
});

// Toggle driver online status
router.post('/toggle-online', authenticateToken, (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ error: 'Only drivers can toggle online status' });
    }

    const user = db.prepare('SELECT is_online FROM users WHERE id = ?').get(req.user.id);
    const newStatus = user.is_online ? 0 : 1;

    db.prepare('UPDATE users SET is_online = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(newStatus, req.user.id);

    res.json({ is_online: !!newStatus });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle status' });
  }
});

// Update driver location
router.post('/location', authenticateToken, (req, res) => {
  try {
    const { lat, lng } = req.body;
    db.prepare('UPDATE users SET lat = ?, lng = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(lat, lng, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// Get driver stats
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const totalRides = db.prepare(
      `SELECT COUNT(*) as count FROM rides WHERE driver_id = ? AND status = 'completed'`
    ).get(req.user.id);

    const totalEarnings = db.prepare(
      `SELECT COALESCE(SUM(final_fare), 0) as total FROM rides WHERE driver_id = ? AND status = 'completed'`
    ).get(req.user.id);

    const todayEarnings = db.prepare(
      `SELECT COALESCE(SUM(final_fare), 0) as total FROM rides WHERE driver_id = ? AND status = 'completed' AND date(completed_at) = date('now')`
    ).get(req.user.id);

    const avgRating = db.prepare(
      `SELECT rating, total_ratings FROM users WHERE id = ?`
    ).get(req.user.id);

    res.json({
      total_rides: totalRides.count,
      total_earnings: totalEarnings.total,
      today_earnings: todayEarnings.total,
      rating: avgRating.rating,
      total_ratings: avgRating.total_ratings
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Haversine distance calculation
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

module.exports = router;
