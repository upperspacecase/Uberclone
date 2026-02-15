// ===== RideMarket - Single Page Application =====

const API = '';
let currentUser = null;
let token = localStorage.getItem('rm_token');
let socket = null;
let map = null;
let markers = {};
let pickupMarker = null;
let dropoffMarker = null;
let routeLine = null;
let activeRide = null;
let selectedDriver = null;
let pollingInterval = null;

// ===== API Helper =====
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ===== Router =====
function navigate(page) {
  window.location.hash = page;
  render();
}

function getPage() {
  const hash = window.location.hash.slice(1) || '/';
  return hash;
}

window.addEventListener('hashchange', render);

// ===== Init =====
async function init() {
  if (token) {
    try {
      currentUser = await api('/api/auth/me');
      connectSocket();
    } catch (e) {
      token = null;
      localStorage.removeItem('rm_token');
    }
  }
  render();
}

// ===== Socket.IO =====
function connectSocket() {
  if (socket) socket.disconnect();
  socket = io();
  socket.emit('register', { userId: currentUser.id, role: currentUser.role });

  socket.on('ride-request', (data) => {
    showToast(`New ride request from ${data.rider.name}!`, 'info');
    if (getPage() === '/driver') render();
  });

  socket.on('ride-accepted', (data) => {
    showToast('Your ride has been accepted!', 'success');
    checkActiveRide();
  });

  socket.on('offer-accepted', (data) => {
    showToast('Your offer was accepted!', 'success');
    checkActiveRide();
  });

  socket.on('ride-offer', (data) => {
    showToast(`New offer: $${data.offeredFare.toFixed(2)} from ${data.driver.name}`, 'info');
    if (activeRide) loadOffers(activeRide.id);
  });

  socket.on('ride-status-update', (data) => {
    const messages = {
      'driver_arriving': 'Your driver is on the way!',
      'in_progress': 'Your ride has started!',
      'completed': 'Ride completed!',
      'cancelled': 'Ride was cancelled.'
    };
    showToast(messages[data.status] || `Ride status: ${data.status}`, data.status === 'cancelled' ? 'error' : 'success');
    checkActiveRide();
  });

  socket.on('driver-location', (data) => {
    if (markers[data.driverId]) {
      markers[data.driverId].setLatLng([data.lat, data.lng]);
    }
  });

  socket.on('new-ride-available', (data) => {
    showToast(`New ride available: ${data.estimatedDistance} mi`, 'info');
    if (getPage() === '/driver') loadAvailableRides();
  });
}

// ===== Render =====
function render() {
  const page = getPage();
  const app = document.getElementById('app');

  if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }

  if (!currentUser) {
    if (page === '/login' || page === '/signup') {
      renderAuth(page === '/signup');
    } else {
      renderLanding();
    }
  } else if (currentUser.role === 'rider') {
    renderRiderDashboard();
  } else {
    renderDriverDashboard();
  }
}

