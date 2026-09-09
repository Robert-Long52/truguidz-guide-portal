// TruGuidz Guide Portal
// Talks directly to the same Supabase project (and the same Edge
// Functions) the iOS app uses -- a guide who signs up here shows up
// identically in the iOS app, and vice versa. See
// truguidz-android-reference.md in the main repo for the full schema/RLS
// writeup this was built against.

const SUPABASE_URL = "https://mxihqtkrnmkfodzrpfam.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14aWhxdGtybm1rZm9kenJwZmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3OTQwMjcsImV4cCI6MjEwMTM3MDAyN30.5c9jxO77CS3jbmznojOy7nVHLPuVuYXU28fkzhv_FTU";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const WAIVER_VERSION = "v2-draft"; // must match LiabilityWaiverView.currentWaiverVersion in the iOS app

const CATEGORY_OPTIONS = [
  { value: "hunting", label: "Hunting" },
  { value: "fishing", label: "Fishing" },
  { value: "hiking", label: "Hiking" },
  { value: "Trail Riding", label: "Trail Riding" },
];
const PRICING_OPTIONS = [
  { value: "per_person", label: "Per Person" },
  { value: "per_hour", label: "Per Hour" },
  { value: "per_day", label: "Per Day" },
  { value: "flat_rate", label: "Flat Rate" },
];
const TRIP_LENGTH_OPTIONS = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "full_day", label: "Full Day" },
  { value: "multi_day", label: "Multi-Day Package" },
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------------- Icons ----------------
// Small hand-authored line-icon set, stroke-based (currentColor), so one
// glyph works for nav buttons, stat tiles, and empty states alike without
// pulling in an icon font/library.
const ICONS = {
  dashboard: `<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>`,
  listings: `<path d="M12 21s7-7.2 7-12.5A7 7 0 0 0 5 8.5C5 13.8 12 21 12 21Z"/><circle cx="12" cy="8.5" r="2.5"/>`,
  bookings: `<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M16 3v4M8 3v4M3.5 10h17"/>`,
  messages: `<path d="M4 5.5h16v11.5H9l-4.5 4V5.5Z"/>`,
  payouts: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.2 9.8c0-1.2 1.2-2.1 2.8-2.1s2.8.8 2.8 2c0 2.6-5.6 1.4-5.6 4 0 1.2 1.2 2.1 2.8 2.1s2.8-.9 2.8-2.1"/>`,
  signout: `<path d="M9.5 4.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h4M16 16.5l4.5-4.5-4.5-4.5M20 12H9.5"/>`,
  check: `<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.6 2.6L16.2 9"/>`,
  clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.3 1.9"/>`,
  alert: `<circle cx="12" cy="12" r="8.5"/><path d="M12 8v5"/><circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="none"/>`,
  info: `<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/>`,
  camera: `<path d="M4 8.5h3l1.4-2h7.2l1.4 2h3v11H4v-11Z"/><circle cx="12" cy="14" r="3.3"/>`,
  compass: `<circle cx="12" cy="12" r="8.5"/><path d="m14.5 9.5-1.6 4.5-4.5 1.6 1.6-4.5 4.5-1.6Z"/>`,
  card: `<rect x="3.5" y="6" width="17" height="12.5" rx="2"/><path d="M3.5 10h17"/>`,
};

function icon(name, cls = "") {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24">${ICONS[name] || ""}</svg>`;
}

const NAV_ITEMS = [
  { view: "dashboard", label: "Dashboard", icon: "dashboard" },
  { view: "listings", label: "Listings", icon: "listings" },
  { view: "bookings", label: "Bookings", icon: "bookings" },
  { view: "messages", label: "Messages", icon: "messages" },
  { view: "payouts", label: "Payouts", icon: "payouts" },
];

function populateNav() {
  [navEl, mobileTabsEl].forEach((container) => {
    NAV_ITEMS.forEach((item) => {
      const btn = container.querySelector(`[data-view="${item.view}"]`);
      if (btn) btn.innerHTML = `${icon(item.icon)}<span class="nav-label">${item.label}</span>`;
    });
  });
  document.getElementById("signOutBtn").innerHTML = `${icon("signout")}<span class="nav-label">Sign Out</span>`;
}

function emptyState({ iconName, title, body, actionLabel, onAction }) {
  const el = h(`
    <div class="card empty-state">
      <div class="empty-state-icon">${icon(iconName)}</div>
      <div class="empty-state-title">${escapeHtml(title)}</div>
      <div class="empty-state-body">${escapeHtml(body)}</div>
    </div>
  `);
  if (actionLabel && onAction) {
    const btn = h(`<button class="btn btn-primary">${escapeHtml(actionLabel)}</button>`);
    btn.addEventListener("click", onAction);
    el.appendChild(btn);
  }
  return el;
}

// ---------------- Availability calendar ----------------
// Mirrors AvailabilityCalendarView.swift: a month grid where each day is
// Booked (confirmed wins), Pending, or Open, walking each booking's full
// date...end_date span (not just its start day) so a multi-day package
// shades every day it actually occupies.
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildStatusByDay(bookings) {
  const map = new Map();
  bookings.forEach((b) => {
    if (b.status !== "pending" && b.status !== "confirmed") return;
    let day = new Date(b.date);
    day.setHours(0, 0, 0, 0);
    const last = new Date(b.end_date);
    last.setHours(0, 0, 0, 0);
    while (day <= last) {
      const key = dateKey(day);
      if (map.get(key) !== "confirmed") map.set(key, b.status);
      day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    }
  });
  return map;
}

