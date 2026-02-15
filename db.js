const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'ridemarket.db'));

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL CHECK(role IN ('rider', 'driver')),
    -- Driver-specific fields
    vehicle_make TEXT,
    vehicle_model TEXT,
    vehicle_year INTEGER,
    vehicle_color TEXT,
    vehicle_plate TEXT,
    license_number TEXT,
    profile_photo TEXT,
    rating REAL DEFAULT 5.0,
    total_ratings INTEGER DEFAULT 0,
    -- Driver pricing (open market)
    base_fare REAL DEFAULT 5.00,
    per_mile_rate REAL DEFAULT 1.50,
    per_minute_rate REAL DEFAULT 0.25,
    surge_multiplier REAL DEFAULT 1.0,
    min_fare REAL DEFAULT 3.00,
    -- Location
    lat REAL,
    lng REAL,
    is_online INTEGER DEFAULT 0,
    is_available INTEGER DEFAULT 1,
    -- Metadata
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rides (
    id TEXT PRIMARY KEY,
    rider_id TEXT NOT NULL,
    driver_id TEXT,
    -- Locations
    pickup_lat REAL NOT NULL,
    pickup_lng REAL NOT NULL,
    pickup_address TEXT,
    dropoff_lat REAL NOT NULL,
    dropoff_lng REAL NOT NULL,
    dropoff_address TEXT,
    -- Pricing
    estimated_distance REAL,
    estimated_duration REAL,
    estimated_fare REAL,
    final_fare REAL,
    -- Status: requested, accepted, driver_arriving, in_progress, completed, cancelled
    status TEXT DEFAULT 'requested',
    -- Ratings
    rider_rating INTEGER,
    driver_rating INTEGER,
    rider_review TEXT,
    driver_review TEXT,
    -- Timestamps
    requested_at TEXT DEFAULT (datetime('now')),
    accepted_at TEXT,
    picked_up_at TEXT,
    completed_at TEXT,
    cancelled_at TEXT,
    cancelled_by TEXT,
    FOREIGN KEY (rider_id) REFERENCES users(id),
    FOREIGN KEY (driver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ride_offers (
    id TEXT PRIMARY KEY,
    ride_id TEXT NOT NULL,
    driver_id TEXT NOT NULL,
    offered_fare REAL NOT NULL,
    estimated_arrival INTEGER,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'expired')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (ride_id) REFERENCES rides(id),
    FOREIGN KEY (driver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    ride_id TEXT NOT NULL,
    rider_id TEXT NOT NULL,
    driver_id TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'refunded')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (ride_id) REFERENCES rides(id)
  );

  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online, is_available);
  CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
  CREATE INDEX IF NOT EXISTS idx_rides_rider ON rides(rider_id);
  CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id);
  CREATE INDEX IF NOT EXISTS idx_ride_offers_ride ON ride_offers(ride_id);
  CREATE INDEX IF NOT EXISTS idx_ride_offers_driver ON ride_offers(driver_id);
`);

module.exports = db;