// ===== Landing Page =====
function renderLanding() {
  document.getElementById('app').innerHTML = `
    <!-- Navigation -->
    <nav class="landing-nav">
      <div class="container">
        <div class="logo">
          <div class="logo-icon">R</div>
          RideMarket
        </div>
        <div class="nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#" onclick="navigate('/login'); return false;" class="btn btn-secondary btn-sm">Log In</a>
          <a href="#" onclick="navigate('/signup'); return false;" class="btn btn-primary btn-sm">Sign Up</a>
        </div>
      </div>
    </nav>

    <!-- Hero Section -->
    <section class="hero">
      <div class="container">
        <div class="hero-content">
          <h1>Your Ride.<br><span>Your Price.</span></h1>
          <p>The first open-market rideshare platform. Drivers set their own prices, riders choose who they ride with. Real competition means real savings.</p>
          <div class="hero-buttons">
            <button class="btn btn-primary btn-lg" onclick="navigate('/signup')">Get Started Free</button>
            <button class="btn btn-secondary btn-lg" onclick="navigate('/signup')">Drive &amp; Earn</button>
          </div>
        </div>
        <div class="hero-visual">
          <div class="hero-card">
            <div class="hero-card-header">
              <div>
                <div style="font-size:14px; color:var(--gray-400)">Trip Estimate</div>
                <div style="font-weight:700; font-size:18px">Downtown &#8594; Airport</div>
                <div style="font-size:13px; color:var(--gray-500)">12.4 miles &middot; ~25 min</div>
              </div>
            </div>
            <div class="price-comparison">
              <div class="price-row best">
                <div class="driver-info">
                  <div class="mini-avatar">M</div>
                  <div>
                    <div style="font-weight:600; font-size:14px">Marcus T. <span class="best-price-badge">Best Price</span></div>
                    <div style="font-size:12px; color:var(--gray-500)">Toyota Camry &middot; 4.9&#9733;</div>
                  </div>
                </div>
                <div class="price">$18.50</div>
              </div>
              <div class="price-row">
                <div class="driver-info">
                  <div class="mini-avatar" style="background:var(--primary-light)">S</div>
                  <div>
                    <div style="font-weight:600; font-size:14px">Sarah L.</div>
                    <div style="font-size:12px; color:var(--gray-500)">Honda Accord &middot; 4.8&#9733;</div>
                  </div>
                </div>
                <div class="price">$21.00</div>
              </div>
              <div class="price-row">
                <div class="driver-info">
                  <div class="mini-avatar" style="background:var(--accent)">J</div>
                  <div>
                    <div style="font-weight:600; font-size:14px">James K.</div>
                    <div style="font-size:12px; color:var(--gray-500)">BMW 3 Series &middot; 5.0&#9733;</div>
                  </div>
                </div>
                <div class="price">$28.00</div>
              </div>
            </div>
            <div style="text-align:center; margin-top:16px">
              <div style="font-size:12px; color:var(--gray-400)">vs Traditional Rideshare</div>
              <div style="font-size:20px; font-weight:800; color:var(--danger); text-decoration:line-through">$34.99</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="features" id="features">
      <div class="container">
        <div class="section-header">
          <h2>Why RideMarket?</h2>
          <p>We're flipping the rideshare model on its head. True market economics for everyone.</p>
        </div>
        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon">&#x1F4B0;</div>
            <h3>Drivers Set Prices</h3>
            <p>No algorithm decides your rate. Drivers choose their own base fare, per-mile rate, and surge multiplier. Your car, your business.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">&#x1F50D;</div>
            <h3>Compare &amp; Choose</h3>
            <p>See every nearby driver's price before you book. Sort by price, rating, distance, or vehicle type. The power is in your hands.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">&#x1F91D;</div>
            <h3>Open Market Bidding</h3>
            <p>Post your ride and let drivers compete for your business. Accept the offer that works best for you &mdash; price, ETA, or vibes.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">&#x2B50;</div>
            <h3>Transparent Ratings</h3>
            <p>Both riders and drivers are rated. Build your reputation and earn trust in the community. Quality rises to the top.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">&#x26A1;</div>
            <h3>Real-Time Tracking</h3>
            <p>Watch your driver approach in real-time on a live map. Know exactly when they'll arrive and track your entire trip.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">&#x1F6E1;</div>
            <h3>Fair for Everyone</h3>
            <p>No hidden fees, no surge-pricing algorithms. What drivers charge is what riders pay. Competition keeps prices honest.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- How It Works -->
    <section class="how-it-works" id="how-it-works">
      <div class="container">
        <div class="section-header">
          <h2>How It Works</h2>
          <p>Getting a ride (or giving one) in four simple steps.</p>
        </div>
        <div class="steps">
          <div class="step">
            <div class="step-number">1</div>
            <h3>Set Your Route</h3>
            <p>Enter your pickup and drop-off locations. We'll find every available driver nearby.</p>
          </div>
          <div class="step">
            <div class="step-number">2</div>
            <h3>Browse Prices</h3>
            <p>See each driver's price upfront. Compare ratings, vehicles, and ETAs side by side.</p>
          </div>
          <div class="step">
            <div class="step-number">3</div>
            <h3>Book or Bid</h3>
            <p>Pick a driver directly or post your ride and let drivers compete with offers.</p>
          </div>
          <div class="step">
            <div class="step-number">4</div>
            <h3>Ride &amp; Rate</h3>
            <p>Track your driver live, enjoy the ride, and leave an honest rating when you arrive.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="cta">
      <div class="container">
        <h2>Ready to ride <span style="background:linear-gradient(135deg, var(--primary), var(--secondary)); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">differently</span>?</h2>
        <p>Join thousands of riders and drivers who are done with opaque pricing. Sign up in 30 seconds.</p>
        <div class="cta-buttons">
          <button class="btn btn-primary btn-lg" onclick="navigate('/signup')">Sign Up as Rider</button>
          <button class="btn btn-accent btn-lg" onclick="navigate('/signup')">Sign Up as Driver</button>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="landing-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <div class="logo">
              <div class="logo-icon">R</div>
              RideMarket
            </div>
            <p>The open-market rideshare platform where competition drives fair prices for everyone.</p>
          </div>
          <div class="footer-col">
            <h4>Riders</h4>
            <a href="#" onclick="navigate('/signup'); return false;">Sign Up</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#features">Features</a>
          </div>
          <div class="footer-col">
            <h4>Drivers</h4>
            <a href="#" onclick="navigate('/signup'); return false;">Start Driving</a>
            <a href="#features">Set Your Prices</a>
            <a href="#how-it-works">How Bidding Works</a>
          </div>
          <div class="footer-col">
            <h4>Company</h4>
            <a href="#">About</a>
            <a href="#">Safety</a>
            <a href="#">Support</a>
          </div>
        </div>
        <div class="footer-bottom">
          &copy; 2026 RideMarket. All rights reserved. Fair prices, fair rides.
        </div>
      </div>
    </footer>
  `;
}