function renderAvailabilityCalendar(bookings) {
  const wrap = h(`
    <div class="card cal-card">
      <div class="cal-header">
        <button class="btn btn-ghost btn-small" id="calPrev">‹</button>
        <div class="cal-title" id="calTitle"></div>
        <button class="btn btn-ghost btn-small" id="calNext">›</button>
      </div>
      <div class="cal-weekdays">${DAY_LABELS.map((d) => `<span>${d[0]}</span>`).join("")}</div>
      <div class="cal-grid" id="calGrid"></div>
      <div class="cal-legend">
        <span class="cal-legend-item"><i class="cal-dot cal-dot-booked"></i>Booked</span>
        <span class="cal-legend-item"><i class="cal-dot cal-dot-pending"></i>Pending</span>
        <span class="cal-legend-item"><i class="cal-dot cal-dot-open"></i>Open</span>
      </div>
    </div>
  `);

  const statusByDay = buildStatusByDay(bookings);

  function paint() {
    wrap.querySelector("#calTitle").textContent = calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const grid = wrap.querySelector("#calGrid");
    grid.innerHTML = "";
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstWeekday; i++) {
      grid.appendChild(h(`<div class="cal-day cal-day-empty"></div>`));
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(new Date(year, month, d));
      const status = statusByDay.get(key);
      const cls = status === "confirmed" ? "cal-day-booked" : status === "pending" ? "cal-day-pending" : "";
      grid.appendChild(h(`<div class="cal-day ${cls}">${d}</div>`));
    }
  }

  wrap.querySelector("#calPrev").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    paint();
  });
  wrap.querySelector("#calNext").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    paint();
  });

  paint();
  return wrap;
}

// ---------------- App state ----------------
const state = {
  session: null,
  profile: null,
  view: "dashboard",
  listings: [],
  bookings: [],
  selectedBookingId: null,
  messages: [],
};

const appEl = document.getElementById("app");
const navEl = document.getElementById("nav");
const mobileTabsEl = document.getElementById("mobileTabs");

function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
function money(n) {
  return `$${Number(n).toFixed(2).replace(/\.00$/, "")}`;
}

// Falls back to the plain total for a booking made before the
// adults/children split existed (see add_adults_children_headcount.sql),
// same fallback rule as Booking.guestSummary in the iOS app.
function guestSummary(b) {
  const adults = b.number_of_adults;
  const children = b.number_of_children;
  if (adults == null || children == null) {
    return `${b.number_of_guests} guest${b.number_of_guests === 1 ? "" : "s"}`;
  }
  if (children === 0) return `${adults} adult${adults === 1 ? "" : "s"}`;
  return `${adults} adult${adults === 1 ? "" : "s"}, ${children} child${children === 1 ? "" : "ren"}`;
}

// ---------------- Auth ----------------
async function init() {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  sb.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    if (!session) {
      state.profile = null;
      render();
    }
  });
  if (state.session) {
    await loadProfile();
  }
  render();
}

async function loadProfile() {
  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", state.session.user.id)
    .single();
  if (!error) state.profile = data;
}

async function signOut() {
  await sb.auth.signOut();
  state.session = null;
  state.profile = null;
  render();
}

// ---------------- Render root ----------------
function render() {
  const isApproved = !!(state.session && state.profile && state.profile.verification_status === "approved");
  navEl.hidden = !isApproved;
  mobileTabsEl.hidden = !isApproved;
  [navEl, mobileTabsEl].forEach((container) => {
    container.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === state.view);
    });
  });

  appEl.innerHTML = "";
  if (!state.session) {
    appEl.appendChild(renderAuthView());
    return;
  }
  if (!state.profile) {
    appEl.appendChild(h(`<div class="loading">Loading your profile&hellip;</div>`));
    return;
  }
  if (state.profile.role !== "guide" || state.profile.verification_status === "notStarted" || state.profile.verification_status === "rejected") {
    appEl.appendChild(renderApplyView());
    return;
  }
  if (state.profile.verification_status === "pending") {
    appEl.appendChild(renderPendingView());
    return;
  }
  // approved
  if (state.view === "dashboard") renderDashboardView();
  else if (state.view === "listings") renderListingsView();
  else if (state.view === "bookings") renderBookingsView();
  else if (state.view === "messages") renderMessagesView();
  else if (state.view === "payouts") renderPayoutsView();
}

function handleNavClick(e) {
  const btn = e.target.closest(".nav-btn[data-view]");
  if (btn) {
    state.view = btn.dataset.view;
    render();
  }
}
navEl.addEventListener("click", handleNavClick);
mobileTabsEl.addEventListener("click", handleNavClick);
document.getElementById("signOutBtn").addEventListener("click", signOut);
populateNav();

// ---------------- Auth view ----------------
const HERO_FEATURES = [
  { icon: "compass", title: "Get discovered", body: "Explorers searching by trip type and location can find and book you directly." },
  { icon: "bookings", title: "Run your own calendar", body: "Set your available days, confirm or decline requests, no back-and-forth texting." },
  { icon: "card", title: "Get paid safely", body: "Payment is held when a trip's booked and released to you the moment you confirm it." },
];

