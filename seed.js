// Seed script to populate demo data for RideMarket
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const hashedPassword = bcrypt.hashSync('password123', 10);

// Demo drivers (located around NYC)
const drivers = [
  {
    name: 'Marcus Thompson', email: 'marcus@demo.com',
    vehicle_make: 'Toyota', vehicle_model: 'Camry', vehicle_year: 2022, vehicle_color: 'Silver', vehicle_plate: 'NYC 4521',
    base_fare: 4.00, per_mile_rate: 1.25, per_minute_rate: 0.20, surge_multiplier: 1.0, min_fare: 3.00,
    lat: 40.7580, lng: -73.9855, rating: 4.9, total_ratings: 312
  },
  {
    name: 'Sarah Lee', email: 'sarah@demo.com',
    vehicle_make: 'Honda', vehicle_model: 'Accord', vehicle_year: 2023, vehicle_color: 'White', vehicle_plate: 'NYC 8834',
    base_fare: 5.00, per_mile_rate: 1.50, per_minute_rate: 0.25, surge_multiplier: 1.0, min_fare: 4.00,
    lat: 40.7484, lng: -73.9857, rating: 4.8, total_ratings: 198
  },
  {
    name: 'James Kim', email: 'james@demo.com',
    vehicle_make: 'BMW', vehicle_model: '3 Series', vehicle_year: 2023, vehicle_color: 'Black', vehicle_plate: 'NYC 2219',
    base_fare: 8.00, per_mile_rate: 2.50, per_minute_rate: 0.40, surge_multiplier: 1.0, min_fare: 6.00,
    lat: 40.7614, lng: -73.9776, rating: 5.0, total_ratings: 89
  },
  {
    name: 'Priya Patel', email: 'priya@demo.com',
    vehicle_make: 'Hyundai', vehicle_model: 'Sonata', vehicle_year: 2021, vehicle_color: 'Blue', vehicle_plate: 'NYC 6677',
    base_fare: 3.50, per_mile_rate: 1.10, per_minute_rate: 0.18, surge_multiplier: 1.0, min_fare: 2.50,
    lat: 40.7527, lng: -73.9772, rating: 4.7, total_ratings: 445
  },
  {
    name: 'David Chen', email: 'david@demo.com',
    vehicle_make: 'Tesla', vehicle_model: 'Model 3', vehicle_year: 2024, vehicle_color: 'Red', vehicle_plate: 'NYC 1100',
    base_fare: 7.00, per_mile_rate: 2.00, per_minute_rate: 0.35, surge_multiplier: 1.2, min_fare: 5.00,
    lat: 40.7489, lng: -73.9680, rating: 4.9, total_ratings: 156
  },
  {
    name: 'Maria Garcia', email: 'maria@demo.com',
    vehicle_make: 'Ford', vehicle_model: 'Escape', vehicle_year: 2022, vehicle_color: 'Green', vehicle_plate: 'NYC 3344',
    base_fare: 4.50, per_mile_rate: 1.35, per_minute_rate: 0.22, surge_multiplier: 1.0, min_fare: 3.50,
    lat: 40.7549, lng: -73.9840, rating: 4.6, total_ratings: 278
  }
];

const insertDriver = db.prepare(`
  INSERT OR IGNORE INTO users (id, email, password, name, phone, role,
    vehicle_make, vehicle_model, vehicle_year, vehicle_color, vehicle_plate,
    base_fare, per_mile_rate, per_minute_rate, surge_multiplier, min_fare,
    lat, lng, is_online, is_available, rating, total_ratings)
  VALUES (?, ?, ?, ?, ?, 'driver', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
`);

const insertAll = db.transaction(() => {
  for (const d of drivers) {
    insertDriver.run(
      uuidv4(), d.email, hashedPassword, d.name, '555-0100',
      d.vehicle_make, d.vehicle_model, d.vehicle_year, d.vehicle_color, d.vehicle_plate,
      d.base_fare, d.per_mile_rate, d.per_minute_rate, d.surge_multiplier, d.min_fare,
      d.lat, d.lng, d.rating, d.total_ratings
    );
  }
});

insertAll();

// Create a demo rider too
const riderExists = db.prepare('SELECT id FROM users WHERE email = ?').get('rider@demo.com');
if (!riderExists) {
  db.prepare(`
    INSERT INTO users (id, email, password, name, phone, role)
    VALUES (?, ?, ?, ?, ?, 'rider')
  `).run(uuidv4(), 'rider@demo.com', hashedPassword, 'Demo Rider', '555-0199');
}

const count = db.prepare('SELECT COUNT(*) as c FROM users WHERE role = \'driver\'').get();
console.log(`Seeded ${count.c} drivers and 1 demo rider.`);
console.log('Demo login: rider@demo.com / password123');
console.log('Demo driver: marcus@demo.com / password123');