// ===== Auth Pages =====
function renderAuth(isSignup = false) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this){navigate('/');}" >
      <div class="modal" style="position:relative;">
        <button class="modal-close" onclick="navigate('/')">&times;</button>
        <div class="text-center">
          <div class="logo" style="justify-content:center; margin-bottom:16px;">
            <div class="logo-icon">R</div>
            RideMarket
          </div>
          <h2>${isSignup ? 'Create Account' : 'Welcome Back'}</h2>
          <p class="subtitle">${isSignup ? 'Join the open-market revolution' : 'Log in to your account'}</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab ${!isSignup ? 'active' : ''}" onclick="navigate('/login')">Log In</button>
          <button class="auth-tab ${isSignup ? 'active' : ''}" onclick="navigate('/signup')">Sign Up</button>
        </div>

        <form id="authForm" onsubmit="handleAuth(event, ${isSignup})">
          ${isSignup ? `
            <div class="role-selector">
              <div class="role-option selected" data-role="rider" onclick="selectRole('rider')">
                <div class="role-icon">&#x1F3C3;</div>
                <div class="role-label">Rider</div>
                <div style="font-size:12px; color:var(--gray-400)">Find affordable rides</div>
              </div>
              <div class="role-option" data-role="driver" onclick="selectRole('driver')">
                <div class="role-icon">&#x1F697;</div>
                <div class="role-label">Driver</div>
                <div style="font-size:12px; color:var(--gray-400)">Set your own prices</div>
              </div>
            </div>
            <input type="hidden" id="authRole" value="rider">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" class="form-input" id="authName" placeholder="John Doe" required>
            </div>
          ` : ''}
          <div class="form-group">
            <label>Email</label>
            <input type="email" class="form-input" id="authEmail" placeholder="you@example.com" required>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" class="form-input" id="authPassword" placeholder="Min. 6 characters" required minlength="6">
          </div>
          ${isSignup ? `
            <div class="form-group">
              <label>Phone (optional)</label>
              <input type="tel" class="form-input" id="authPhone" placeholder="(555) 123-4567">
            </div>
            <div id="vehicleFields" class="hidden">
              <div class="form-divider">Vehicle Information</div>
              <div class="form-row">
                <div class="form-group">
                  <label>Make</label>
                  <input type="text" class="form-input" id="vehicleMake" placeholder="Toyota">
                </div>
                <div class="form-group">
                  <label>Model</label>
                  <input type="text" class="form-input" id="vehicleModel" placeholder="Camry">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Year</label>
                  <input type="number" class="form-input" id="vehicleYear" placeholder="2022">
                </div>
                <div class="form-group">
                  <label>Color</label>
                  <input type="text" class="form-input" id="vehicleColor" placeholder="Silver">
                </div>
              </div>
              <div class="form-group">
                <label>License Plate</label>
                <input type="text" class="form-input" id="vehiclePlate" placeholder="ABC 1234">
              </div>
            </div>
          ` : ''}
          <div id="authError" class="form-error hidden"></div>
          <button type="submit" class="btn btn-primary btn-block btn-lg mt-2" id="authSubmit">
            ${isSignup ? 'Create Account' : 'Log In'}
          </button>
        </form>

        <div class="auth-switch">
          ${isSignup
            ? 'Already have an account? <a onclick="navigate(\'/login\')">Log In</a>'
            : 'Don\'t have an account? <a onclick="navigate(\'/signup\')">Sign Up</a>'
          }
        </div>
      </div>
    </div>
  `;
}

function selectRole(role) {
  document.querySelectorAll('.role-option').forEach(el => el.classList.remove('selected'));
  document.querySelector(`[data-role="${role}"]`).classList.add('selected');
  document.getElementById('authRole').value = role;
  const vehicleFields = document.getElementById('vehicleFields');
  if (vehicleFields) {
    vehicleFields.classList.toggle('hidden', role !== 'driver');
  }
}

async function handleAuth(e, isSignup) {
  e.preventDefault();
  const errorEl = document.getElementById('authError');
  const submitBtn = document.getElementById('authSubmit');
  errorEl.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = isSignup ? 'Creating Account...' : 'Logging In...';

  try {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;

    let data;
    if (isSignup) {
      const name = document.getElementById('authName').value;
      const phone = document.getElementById('authPhone')?.value;
      const role = document.getElementById('authRole').value;
      const body = { email, password, name, phone, role };

      if (role === 'driver') {
        body.vehicle = {
          make: document.getElementById('vehicleMake')?.value,
          model: document.getElementById('vehicleModel')?.value,
          year: parseInt(document.getElementById('vehicleYear')?.value) || null,
          color: document.getElementById('vehicleColor')?.value,
          plate: document.getElementById('vehiclePlate')?.value
        };
      }
      data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
    } else {
      data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    }

    token = data.token;
    currentUser = data.user;
    localStorage.setItem('rm_token', token);
    connectSocket();
    showToast(`Welcome${isSignup ? '' : ' back'}, ${currentUser.name}!`, 'success');
    navigate(currentUser.role === 'rider' ? '/rider' : '/driver');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = isSignup ? 'Create Account' : 'Log In';
  }
}

function logout() {
  token = null;
  currentUser = null;
  activeRide = null;
  localStorage.removeItem('rm_token');
  if (socket) socket.disconnect();
  navigate('/');
}

// ===== Rider Dashboard =====
function renderRiderDashboard() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-layout">
      <header class="app-header">
        <div class="logo" style="cursor:pointer" onclick="navigate('/rider')">
          <div class="logo-icon">R</div>
          RideMarket
        </div>
        <div class="app-header-right">
          <button class="btn btn-ghost btn-sm" onclick="showRideHistory()">&#x1F4CB; History</button>
          <div class="user-badge">
            <div class="user-avatar">${currentUser.name.charAt(0).toUpperCase()}</div>
            <span class="user-name">${currentUser.name}</span>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="logout()">Logout</button>
        </div>
      </header>
      <div class="app-content">
        <div class="rider-sidebar" id="riderSidebar">
          <div class="sidebar-section">
            <h3>&#x1F4CD; Where to?</h3>
            <div class="location-input-group">
              <div class="location-dot pickup"></div>
              <input type="text" class="form-input" id="pickupInput" placeholder="Pickup location" onfocus="startLocationPick('pickup')">
            </div>
            <div class="location-connector"></div>
            <div class="location-input-group">
              <div class="location-dot dropoff"></div>
              <input type="text" class="form-input" id="dropoffInput" placeholder="Where are you going?" onfocus="startLocationPick('dropoff')">
            </div>
            <button class="btn btn-primary btn-block mt-2" id="searchDriversBtn" onclick="searchDrivers()" disabled>
              Search Drivers
            </button>
          </div>
          <div id="driverResults" class="sidebar-section hidden">
            <h3>&#x1F697; Available Drivers</h3>
            <div id="driverList" class="driver-list"></div>
          </div>
          <div id="rideStatusPanel" class="sidebar-section hidden"></div>
          <div id="offersPanel" class="sidebar-section hidden">
            <h3>&#x1F4E8; Driver Offers</h3>
            <div id="offersList" class="offers-list"></div>
          </div>
        </div>
        <div class="map-container">
          <div id="map"></div>
          <div class="map-overlay">
            <button class="map-btn" onclick="centerOnUser()" title="My Location">&#x1F4CD;</button>
          </div>
        </div>
      </div>
    </div>
  `;

  initMap();
  checkActiveRide();
}

// ===== Map =====
function initMap() {
  if (map) { map.remove(); map = null; }
  map = L.map('map').setView([40.7128, -74.0060], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Try to get user location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 14);
        if (currentUser.role === 'driver') {
          updateDriverLocation(latitude, longitude);
        }
      },
      () => {} // silently fail
    );
  }

  // Map click handler for location picking
  map.on('click', handleMapClick);
}

let pickingLocation = null;
let pickupCoords = null;
let dropoffCoords = null;

function startLocationPick(type) {
  pickingLocation = type;
  showToast(`Click on the map to set your ${type} location`, 'info');
}