function renderAuthView() {
  const wrap = h(`
    <div class="hero-shell">
      <div class="hero-panel">
        <p class="hero-eyebrow">TruGuidz for Guides</p>
        <h1 class="hero-title">Run your guiding business from one place.</h1>
        <p class="hero-body">List your trips, manage bookings, and get paid — right from your phone or computer. Same account whether you're on the TruGuidz app or here on the web.</p>
        <ul class="hero-features">
          ${HERO_FEATURES.map((f) => `
            <li class="hero-feature">
              <div class="hero-feature-icon">${icon(f.icon)}</div>
              <div class="hero-feature-text">
                <strong>${escapeHtml(f.title)}</strong>
                <span>${escapeHtml(f.body)}</span>
              </div>
            </li>
          `).join("")}
        </ul>
      </div>
      <div class="card" id="authCard">
        <h2 id="authHeading">Sign In</h2>
        <p class="sub" id="authSub">Welcome back — sign in to manage your listings.</p>
        <div id="authError"></div>
        <label>Email</label>
        <input type="email" id="authEmail" autocomplete="email" />
        <label>Password</label>
        <input type="password" id="authPassword" autocomplete="current-password" />
        <div id="authNameWrap" hidden>
          <label>Full Name</label>
          <input type="text" id="authName" autocomplete="name" />
        </div>
        <button class="btn btn-primary btn-block" id="authSubmitBtn" style="margin-top:20px;">Sign In</button>
        <button class="link-btn" id="authToggle" style="margin-top:16px; display:block; width:100%; text-align:center;">
          New here? Create an account
        </button>
      </div>
    </div>
  `);

  let mode = "signin";

  function showError(msg) {
    wrap.querySelector("#authError").innerHTML = msg ? `<div class="error-box">${icon("alert")}<span>${escapeHtml(msg)}</span></div>` : "";
  }

  function setMode(next) {
    mode = next;
    showError("");
    const isSignUp = mode === "signup";
    wrap.querySelector("#authHeading").textContent = isSignUp ? "Create Your Account" : "Sign In";
    wrap.querySelector("#authSub").textContent = isSignUp
      ? "One account works on the app and here on the web."
      : "Welcome back — sign in to manage your listings.";
    wrap.querySelector("#authNameWrap").hidden = !isSignUp;
    wrap.querySelector("#authSubmitBtn").textContent = isSignUp ? "Create Account" : "Sign In";
    wrap.querySelector("#authToggle").textContent = isSignUp
      ? "Already have an account? Sign in"
      : "New here? Create an account";
  }

  wrap.querySelector("#authToggle").addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));

  wrap.querySelector("#authSubmitBtn").addEventListener("click", async () => {
    showError("");
    const email = wrap.querySelector("#authEmail").value.trim();
    const password = wrap.querySelector("#authPassword").value;
    const btn = wrap.querySelector("#authSubmitBtn");
    btn.disabled = true;

    if (mode === "signin") {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { showError(error.message); btn.disabled = false; return; }
      state.session = data.session;
      await loadProfile();
      render();
      return;
    }

    const name = wrap.querySelector("#authName").value.trim();
    if (!name) { showError("Enter your full name to create an account."); btn.disabled = false; return; }
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { name } }, // read by the handle_new_user trigger, same as the iOS signup flow
    });
    if (error) { showError(error.message); btn.disabled = false; return; }
    if (!data.session) {
      showError("Check your email for a confirmation link, then come back and sign in.");
      btn.disabled = false;
      return;
    }
    state.session = data.session;
    await loadProfile();
    render();
  });

  return wrap;
}

// ---------------- Guide application ----------------
function renderApplyView() {
  const rejected = state.profile.verification_status === "rejected";
  const wrap = h(`
    <div class="card" style="max-width:540px;margin:20px auto;">
      <h1>Become a Guide</h1>
      <p class="sub">A couple minutes of setup, then we review it by hand — usually same day.</p>
      ${rejected ? `<div class="error-box">${icon("alert")}<span>Your previous application wasn't approved. You're welcome to re-apply with updated info.</span></div>` : ""}
      <div id="applyError"></div>

      <fieldset class="form-section">
        <legend>About You</legend>
        <label>Phone Number</label>
        <input type="tel" id="applyPhone" placeholder="(555) 555-5555" />

        <label>Years of Experience Guiding</label>
        <input type="number" id="applyYears" min="0" max="50" value="1" />

        <label>Bio</label>
        <textarea id="applyBio" placeholder="What you guide, where, and what makes a trip with you worth booking. Explorers will see this on your listings."></textarea>
      </fieldset>

      <fieldset class="form-section">
        <legend>Verification</legend>
        <label>Government-Issued Photo ID</label>
        <input type="file" id="applyIdPhoto" accept="image/*" />
        <div class="field-hint">Only used to verify your identity — never shown publicly, and stored in a private, access-controlled file.</div>

        <div class="checkbox-row">
          <input type="checkbox" id="applyWaiver" />
          <label for="applyWaiver">I've read and accept the TruGuidz Guide Agreement and consent to identity verification.</label>
        </div>
      </fieldset>

      <button class="btn btn-primary btn-block" id="applySubmit">Submit Application</button>
    </div>
  `);

  function showError(msg) {
    wrap.querySelector("#applyError").innerHTML = msg ? `<div class="error-box">${icon("alert")}<span>${escapeHtml(msg)}</span></div>` : "";
  }

  wrap.querySelector("#applySubmit").addEventListener("click", async () => {
    showError("");
    const phone = wrap.querySelector("#applyPhone").value.trim();
    const years = parseInt(wrap.querySelector("#applyYears").value, 10) || 0;
    const bio = wrap.querySelector("#applyBio").value.trim();
    const file = wrap.querySelector("#applyIdPhoto").files[0];
    const agreed = wrap.querySelector("#applyWaiver").checked;

    if (!phone || !bio || !file) return showError("Fill in your phone, bio, and upload a photo ID.");
    if (!agreed) return showError("You need to accept the agreement to continue.");

    const btn = wrap.querySelector("#applySubmit");
    btn.disabled = true;
    btn.textContent = "Submitting…";

    try {
      // 1. Record waiver acceptance (same columns LiabilityWaiverView writes).
      await sb.from("profiles").update({
        waiver_accepted_at: new Date().toISOString(),
        waiver_version: WAIVER_VERSION,
      }).eq("id", state.session.user.id);

      // 2. Upload ID photo to the private guide-documents bucket.
      const path = `${state.session.user.id}/id-document.jpg`;
      const { error: uploadError } = await sb.storage
        .from("guide-documents")
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      // 3. Check whether a verification fee is currently required (it's
      // waived platform-wide right now, but this mirrors the real flow).
      const { data: feeData, error: feeError } = await sb.functions.invoke("guide-verification-fee-intent");
      if (feeError) throw feeError;

      let paymentIntentId = null;
      if (feeData.feeRequired) {
        showError("A verification fee is required and isn't supported from the web portal yet — please use the iOS app to complete your application, or contact us.");
        btn.disabled = false;
        btn.textContent = "Submit Application";
        return;
      }

      // 4. Submit the application.
      const { error: submitError } = await sb.functions.invoke("guide-verification-submit", {
        body: {
          paymentIntentId,
          phoneNumber: phone,
          yearsExperience: years,
          bio,
          idDocumentPath: path,
        },
      });
      if (submitError) throw submitError;

      await loadProfile();
      render();
    } catch (err) {
      showError(err.message || "Something went wrong submitting your application.");
      btn.disabled = false;
      btn.textContent = "Submit Application";
    }
  });

  return wrap;
}

