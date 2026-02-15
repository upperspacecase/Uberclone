const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', (req, res) => {
  try {
    const { email, password, name, phone, role, vehicle } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Email, password, name, and role are required' });
    }

    if (!['rider', 'driver'].includes(role)) {
      return res.status(400).json({ error: 'Role must be rider or driver' });
    }

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const id = uuidv4();

    if (role === 'driver') {
      db.prepare(`
        INSERT INTO users (id, email, password, name, phone, role, vehicle_make, vehicle_model, vehicle_year, vehicle_color, vehicle_plate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, email, hashedPassword, name, phone || null, role,
        vehicle?.make || null, vehicle?.model || null, vehicle?.year || null,
        vehicle?.color || null, vehicle?.plate || null
      );
    } else {
      db.prepare(`
        INSERT INTO users (id, email, password, name, phone, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, email, hashedPassword, name, phone || null, role);
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const token = generateToken(user);

    const { password: _, ...safeUser } = user;
    res.status(201).json({ token, user: safeUser });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);
    const { password: _, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update profile
router.put('/me', authenticateToken, (req, res) => {
  try {
    const { name, phone, vehicle, base_fare, per_mile_rate, per_minute_rate, surge_multiplier, min_fare } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (user.role === 'driver') {
      db.prepare(`
        UPDATE users SET
          name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          vehicle_make = COALESCE(?, vehicle_make),
          vehicle_model = COALESCE(?, vehicle_model),
          vehicle_year = COALESCE(?, vehicle_year),
          vehicle_color = COALESCE(?, vehicle_color),
          vehicle_plate = COALESCE(?, vehicle_plate),
          base_fare = COALESCE(?, base_fare),
          per_mile_rate = COALESCE(?, per_mile_rate),
          per_minute_rate = COALESCE(?, per_minute_rate),
          surge_multiplier = COALESCE(?, surge_multiplier),
          min_fare = COALESCE(?, min_fare),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        name, phone,
        vehicle?.make, vehicle?.model, vehicle?.year, vehicle?.color, vehicle?.plate,
        base_fare, per_mile_rate, per_minute_rate, surge_multiplier, min_fare,
        req.user.id
      );
    } else {
      db.prepare(`
        UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), updated_at = datetime('now')
        WHERE id = ?
      `).run(name, phone, req.user.id);
    }

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