function handleMapClick(e) {
  if (!pickingLocation) return;
  const { lat, lng } = e.latlng;

  if (pickingLocation === 'pickup') {
    pickupCoords = { lat, lng };
    if (pickupMarker) map.removeLayer(pickupMarker);
    pickupMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:20px;height:20px;background:#00D4AA;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    }).addTo(map);
    document.getElementById('pickupInput').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } else {
    dropoffCoords = { lat, lng };
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    dropoffMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:20px;height:20px;background:#FF4757;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    }).addTo(map);
    document.getElementById('dropoffInput').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }

  pickingLocation = null;

  // Draw route line if both points set
  if (pickupCoords && dropoffCoords) {
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(
      [[pickupCoords.lat, pickupCoords.lng], [dropoffCoords.lat, dropoffCoords.lng]],
      { color: '#6C3CE1', weight: 4, dashArray: '8, 8', opacity: 0.7 }
    ).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [60, 60] });
    document.getElementById('searchDriversBtn').disabled = false;
  }
}

function centerOnUser() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 15),
      () => showToast('Could not get your location', 'error')
    );
  }
}

// ===== Search Drivers =====
async function searchDrivers() {
  if (!pickupCoords || !dropoffCoords) {
    showToast('Please set both pickup and dropoff locations', 'error');
    return;
  }

  const btn = document.getElementById('searchDriversBtn');
  btn.disabled = true;
  btn.textContent = 'Searching...';

  try {
    const drivers = await api('/api/drivers/nearby', {
      method: 'POST',
      body: JSON.stringify({
        lat: pickupCoords.lat,
        lng: pickupCoords.lng,
        destLat: dropoffCoords.lat,
        destLng: dropoffCoords.lng
      })
    });

    const resultsEl = document.getElementById('driverResults');
    const listEl = document.getElementById('driverList');
    resultsEl.classList.remove('hidden');

    // Clear existing driver markers
    Object.keys(markers).forEach(id => {
      map.removeLayer(markers[id]);
      delete markers[id];
    });

    if (drivers.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#x1F697;</div>
          <p>No drivers available nearby right now.<br>Try posting your ride for driver offers!</p>
          <button class="btn btn-accent btn-sm mt-2" onclick="postOpenRide()">Post Ride for Bids</button>
        </div>
      `;
    } else {
      listEl.innerHTML = drivers.map((d, i) => `
        <div class="driver-card" id="driver-${d.id}" onclick="selectDriverCard('${d.id}')">
          <div class="driver-avatar">${d.name.charAt(0).toUpperCase()}</div>
          <div class="driver-card-info">
            <div class="driver-name">
              ${d.name}
              ${i === 0 ? '<span class="best-price-badge">Best Price</span>' : ''}
            </div>
            <div class="driver-vehicle">${d.vehicle_color || ''} ${d.vehicle_make || ''} ${d.vehicle_model || ''}</div>
            <div class="driver-meta">
              <span class="star-rating">&#9733; ${d.rating.toFixed(1)}</span>
              <span>&#x1F4CF; ${d.distance_from_pickup} mi away</span>
              <span>&#x23F1; ~${d.eta_minutes} min</span>
            </div>
          </div>
          <div class="driver-price">
            <div class="price-amount">$${d.estimated_fare.toFixed(2)}</div>
            <div class="price-label">${d.estimated_distance} mi</div>
          </div>
        </div>
      `).join('');

      // Add driver markers to map
      drivers.forEach(d => {
        if (d.lat && d.lng) {
          markers[d.id] = L.marker([d.lat, d.lng], {
            icon: L.divIcon({
              className: '',
              html: `<div style="width:36px;height:36px;background:linear-gradient(135deg,#6C3CE1,#5229B6);border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px">${d.name.charAt(0)}</div>`,
              iconSize: [36, 36],
              iconAnchor: [18, 18]
            })
          }).addTo(map).bindPopup(`<b>${d.name}</b><br>$${d.estimated_fare.toFixed(2)}<br>${d.vehicle_make || ''} ${d.vehicle_model || ''}`);
        }
      });

      // Store drivers data
      window._nearbyDrivers = drivers;
    }

    // Add "Post for Bids" button
    listEl.innerHTML += `
      <div style="text-align:center; padding:12px 0; border-top:1px solid var(--gray-100); margin-top:8px">
        <div style="font-size:13px; color:var(--gray-400); margin-bottom:8px">Or let drivers come to you</div>
        <button class="btn btn-accent btn-sm" onclick="postOpenRide()">&#x1F4E2; Post Ride for Bids</button>
      </div>
    `;
  } catch (err) {
    showToast(err.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Search Drivers';
}

function selectDriverCard(driverId) {
  selectedDriver = driverId;
  document.querySelectorAll('.driver-card').forEach(el => el.classList.remove('selected'));
  document.getElementById(`driver-${driverId}`)?.classList.add('selected');

  const driver = window._nearbyDrivers?.find(d => d.id === driverId);
  if (driver && driver.lat && driver.lng) {
    map.setView([driver.lat, driver.lng], 14);
  }

  // Show book button
  const existing = document.getElementById('bookBtn');
  if (existing) existing.remove();

  const sidebar = document.getElementById('driverResults');
  const bookBtn = document.createElement('div');
  bookBtn.id = 'bookBtn';
  bookBtn.style.cssText = 'padding:0 24px 24px';
  bookBtn.innerHTML = `<button class="btn btn-success btn-block btn-lg" onclick="bookRide('${driverId}')">
    Book This Driver - $${driver.estimated_fare.toFixed(2)}
  </button>`;
  sidebar.appendChild(bookBtn);
}

// ===== Book Ride =====
async function bookRide(driverId) {
  try {
    const ride = await api('/api/rides/request', {
      method: 'POST',
      body: JSON.stringify({
        pickupLat: pickupCoords.lat,
        pickupLng: pickupCoords.lng,
        pickupAddress: document.getElementById('pickupInput').value,
        dropoffLat: dropoffCoords.lat,
        dropoffLng: dropoffCoords.lng,
        dropoffAddress: document.getElementById('dropoffInput').value,
        driverId
      })
    });

    activeRide = ride;
    showToast('Ride requested! Waiting for driver...', 'success');
    showRideStatus(ride);

    // Start polling for updates
    startRidePolling();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== Post Open Ride =====
async function postOpenRide() {
  if (!pickupCoords || !dropoffCoords) {
    showToast('Please set both locations first', 'error');
    return;
  }

  try {
    const ride = await api('/api/rides/request', {
      method: 'POST',
      body: JSON.stringify({
        pickupLat: pickupCoords.lat,
        pickupLng: pickupCoords.lng,
        pickupAddress: document.getElementById('pickupInput').value,
        dropoffLat: dropoffCoords.lat,
        dropoffLng: dropoffCoords.lng,
        dropoffAddress: document.getElementById('dropoffInput').value
      })
    });

    activeRide = ride;
    showToast('Ride posted! Waiting for driver offers...', 'success');
    showRideStatus(ride);

    // Show offers panel
    document.getElementById('offersPanel').classList.remove('hidden');
    startRidePolling();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== Ride Status =====
function showRideStatus(ride) {
  const panel = document.getElementById('rideStatusPanel');
  panel.classList.remove('hidden');
  document.getElementById('driverResults')?.classList.add('hidden');

  const statusLabels = {
    'requested': 'Looking for Driver',
    'accepted': 'Driver Matched',
    'driver_arriving': 'Driver On The Way',
    'in_progress': 'In Transit',
    'completed': 'Ride Complete',
    'cancelled': 'Cancelled'
  };

  panel.innerHTML = `
    <div class="ride-status-header">
      <h3>&#x1F698; Current Ride</h3>
      <span class="status-badge ${ride.status}">${statusLabels[ride.status] || ride.status}</span>
    </div>

    ${ride.driver_name ? `
      <div class="ride-driver-info">
        <div class="driver-avatar">${ride.driver_name.charAt(0).toUpperCase()}</div>
        <div class="driver-details">
          <h4>${ride.driver_name}</h4>
          <p>${ride.vehicle_color || ''} ${ride.vehicle_make || ''} ${ride.vehicle_model || ''}</p>
          <p>${ride.vehicle_plate || ''} &middot; &#9733; ${(ride.driver_user_rating || 5).toFixed(1)}</p>
        </div>
      </div>
    ` : `
      <div class="loading-overlay" style="padding:20px">
        <div class="spinner"></div>
        <p>Waiting for a driver...</p>
      </div>
    `}

    ${ride.estimated_fare ? `
      <div class="ride-fare-display">
        <div class="fare-label">Estimated Fare</div>
        <div class="fare-amount">$${(ride.final_fare || ride.estimated_fare).toFixed(2)}</div>
        <div class="fare-label">${ride.estimated_distance || '?'} mi &middot; ~${ride.estimated_duration || '?'} min</div>
      </div>
    ` : ''}

    ${ride.status === 'requested' && !ride.driver_id ? `
      <p style="text-align:center; font-size:13px; color:var(--gray-400); margin-bottom:16px">
        Drivers can see your ride and send offers. Check the offers panel below!
      </p>
    ` : ''}

    ${['requested', 'accepted', 'driver_arriving'].includes(ride.status) ? `
      <button class="btn btn-danger btn-block" onclick="cancelRide('${ride.id}')">Cancel Ride</button>
    ` : ''}

    ${ride.status === 'completed' && !ride.driver_rating ? `
      <div style="margin-top:16px">
        <h4 class="text-center">Rate Your Driver</h4>
        <div class="rating-stars" id="ratingStars">
          ${[1,2,3,4,5].map(n => `<span class="rating-star" data-rating="${n}" onclick="setRating(${n})">&#9733;</span>`).join('')}
        </div>
        <button class="btn btn-primary btn-block" onclick="submitRating('${ride.id}')">Submit Rating</button>
      </div>
    ` : ''}
  `;
}

let currentRating = 0;
function setRating(n) {
  currentRating = n;
  document.querySelectorAll('.rating-star').forEach((star, i) => {
    star.classList.toggle('active', i < n);
  });
}

async function submitRating(rideId) {
  if (currentRating === 0) { showToast('Please select a rating', 'error'); return; }
  try {
    await api(`/api/rides/${rideId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating: currentRating })
    });
    showToast('Rating submitted!', 'success');
    activeRide = null;
    currentRating = 0;
    render();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function cancelRide(rideId) {
  try {
    await api(`/api/rides/${rideId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'cancelled' })
    });
    showToast('Ride cancelled', 'info');
    activeRide = null;
    render();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== Load Offers =====
async function loadOffers(rideId) {
  try {
    const offers = await api(`/api/rides/${rideId}/offers`);
    const panel = document.getElementById('offersPanel');
    const list = document.getElementById('offersList');

    if (!panel || !list) return;

    if (offers.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>No offers yet. Drivers will see your ride soon!</p></div>`;
      return;
    }

    panel.classList.remove('hidden');
    list.innerHTML = offers.map(o => `
      <div class="offer-card">
        <div class="driver-avatar">${o.driver_name.charAt(0).toUpperCase()}</div>
        <div class="offer-driver-info">
          <h4>${o.driver_name}</h4>
          <p>&#9733; ${(o.driver_rating || 5).toFixed(1)} &middot; ${o.vehicle_make || ''} ${o.vehicle_model || ''}</p>
          ${o.message ? `<p style="font-style:italic; color:var(--gray-600)">"${o.message}"</p>` : ''}
        </div>
        <div class="offer-price">
          <div class="amount">$${o.offered_fare.toFixed(2)}</div>
          <button class="btn btn-success btn-sm mt-1" onclick="acceptOffer('${o.id}')">Accept</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load offers:', err);
  }
}

async function acceptOffer(offerId) {
  try {
    const ride = await api(`/api/rides/offers/${offerId}/accept`, { method: 'POST' });
    activeRide = ride;
    showToast('Offer accepted!', 'success');
    document.getElementById('offersPanel')?.classList.add('hidden');
    checkActiveRide();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== Ride Polling =====
function startRidePolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(async () => {
    await checkActiveRide();
  }, 3000);
}

async function checkActiveRide() {
  try {
    const ride = await api('/api/rides/active');
    if (ride) {
      activeRide = ride;
      const panel = document.getElementById('rideStatusPanel');
      if (panel) showRideStatus(ride);

      if (ride.status === 'requested' && !ride.driver_id) {
        loadOffers(ride.id);
      }

      // Update driver marker on map
      if (ride.driver_lat && ride.driver_lng && map) {
        if (markers['activeDriver']) {
          markers['activeDriver'].setLatLng([ride.driver_lat, ride.driver_lng]);
        } else {
          markers['activeDriver'] = L.marker([ride.driver_lat, ride.driver_lng], {
            icon: L.divIcon({
              className: '',
              html: '<div style="width:40px;height:40px;background:linear-gradient(135deg,#6C3CE1,#5229B6);border:3px solid white;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:20px">&#x1F697;</div>',
              iconSize: [40, 40],
              iconAnchor: [20, 20]
            })
          }).addTo(map);
        }
      }
    } else {
      if (activeRide && activeRide.status !== 'completed') {
        activeRide = null;
        if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
      }
    }
  } catch (err) {
    // Silently fail
  }
}

// ===== Ride History =====
async function showRideHistory() {
  try {
    const rides = await api('/api/rides/history');
    const sidebar = document.getElementById('riderSidebar') || document.getElementById('driverSidebar');
    if (!sidebar) return;

    const historyHtml = `
      <div class="sidebar-section">
        <h3 style="display:flex; justify-content:space-between; align-items:center">
          &#x1F4CB; Ride History
          <button class="btn btn-ghost btn-sm" onclick="render()">Back</button>
        </h3>
        ${rides.length === 0 ? '<div class="empty-state"><p>No rides yet</p></div>' :
          rides.map(r => `
            <div class="history-item">
              <div class="history-icon ${r.status === 'completed' ? 'completed' : 'cancelled'}">
                ${r.status === 'completed' ? '&#x2714;' : '&#x2718;'}
              </div>
              <div class="history-details">
                <div class="history-route">${r.pickup_address || 'Pickup'} &rarr; ${r.dropoff_address || 'Dropoff'}</div>
                <div class="history-date">${new Date(r.requested_at).toLocaleDateString()} &middot; ${r.estimated_distance || '?'} mi</div>
                ${currentUser.role === 'rider' && r.driver_name ? `<div class="history-date">Driver: ${r.driver_name}</div>` : ''}
                ${currentUser.role === 'driver' && r.rider_name ? `<div class="history-date">Rider: ${r.rider_name}</div>` : ''}
              </div>
              <div class="history-fare">$${(r.final_fare || r.estimated_fare || 0).toFixed(2)}</div>
            </div>
          `).join('')
        }
      </div>
    `;

    sidebar.innerHTML = historyHtml;
  } catch (err) {
    showToast('Failed to load history', 'error');
  }
}

// ===== Driver Dashboard =====
function renderDriverDashboard() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-layout">
      <header class="app-header">
        <div class="logo" style="cursor:pointer" onclick="navigate('/driver')">
          <div class="logo-icon">R</div>
          RideMarket
        </div>
        <div class="app-header-right">
          <div class="status-toggle">
            <span id="statusLabel">${currentUser.is_online ? 'Online' : 'Offline'}</span>
            <div class="toggle-switch ${currentUser.is_online ? 'active' : ''}" id="onlineToggle" onclick="toggleOnline()"></div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="showRideHistory()">&#x1F4CB; History</button>
          <div class="user-badge">
            <div class="user-avatar">${currentUser.name.charAt(0).toUpperCase()}</div>
            <span class="user-name">${currentUser.name}</span>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="logout()">Logout</button>
        </div>
      </header>
      <div class="app-content">
        <div class="driver-sidebar" id="driverSidebar">
          <div class="sidebar-section">
            <h3>&#x1F4CA; Your Stats</h3>
            <div class="stats-grid" id="statsGrid">
              <div class="stat-card">
                <div class="stat-value" id="statEarningsToday">$0</div>
                <div class="stat-label">Today</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" id="statEarningsTotal">$0</div>
                <div class="stat-label">Total Earnings</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" id="statTrips">0</div>
                <div class="stat-label">Total Rides</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" id="statRating">5.0</div>
                <div class="stat-label">Rating</div>
              </div>
            </div>
          </div>

          <div class="sidebar-section">
            <h3>&#x1F4B0; Your Pricing</h3>
            <div class="pricing-controls">
              <div class="pricing-slider">
                <label>Base Fare <span class="price-value" id="baseFareValue">$${(currentUser.base_fare || 5).toFixed(2)}</span></label>
                <input type="range" min="1" max="25" step="0.5" value="${currentUser.base_fare || 5}" id="baseFareSlider" oninput="updatePricing()">
              </div>
              <div class="pricing-slider">
                <label>Per Mile <span class="price-value" id="perMileValue">$${(currentUser.per_mile_rate || 1.5).toFixed(2)}</span></label>
                <input type="range" min="0.25" max="5" step="0.25" value="${currentUser.per_mile_rate || 1.5}" id="perMileSlider" oninput="updatePricing()">
              </div>
              <div class="pricing-slider">
                <label>Per Minute <span class="price-value" id="perMinValue">$${(currentUser.per_minute_rate || 0.25).toFixed(2)}</span></label>
                <input type="range" min="0.05" max="1" step="0.05" value="${currentUser.per_minute_rate || 0.25}" id="perMinSlider" oninput="updatePricing()">
              </div>
              <div class="pricing-slider">
                <label>Surge Multiplier <span class="price-value" id="surgeValue">${(currentUser.surge_multiplier || 1).toFixed(1)}x</span></label>
                <input type="range" min="1" max="5" step="0.1" value="${currentUser.surge_multiplier || 1}" id="surgeSlider" oninput="updatePricing()">
              </div>
              <div style="background:var(--gray-50); border-radius:var(--radius); padding:12px; text-align:center">
                <div style="font-size:12px; color:var(--gray-400)">Example: 10 mile, 20 min ride</div>
                <div style="font-size:24px; font-weight:800; color:var(--primary)" id="exampleFare">
                  $${calculateExampleFare(currentUser.base_fare || 5, currentUser.per_mile_rate || 1.5, currentUser.per_minute_rate || 0.25, currentUser.surge_multiplier || 1)}
                </div>
              </div>
              <button class="btn btn-primary btn-block" onclick="savePricing()">Save Pricing</button>
            </div>
          </div>

          <div class="sidebar-section" id="driverActiveRide"></div>

          <div class="sidebar-section">
            <h3>&#x1F4E8; Available Rides</h3>
            <div id="availableRides">
              <div class="loading-overlay"><div class="spinner"></div><p>Loading...</p></div>
            </div>
          </div>
        </div>
        <div class="map-container">
          <div id="map"></div>
          <div class="map-overlay">
            <button class="map-btn" onclick="centerOnUser()" title="My Location">&#x1F4CD;</button>
          </div>
        </div>
      </div>
    </div>
  `;

  initMap();
  loadDriverStats();
  loadAvailableRides();
  checkActiveDriverRide();

  // Start location tracking and polling
  startDriverLocationTracking();
  pollingInterval = setInterval(() => {
    loadAvailableRides();
    checkActiveDriverRide();
  }, 5000);
}

function calculateExampleFare(base, perMile, perMin, surge) {
  return ((base + (perMile * 10) + (perMin * 20)) * surge).toFixed(2);
}

function updatePricing() {
  const base = parseFloat(document.getElementById('baseFareSlider').value);
  const perMile = parseFloat(document.getElementById('perMileSlider').value);
  const perMin = parseFloat(document.getElementById('perMinSlider').value);
  const surge = parseFloat(document.getElementById('surgeSlider').value);

  document.getElementById('baseFareValue').textContent = `$${base.toFixed(2)}`;
  document.getElementById('perMileValue').textContent = `$${perMile.toFixed(2)}`;
  document.getElementById('perMinValue').textContent = `$${perMin.toFixed(2)}`;
  document.getElementById('surgeValue').textContent = `${surge.toFixed(1)}x`;
  document.getElementById('exampleFare').textContent = `$${calculateExampleFare(base, perMile, perMin, surge)}`;
}

async function savePricing() {
  try {
    const data = {
      base_fare: parseFloat(document.getElementById('baseFareSlider').value),
      per_mile_rate: parseFloat(document.getElementById('perMileSlider').value),
      per_minute_rate: parseFloat(document.getElementById('perMinSlider').value),
      surge_multiplier: parseFloat(document.getElementById('surgeSlider').value)
    };

    currentUser = await api('/api/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data)
    });

    showToast('Pricing updated!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleOnline() {
  try {
    const result = await api('/api/drivers/toggle-online', { method: 'POST' });
    currentUser.is_online = result.is_online ? 1 : 0;
    const toggle = document.getElementById('onlineToggle');
    const label = document.getElementById('statusLabel');
    toggle.classList.toggle('active', result.is_online);
    label.textContent = result.is_online ? 'Online' : 'Offline';
    showToast(result.is_online ? 'You are now online!' : 'You are now offline', result.is_online ? 'success' : 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadDriverStats() {
  try {
    const stats = await api('/api/drivers/stats');
    const el = (id) => document.getElementById(id);
    if (el('statEarningsToday')) el('statEarningsToday').textContent = `$${stats.today_earnings.toFixed(2)}`;
    if (el('statEarningsTotal')) el('statEarningsTotal').textContent = `$${stats.total_earnings.toFixed(2)}`;
    if (el('statTrips')) el('statTrips').textContent = stats.total_rides;
    if (el('statRating')) el('statRating').textContent = stats.rating.toFixed(1);
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadAvailableRides() {
  try {
    const rides = await api('/api/rides/available');
    const container = document.getElementById('availableRides');
    if (!container) return;

    if (rides.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">&#x1F4ED;</div><p>No rides available right now</p></div>`;
      return;
    }

    container.innerHTML = rides.map(r => `
      <div class="ride-request-card">
        <div class="ride-request-header">
          <div>
            <strong>${r.rider_name || 'Rider'}</strong>
            <span class="star-rating">&#9733; ${(r.rider_user_rating || 5).toFixed(1)}</span>
          </div>
          <span style="font-size:13px; color:var(--gray-500)">${r.estimated_distance || '?'} mi</span>
        </div>
        <div class="ride-request-locations">
          <div><span class="location-label" style="color:var(--secondary)">&#x25CF; From:</span> ${r.pickup_address || `${r.pickup_lat.toFixed(3)}, ${r.pickup_lng.toFixed(3)}`}</div>
          <div><span class="location-label" style="color:var(--danger)">&#x25CF; To:</span> ${r.dropoff_address || `${r.dropoff_lat.toFixed(3)}, ${r.dropoff_lng.toFixed(3)}`}</div>
        </div>
        ${r.estimated_fare ? `<div style="font-weight:700; font-size:18px; margin-top:8px">$${r.estimated_fare.toFixed(2)}</div>` : ''}
        <div class="ride-request-actions">
          ${r.driver_id ? `
            <button class="btn btn-success btn-sm btn-block" onclick="acceptRide('${r.id}')">Accept Ride</button>
          ` : `
            <button class="btn btn-primary btn-sm" onclick="showOfferForm('${r.id}', ${r.estimated_distance || 0})">Make Offer</button>
            <button class="btn btn-success btn-sm" onclick="acceptRide('${r.id}')">Quick Accept</button>
          `}
        </div>
        <div id="offerForm-${r.id}" class="hidden" style="margin-top:12px">
          <div class="form-group">
            <label>Your Fare Offer ($)</label>
            <input type="number" class="form-input" id="offerFare-${r.id}" step="0.5" min="1"
              value="${calculateDriverFare(r.estimated_distance || 5)}">
          </div>
          <div class="form-group">
            <label>Message (optional)</label>
            <input type="text" class="form-input" id="offerMsg-${r.id}" placeholder="e.g., I'm 2 minutes away!">
          </div>
          <button class="btn btn-accent btn-block btn-sm" onclick="submitOffer('${r.id}')">Send Offer</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load rides:', err);
  }
}

function calculateDriverFare(distance) {
  const base = currentUser.base_fare || 5;
  const perMile = currentUser.per_mile_rate || 1.5;
  const perMin = currentUser.per_minute_rate || 0.25;
  const surge = currentUser.surge_multiplier || 1;
  const estMinutes = distance * 2;
  return Math.max(currentUser.min_fare || 3, ((base + (perMile * distance) + (perMin * estMinutes)) * surge)).toFixed(2);
}

function showOfferForm(rideId) {
  const form = document.getElementById(`offerForm-${rideId}`);
  if (form) form.classList.toggle('hidden');
}

async function submitOffer(rideId) {
  try {
    const fare = parseFloat(document.getElementById(`offerFare-${rideId}`).value);
    const message = document.getElementById(`offerMsg-${rideId}`).value;

    await api(`/api/rides/${rideId}/offer`, {
      method: 'POST',
      body: JSON.stringify({ offeredFare: fare, message })
    });

    showToast('Offer sent!', 'success');
    document.getElementById(`offerForm-${rideId}`).classList.add('hidden');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function acceptRide(rideId) {
  try {
    const ride = await api(`/api/rides/${rideId}/accept`, { method: 'POST' });
    activeRide = ride;
    showToast('Ride accepted!', 'success');
    checkActiveDriverRide();
    loadAvailableRides();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function checkActiveDriverRide() {
  try {
    const ride = await api('/api/rides/active');
    const container = document.getElementById('driverActiveRide');
    if (!container) return;

    if (!ride) {
      container.innerHTML = '';
      activeRide = null;
      return;
    }

    activeRide = ride;
    const statusLabels = {
      'requested': 'Pending',
      'accepted': 'Accepted',
      'driver_arriving': 'On the Way',
      'in_progress': 'In Progress'
    };

    const nextAction = {
      'accepted': { label: 'I\'m On My Way', status: 'driver_arriving' },
      'driver_arriving': { label: 'Start Ride (Picked Up)', status: 'in_progress' },
      'in_progress': { label: 'Complete Ride', status: 'completed' }
    };

    container.innerHTML = `
      <h3 style="display:flex; justify-content:space-between; align-items:center">
        &#x1F698; Active Ride
        <span class="status-badge ${ride.status}">${statusLabels[ride.status]}</span>
      </h3>
      <div class="ride-driver-info" style="margin-top:12px">
        <div class="driver-avatar" style="background:linear-gradient(135deg, var(--accent), #FF8A5C)">${(ride.rider_name || 'R').charAt(0).toUpperCase()}</div>
        <div class="driver-details">
          <h4>${ride.rider_name || 'Rider'}</h4>
          <p>&#9733; ${(ride.rider_user_rating || 5).toFixed(1)}</p>
        </div>
      </div>
      <div class="ride-request-locations" style="margin:12px 0">
        <div><span style="color:var(--secondary)">&#x25CF;</span> ${ride.pickup_address || `${ride.pickup_lat.toFixed(3)}, ${ride.pickup_lng.toFixed(3)}`}</div>
        <div><span style="color:var(--danger)">&#x25CF;</span> ${ride.dropoff_address || `${ride.dropoff_lat.toFixed(3)}, ${ride.dropoff_lng.toFixed(3)}`}</div>
      </div>
      <div class="ride-fare-display">
        <div class="fare-label">Fare</div>
        <div class="fare-amount">$${(ride.estimated_fare || 0).toFixed(2)}</div>
        <div class="fare-label">${ride.estimated_distance || '?'} mi</div>
      </div>
      ${nextAction[ride.status] ? `
        <button class="btn btn-success btn-block" onclick="updateRideStatus('${ride.id}', '${nextAction[ride.status].status}')">
          ${nextAction[ride.status].label}
        </button>
      ` : ''}
      ${['accepted', 'driver_arriving'].includes(ride.status) ? `
        <button class="btn btn-danger btn-block mt-1" onclick="cancelRide('${ride.id}')">Cancel</button>
      ` : ''}

      ${ride.status === 'completed' && !ride.rider_rating ? `
        <div style="margin-top:16px">
          <h4 class="text-center">Rate the Rider</h4>
          <div class="rating-stars" id="ratingStars">
            ${[1,2,3,4,5].map(n => `<span class="rating-star" data-rating="${n}" onclick="setRating(${n})">&#9733;</span>`).join('')}
          </div>
          <button class="btn btn-primary btn-block" onclick="submitRating('${ride.id}')">Submit Rating</button>
        </div>
      ` : ''}
    `;

    // Show ride on map
    if (map) {
      if (pickupMarker) map.removeLayer(pickupMarker);
      if (dropoffMarker) map.removeLayer(dropoffMarker);
      pickupMarker = L.marker([ride.pickup_lat, ride.pickup_lng], {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:20px;height:20px;background:#00D4AA;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
          iconSize: [20, 20], iconAnchor: [10, 10]
        })
      }).addTo(map).bindPopup('Pickup');
      dropoffMarker = L.marker([ride.dropoff_lat, ride.dropoff_lng], {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:20px;height:20px;background:#FF4757;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
          iconSize: [20, 20], iconAnchor: [10, 10]
        })
      }).addTo(map).bindPopup('Dropoff');

      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.polyline(
        [[ride.pickup_lat, ride.pickup_lng], [ride.dropoff_lat, ride.dropoff_lng]],
        { color: '#6C3CE1', weight: 4, dashArray: '8, 8' }
      ).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [60, 60] });
    }
  } catch (err) {
    console.error('Failed to check active ride:', err);
  }
}

async function updateRideStatus(rideId, status) {
  try {
    await api(`/api/rides/${rideId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status })
    });
    const labels = {
      'driver_arriving': 'On your way to pickup!',
      'in_progress': 'Ride started!',
      'completed': 'Ride completed! Great job!'
    };
    showToast(labels[status] || 'Status updated', 'success');

    if (status === 'completed') {
      loadDriverStats();
    }

    checkActiveDriverRide();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== Driver Location Tracking =====
function startDriverLocationTracking() {
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        updateDriverLocation(latitude, longitude);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    );
  }
}

async function updateDriverLocation(lat, lng) {
  try {
    await api('/api/drivers/location', {
      method: 'POST',
      body: JSON.stringify({ lat, lng })
    });
    if (socket) {
      socket.emit('driver-location-update', { lat, lng });
    }
  } catch (err) {
    // Silently fail
  }
}

// ===== Start the app =====
init();