function renderPendingView() {
  return h(`
    <div class="card" style="max-width:480px;margin:60px auto;text-align:center;">
      <div class="empty-state-icon" style="margin:0 auto 18px;">${icon("clock")}</div>
      <h1>Application Submitted</h1>
      <p class="sub">We're reviewing your application now — usually same day. You'll be able to list trips here as soon as it's approved.</p>
      <button class="btn btn-ghost" id="pendingSignOut">Sign Out</button>
    </div>
  `);
}
// delegate since this view is re-rendered fresh each time
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "pendingSignOut") signOut();
});

// ---------------- Dashboard ----------------
// Mirrors GuidzDashboardView.swift's home tab: a quick read on what needs
// attention, then the same availability calendar, rather than dropping a
// newly-approved guide straight into an empty Listings tab with no
// orientation.
async function renderDashboardView() {
  appEl.innerHTML = `<div class="loading">Loading your dashboard&hellip;</div>`;
  await Promise.all([loadListings(), loadBookings()]);

  const activeListings = state.listings.filter((l) => l.is_active);
  const pendingBookings = state.bookings.filter((b) => b.status === "pending");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = state.bookings.filter((b) => {
    if (b.status !== "confirmed") return false;
    return new Date(b.end_date) >= today;
  });
  const stripeReady = !!state.profile.stripe_charges_enabled;

  const wrap = h(`
    <div>
      <div class="dash-greeting">
        <h1>Welcome back, ${escapeHtml(state.profile.name || "Guide")}</h1>
        <p class="sub">Here's what's happening with your trips.</p>
      </div>

      <div class="stat-grid">
        <div class="stat-tile">
          <div class="stat-tile-icon">${icon("listings")}</div>
          <div class="stat-tile-value">${activeListings.length}</div>
          <div class="stat-tile-label">Active Listings</div>
        </div>
        <div class="stat-tile ${pendingBookings.length ? "warn" : ""}">
          <div class="stat-tile-icon">${icon("clock")}</div>
          <div class="stat-tile-value">${pendingBookings.length}</div>
          <div class="stat-tile-label">Needs a Response</div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile-icon">${icon("bookings")}</div>
          <div class="stat-tile-value">${upcoming.length}</div>
          <div class="stat-tile-label">Upcoming Trips</div>
        </div>
        <div class="stat-tile ${stripeReady ? "ok" : "warn"}">
          <div class="stat-tile-icon">${icon("payouts")}</div>
          <div class="stat-tile-value">${stripeReady ? "Ready" : "Setup"}</div>
          <div class="stat-tile-label">Payouts</div>
        </div>
      </div>

      <div class="section-block">
        <div class="section-block-head">
          <h2>Availability</h2>
          <button class="link-btn" id="dashViewBookings">View all bookings</button>
        </div>
        <div id="dashCalendar"></div>
      </div>

      <div class="section-block" id="dashAttentionBlock" hidden>
        <div class="section-block-head"><h2>Needs Your Response</h2></div>
        <div class="card" id="dashAttentionBody"></div>
      </div>

      <div class="section-block">
        <div class="section-block-head">
          <h2>Your Listings</h2>
          <button class="link-btn" id="dashNewListing">+ New Listing</button>
        </div>
        <div id="dashListingsBody"></div>
      </div>
    </div>
  `);

  wrap.querySelector("#dashCalendar").appendChild(renderAvailabilityCalendar(state.bookings));
  wrap.querySelector("#dashViewBookings").addEventListener("click", () => { state.view = "bookings"; render(); });
  wrap.querySelector("#dashNewListing").addEventListener("click", () => renderListingFormView(null));

  if (pendingBookings.length > 0) {
    wrap.querySelector("#dashAttentionBlock").hidden = false;
    const attnBody = wrap.querySelector("#dashAttentionBody");
    pendingBookings.forEach((b, i) => {
      const listing = state.listings.find((l) => l.id === b.listing_id);
      const row = h(`
        <div class="booking-card" style="${i === 0 ? "padding-top:0;" : ""}">
          <div class="booking-top">
            <div>
              <span class="badge badge-pending">Pending</span>
              <strong>${escapeHtml(listing?.title || "Listing")}</strong>
              <div class="listing-meta">${new Date(b.date).toLocaleDateString()} · ${guestSummary(b)} · ${money(b.total_price)}</div>
            </div>
          </div>
          <div class="booking-actions">
            <button class="btn btn-success btn-small" data-confirm="${b.id}">Confirm</button>
            <button class="btn btn-danger btn-small" data-decline="${b.id}">Decline</button>
          </div>
        </div>
      `);
      attnBody.appendChild(row);
    });
    wireBookingActionButtons(attnBody, () => renderDashboardView());
  }

  const listingsBody = wrap.querySelector("#dashListingsBody");
  if (state.listings.length === 0) {
    listingsBody.appendChild(emptyState({
      iconName: "listings",
      title: "No listings yet",
      body: "Publish your first trip to start getting bookings.",
      actionLabel: "Create Your First Listing",
      onAction: () => renderListingFormView(null),
    }));
  } else {
    listingsBody.appendChild(renderListingGrid(state.listings.slice(0, 3)));
    if (state.listings.length > 3) {
      const more = h(`<button class="link-btn" style="margin-top:12px;">View all ${state.listings.length} listings</button>`);
      more.addEventListener("click", () => { state.view = "listings"; render(); });
      listingsBody.appendChild(more);
    }
  }

  appEl.innerHTML = "";
  appEl.appendChild(wrap);
}

function wireBookingActionButtons(container, onDone) {
  container.querySelectorAll("[data-confirm]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const { error } = await sb.functions.invoke("stripe-capture-payment", { body: { bookingId: btn.dataset.confirm } });
      if (error) { alert("Could not confirm booking: " + error.message); btn.disabled = false; return; }
      onDone();
    });
  });
  container.querySelectorAll("[data-decline]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Decline this booking request?")) return;
      btn.disabled = true;
      const { error } = await sb.functions.invoke("stripe-cancel-payment", { body: { bookingId: btn.dataset.decline } });
      if (error) { alert("Could not decline booking: " + error.message); btn.disabled = false; return; }
      onDone();
    });
  });
}

// ---------------- Listings ----------------
async function loadListings() {
  const { data, error } = await sb
    .from("listings")
    .select("*")
    .eq("guide_id", state.session.user.id)
    .order("created_at", { ascending: false });
  if (!error) state.listings = data;
}

function renderListingGrid(listings) {
  const grid = h(`<div class="listing-grid"></div>`);
  listings.forEach((listing) => {
    const cover = listing.image_urls?.[0];
    const card = h(`
      <div class="listing-card ${listing.is_active ? "" : "inactive"}">
        ${cover
          ? `<img class="listing-photo" src="${cover}" onerror="this.style.visibility='hidden'" />`
          : `<div class="listing-photo-placeholder">${icon("camera")}</div>`}
        <div class="listing-info">
          ${!listing.is_active ? `<span class="badge badge-inactive">Inactive</span>` : ""}
          <div class="listing-title">${escapeHtml(listing.title)}</div>
          <div class="listing-meta">${escapeHtml(listing.location_name)} · ${escapeHtml(listing.category)} · ${money(listing.price_per_person)}</div>
        </div>
        <div class="listing-actions">
          <button class="btn btn-ghost btn-small" data-edit="${listing.id}">Edit</button>
        </div>
      </div>
    `);
    card.querySelector("[data-edit]").addEventListener("click", () => renderListingFormView(listing));
    grid.appendChild(card);
  });
  return grid;
}

async function renderListingsView() {
  appEl.innerHTML = `<div class="loading">Loading your listings&hellip;</div>`;
  await loadListings();

  const wrap = h(`
    <div>
      <div class="view-header">
        <h1 style="margin:0;">Your Listings</h1>
        <button class="btn btn-primary" id="newListingBtn">+ New Listing</button>
      </div>
      <div id="listingsBody"></div>
    </div>
  `);
  const body = wrap.querySelector("#listingsBody");

  if (state.listings.length === 0) {
    body.appendChild(emptyState({
      iconName: "listings",
      title: "No listings yet",
      body: "Create your first trip to start getting bookings from explorers.",
    }));
  } else {
    body.appendChild(renderListingGrid(state.listings));
  }

  wrap.querySelector("#newListingBtn").addEventListener("click", () => renderListingFormView(null));

  appEl.innerHTML = "";
  appEl.appendChild(wrap);
}

function photoSlotHtml(index, existingUrl) {
  return `
    <label class="photo-slot" data-slot="${index}">
      ${existingUrl ? `<img src="${existingUrl}" />` : `<span>Photo ${index + 1}${index === 0 ? " (cover)" : ""}</span>`}
      ${existingUrl && index === 0 ? `<span class="cover-label">Cover</span>` : ""}
      <input type="file" accept="image/*" data-slot-input="${index}" />
    </label>
  `;
}

function renderListingFormView(listing) {
  const isEdit = !!listing;
  const selectedDays = new Set(isEdit ? listing.available_days : [0, 1, 2, 3, 4, 5, 6]);
  const pendingPhotoFiles = [null, null, null];
  const existingUrls = isEdit ? (listing.image_urls || []) : [];
  // Sorted set of "yyyy-mm-dd" strings -- same shape as the iOS app's
  // Listing.blockedDates (see ListingDateFormat in the Swift model).
  const blockedDates = new Set(isEdit ? (listing.blocked_dates || []) : []);

  const wrap = h(`
    <div class="card" style="max-width:560px;margin:0 auto;">
      <h1>${isEdit ? "Edit Listing" : "New Listing"}</h1>
      <p class="sub">${isEdit ? "Update the details explorers see for this trip." : "A few details and you're bookable."}</p>
      <div id="formError"></div>

      <fieldset class="form-section">
        <legend>Trip Basics</legend>
        <label>Title</label>
        <input type="text" id="fTitle" value="${isEdit ? escapeHtml(listing.title) : ""}" placeholder="e.g. Susquehanna Bass Excursion" />

        <label>Category</label>
        <select id="fCategory">
          ${CATEGORY_OPTIONS.map(o => `<option value="${o.value}" ${isEdit && listing.category === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
        </select>

        <label>Trip Length</label>
        <select id="fTripLength">
          ${TRIP_LENGTH_OPTIONS.map(o => `<option value="${o.value}" ${isEdit && listing.trip_length === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
        </select>
        <div id="fPackageDaysWrap" style="display:${isEdit && listing.trip_length === "multi_day" ? "block" : "none"};">
          <label>Package Length (days)</label>
          <input type="number" id="fPackageDays" min="2" max="30" value="${isEdit && listing.package_days ? listing.package_days : 3}" />
        </div>

        <label>Location</label>
        <input type="text" id="fLocation" value="${isEdit ? escapeHtml(listing.location_name) : ""}" placeholder="e.g. Ocean City, MD" />
      </fieldset>

      <fieldset class="form-section">
        <legend>Description</legend>
        <label>What should explorers know before booking?</label>
        <textarea id="fDescription" placeholder="What you're running, what's included, what to bring.">${isEdit ? escapeHtml(listing.description) : ""}</textarea>
      </fieldset>

      <fieldset class="form-section">
        <legend>Pricing &amp; Group Size</legend>
        <label>Pricing</label>
        <select id="fPricingUnit">
          ${PRICING_OPTIONS.map(o => `<option value="${o.value}" ${isEdit && listing.pricing_unit === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
        </select>
        <input type="number" id="fPrice" min="0" step="0.01" value="${isEdit ? listing.price_per_person : ""}" placeholder="Price ($)" style="margin-top:8px;" />

        <label>Max Group Size</label>
        <input type="number" id="fMaxGroup" min="1" value="${isEdit ? listing.max_group_size : 4}" />
      </fieldset>

      <fieldset class="form-section">
        <legend>Availability</legend>
        <label>Which days do you run this trip?</label>
        <div class="days-picker" id="fDays">
          ${DAY_LABELS.map((d, i) => `<div class="day-chip ${selectedDays.has(i) ? "selected" : ""}" data-day="${i}">${d}</div>`).join("")}
        </div>

        <label style="margin-top:20px;">Blocked Dates</label>
        <div class="field-hint" style="margin-top:0; margin-bottom:8px;">Block off individual days you're not available, on top of your regular weekly schedule above.</div>
        <div style="display:flex; gap:8px;">
          <input type="date" id="fBlockDateInput" style="flex:1;" min="${new Date().toISOString().slice(0, 10)}" />
          <button type="button" class="btn btn-ghost btn-small" id="fAddBlockedDate">Block</button>
        </div>
        <div class="days-picker" id="fBlockedDatesList" style="margin-top:10px;"></div>
      </fieldset>

      <fieldset class="form-section">
        <legend>Photos</legend>
        <label>Up to 3 — the first is the cover photo shown on your listing card</label>
        <div class="photo-inputs" id="fPhotos">
          ${photoSlotHtml(0, existingUrls[0])}
          ${photoSlotHtml(1, existingUrls[1])}
          ${photoSlotHtml(2, existingUrls[2])}
        </div>
      </fieldset>

      <div style="display:flex; gap:10px; margin-top:8px; flex-wrap:wrap;">
        <button class="btn btn-primary" id="fSave">${isEdit ? "Save Changes" : "Publish Listing"}</button>
        <button class="btn btn-ghost" id="fCancel">Cancel</button>
        ${isEdit ? `<button class="btn ${listing.is_active ? "btn-danger" : "btn-success"}" id="fToggleActive" style="margin-left:auto;">${listing.is_active ? "Deactivate" : "Reactivate"}</button>` : ""}
      </div>
    </div>
  `);

  function showError(msg) {
    wrap.querySelector("#formError").innerHTML = msg ? `<div class="error-box">${icon("alert")}<span>${escapeHtml(msg)}</span></div>` : "";
  }

  wrap.querySelector("#fTripLength").addEventListener("change", (e) => {
    wrap.querySelector("#fPackageDaysWrap").style.display = e.target.value === "multi_day" ? "block" : "none";
  });

  wrap.querySelectorAll(".day-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const day = parseInt(chip.dataset.day, 10);
      if (selectedDays.has(day)) { selectedDays.delete(day); chip.classList.remove("selected"); }
      else { selectedDays.add(day); chip.classList.add("selected"); }
    });
  });

  function renderBlockedDatesList() {
    const list = wrap.querySelector("#fBlockedDatesList");
    list.innerHTML = "";
    if (blockedDates.size === 0) {
      list.appendChild(h(`<span class="field-hint" style="margin:0;">No blocked dates yet.</span>`));
      return;
    }
    Array.from(blockedDates).sort().forEach((dateStr) => {
      const label = new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      const chip = h(`<div class="day-chip selected" data-date="${dateStr}" style="cursor:pointer;" title="Click to unblock">${label} ✕</div>`);
      chip.addEventListener("click", () => {
        blockedDates.delete(dateStr);
        renderBlockedDatesList();
      });
      list.appendChild(chip);
    });
  }
  renderBlockedDatesList();

  wrap.querySelector("#fAddBlockedDate").addEventListener("click", () => {
    const input = wrap.querySelector("#fBlockDateInput");
    if (!input.value) return;
    blockedDates.add(input.value);
    input.value = "";
    renderBlockedDatesList();
  });

  wrap.querySelectorAll("[data-slot-input]").forEach((input) => {
    input.addEventListener("change", (e) => {
      const idx = parseInt(input.dataset.slotInput, 10);
      const file = e.target.files[0];
      if (!file) return;
      pendingPhotoFiles[idx] = file;
      const reader = new FileReader();
      reader.onload = () => {
        const slot = wrap.querySelector(`.photo-slot[data-slot="${idx}"]`);
        slot.querySelector("span:not(.cover-label)")?.remove();
        let img = slot.querySelector("img");
        if (!img) {
          img = document.createElement("img");
          slot.prepend(img);
        }
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  });

  wrap.querySelector("#fCancel").addEventListener("click", render);

  if (isEdit) {
    wrap.querySelector("#fToggleActive").addEventListener("click", async () => {
      const newValue = !listing.is_active;
      if (!newValue === false && listing.is_active) {
        if (!confirm("Deactivate this listing? It will disappear from Explore right away. Existing bookings and messages aren't affected.")) return;
      }
      const { error } = await sb.from("listings").update({ is_active: newValue }).eq("id", listing.id);
      if (error) return showError(error.message);
      render();
    });
  }

  wrap.querySelector("#fSave").addEventListener("click", async () => {
    showError("");
    const title = wrap.querySelector("#fTitle").value.trim();
    const description = wrap.querySelector("#fDescription").value.trim();
    const locationName = wrap.querySelector("#fLocation").value.trim();
    const price = parseFloat(wrap.querySelector("#fPrice").value);
    const tripLength = wrap.querySelector("#fTripLength").value;

    if (!title || !description || !locationName || !price || price <= 0 || selectedDays.size === 0) {
      return showError("Fill in all fields, set a price above $0, and pick at least one day.");
    }

    const payload = {
      title,
      description,
      category: wrap.querySelector("#fCategory").value,
      location_name: locationName,
      pricing_unit: wrap.querySelector("#fPricingUnit").value,
      price_per_person: price,
      max_group_size: parseInt(wrap.querySelector("#fMaxGroup").value, 10) || 1,
      trip_length: tripLength,
      package_days: tripLength === "multi_day" ? (parseInt(wrap.querySelector("#fPackageDays").value, 10) || 3) : null,
      available_days: Array.from(selectedDays).sort((a, b) => a - b),
      blocked_dates: Array.from(blockedDates).sort(),
    };

    const btn = wrap.querySelector("#fSave");
    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      let listingId = isEdit ? listing.id : null;

      if (isEdit) {
        const { error } = await sb.from("listings").update(payload).eq("id", listingId);
        if (error) throw error;
      } else {
        // latitude/longitude are non-optional on the iOS Listing model --
        // a NULL here breaks that whole decode for every listing in the
        // array, not just this one (see the reference doc). 0/0 is what
        // the team has used for every guide-entered listing so far;
        // real geocoding is a nice-to-have, not required for correctness.
        const { data, error } = await sb.from("listings").insert({
          ...payload,
          guide_id: state.session.user.id,
          latitude: 0,
          longitude: 0,
          image_urls: [],
        }).select().single();
        if (error) throw error;
        listingId = data.id;
      }

      // Upload any newly-picked photos, in slot order, preserving
      // whichever existing photo stayed in a slot the guide didn't touch.
      const finalUrls = [...existingUrls];
      for (let i = 0; i < 3; i++) {
        const file = pendingPhotoFiles[i];
        if (!file) continue;
        const path = `${state.session.user.id}/${listingId}/photo${i + 1}.jpg`;
        const { error: upErr } = await sb.storage.from("listing-images").upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: true,
        });
        if (upErr) throw upErr;
        const { data: pub } = sb.storage.from("listing-images").getPublicUrl(path);
        finalUrls[i] = pub.publicUrl;
      }
      const cleanedUrls = finalUrls.filter(Boolean);
      if (cleanedUrls.length > 0 || isEdit) {
        await sb.from("listings").update({ image_urls: cleanedUrls }).eq("id", listingId);
      }

      render();
    } catch (err) {
      showError(err.message || "Something went wrong saving this listing.");
      btn.disabled = false;
      btn.textContent = isEdit ? "Save Changes" : "Publish Listing";
    }
  });

  appEl.innerHTML = "";
  appEl.appendChild(wrap);
}

// ---------------- Bookings ----------------
async function loadBookings() {
  const { data, error } = await sb
    .from("bookings")
    .select("*, listings(title)")
    .eq("guide_id", state.session.user.id)
    .order("date", { ascending: true });
  if (!error) state.bookings = data;
}

async function renderBookingsView() {
  appEl.innerHTML = `<div class="loading">Loading bookings&hellip;</div>`;
  await loadBookings();

  const wrap = h(`
    <div>
      <h1>Bookings</h1>
      <div id="calendarWrap" style="margin-bottom:20px;"></div>
      <div id="bookingsBody"></div>
    </div>
  `);
  wrap.querySelector("#calendarWrap").appendChild(renderAvailabilityCalendar(state.bookings));
  const body = wrap.querySelector("#bookingsBody");

  if (state.bookings.length === 0) {
    body.appendChild(emptyState({
      iconName: "bookings",
      title: "No bookings yet",
      body: "Requests against your listings will show up here.",
    }));
  } else {
    const card = h(`<div class="card"></div>`);
    state.bookings.forEach((b) => {
      const badgeClass = b.status === "confirmed" ? "badge-confirmed" : b.status === "pending" ? "badge-pending" : "badge-cancelled";
      const row = h(`
        <div class="booking-card">
          <div class="booking-top">
            <div>
              <span class="badge ${badgeClass}">${b.status}</span>
              <strong>${escapeHtml(b.listings?.title || "Listing")}</strong>
              <div class="listing-meta">${new Date(b.date).toLocaleDateString()} · ${guestSummary(b)} · ${money(b.total_price)}</div>
            </div>
          </div>
          ${b.status === "pending" ? `
            <div class="booking-actions">
              <button class="btn btn-success btn-small" data-confirm="${b.id}">Confirm</button>
              <button class="btn btn-danger btn-small" data-decline="${b.id}">Decline</button>
            </div>
          ` : ""}
        </div>
      `);
      card.appendChild(row);
    });
    body.appendChild(card);
    wireBookingActionButtons(body, () => renderBookingsView());
  }

  appEl.innerHTML = "";
  appEl.appendChild(wrap);
}

// ---------------- Messages ----------------
async function renderMessagesView() {
  appEl.innerHTML = `<div class="loading">Loading conversations&hellip;</div>`;
  await loadBookings();
  const messageable = state.bookings.filter((b) => b.status === "confirmed" || b.status === "completed");

  const wrap = h(`<div><h1>Messages</h1><div id="msgBody"></div></div>`);
  const body = wrap.querySelector("#msgBody");

  if (messageable.length === 0) {
    body.appendChild(emptyState({
      iconName: "messages",
      title: "No conversations yet",
      body: "Messaging opens automatically once a booking is confirmed.",
    }));
  } else {
    const list = h(`<div class="thread-list"></div>`);
    messageable.forEach((b) => {
      const item = h(`
        <div class="thread-item" data-thread="${b.id}">
          <span><strong>${escapeHtml(b.listings?.title || "Listing")}</strong> — ${new Date(b.date).toLocaleDateString()}</span>
          <span>›</span>
        </div>
      `);
      item.addEventListener("click", () => renderThreadView(b));
      list.appendChild(item);
    });
    body.appendChild(list);
  }

  appEl.innerHTML = "";
  appEl.appendChild(wrap);
}

async function renderThreadView(booking) {
  appEl.innerHTML = `<div class="loading">Loading conversation&hellip;</div>`;
  const { data: messages } = await sb
    .from("messages")
    .select("*")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: true });

  const wrap = h(`
    <div class="card" style="max-width:600px;margin:0 auto;">
      <button class="btn btn-ghost btn-small" id="backToThreads" style="margin-bottom:16px;">‹ Back</button>
      <h2>${escapeHtml(booking.listings?.title || "Listing")}</h2>
      <div class="chat-box" id="chatBox"></div>
      <div class="chat-input-row">
        <input type="text" id="chatInput" placeholder="Type a message…" />
        <button class="btn btn-primary" id="chatSend">Send</button>
      </div>
    </div>
  `);

  const box = wrap.querySelector("#chatBox");
  (messages || []).forEach((m) => {
    const mine = m.sender_id === state.session.user.id;
    box.appendChild(h(`<div class="chat-msg ${mine ? "mine" : "theirs"}">${escapeHtml(m.body)}</div>`));
  });
  box.scrollTop = box.scrollHeight;

  wrap.querySelector("#backToThreads").addEventListener("click", renderMessagesView);
  wrap.querySelector("#chatSend").addEventListener("click", async () => {
    const input = wrap.querySelector("#chatInput");
    const body = input.value.trim();
    if (!body) return;
    input.value = "";
    const { error } = await sb.from("messages").insert({
      booking_id: booking.id,
      sender_id: state.session.user.id,
      body,
    });
    if (!error) renderThreadView(booking);
  });

  appEl.innerHTML = "";
  appEl.appendChild(wrap);
}

// ---------------- Payouts (Stripe Connect) ----------------
async function renderPayoutsView() {
  const enabled = state.profile.stripe_charges_enabled;
  const feeWaived = state.profile.platform_fee_waived === true;
  const wrap = h(`
    <div class="card" style="max-width:480px;margin:0 auto;">
      <h1>Payouts</h1>
      <p class="sub">Payments are handled through Stripe Connect — the same setup as the iOS app.</p>
      ${enabled
        ? `<div class="success-box">${icon("check")}<span>Your Stripe account is connected and ready to accept payments.</span></div>`
        : `<div class="error-box">${icon("alert")}<span>You haven't finished connecting Stripe yet — your listings won't be bookable until you do.</span></div>`
      }
      <button class="btn btn-primary btn-block" id="stripeConnectBtn" style="margin-top:14px;">
        ${enabled ? "Manage Stripe Account" : "Connect with Stripe"}
      </button>
      <div id="payoutsError"></div>

      <div class="section-heading" style="margin-top:26px;">How you get paid</div>
      <div class="fee-row">
        <span class="fee-row-label">When funds move</span>
        <span class="fee-row-value">On your confirmation</span>
      </div>
      <div class="fee-row">
        <span class="fee-row-label">TruGuidz platform fee</span>
        <span class="fee-row-value ${feeWaived ? "waived" : ""}">${feeWaived ? "Waived" : "10% per booking"}</span>
      </div>
      <div class="fee-row">
        <span class="fee-row-label">Stripe processing</span>
        <span class="fee-row-value">Standard rate applies</span>
      </div>
      <p class="field-hint" style="margin-top:12px;">
        A guest's card is authorized when they request a trip, but nothing is charged until you confirm — decline a request and they're never charged.
      </p>
    </div>
  `);

  wrap.querySelector("#stripeConnectBtn").addEventListener("click", async () => {
    const btn = wrap.querySelector("#stripeConnectBtn");
    btn.disabled = true;
    btn.textContent = "Redirecting…";
    try {
      const { data, error } = await sb.functions.invoke("stripe-connect-onboarding");
      if (error) throw error;
      window.location.href = data.url;
    } catch (err) {
      wrap.querySelector("#payoutsError").innerHTML = `<div class="error-box">${icon("alert")}<span>${escapeHtml(err.message || "Could not start Stripe onboarding.")}</span></div>`;
      btn.disabled = false;
      btn.textContent = enabled ? "Manage Stripe Account" : "Connect with Stripe";
    }
  });

  appEl.innerHTML = "";
  appEl.appendChild(wrap);
}

init();
