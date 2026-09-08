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
  view: "listings",
  listings: [],
  bookings: [],
  selectedBookingId: null,
  messages: [],
};

const appEl = document.getElementById("app");
const navEl = document.getElementById("nav");

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
  navEl.hidden = !(state.session && state.profile && state.profile.verification_status === "approved");
  navEl.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === state.view);
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
  if (state.view === "listings") renderListingsView();
  else if (state.view === "bookings") renderBookingsView();
  else if (state.view === "messages") renderMessagesView();
  else if (state.view === "payouts") renderPayoutsView();
}

navEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-btn[data-view]");
  if (btn) {
    state.view = btn.dataset.view;
    render();
  }
});
document.getElementById("signOutBtn").addEventListener("click", signOut);

// ---------------- Auth view ----------------
function renderAuthView() {
  const wrap = h(`
    <div class="card" style="max-width:420px;margin:40px auto;">
      <h1>Guide Sign In</h1>
      <p class="sub">Same account as the TruGuidz app — sign up here or sign in if you already have one.</p>
      <div id="authError"></div>
      <label>Email</label>
      <input type="email" id="authEmail" autocomplete="email" />
      <label>Password</label>
      <input type="password" id="authPassword" autocomplete="current-password" />
      <label>Full Name (only needed for new accounts)</label>
      <input type="text" id="authName" autocomplete="name" />
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button class="btn btn-primary btn-block" id="signInBtn">Sign In</button>
        <button class="btn btn-ghost btn-block" id="signUpBtn">Create Account</button>
      </div>
    </div>
  `);

  function showError(msg) {
    wrap.querySelector("#authError").innerHTML = msg ? `<div class="error-box">${escapeHtml(msg)}</div>` : "";
  }

  wrap.querySelector("#signInBtn").addEventListener("click", async () => {
    showError("");
    const email = wrap.querySelector("#authEmail").value.trim();
    const password = wrap.querySelector("#authPassword").value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return showError(error.message);
    state.session = data.session;
    await loadProfile();
    render();
  });

  wrap.querySelector("#signUpBtn").addEventListener("click", async () => {
    showError("");
    const email = wrap.querySelector("#authEmail").value.trim();
    const password = wrap.querySelector("#authPassword").value;
    const name = wrap.querySelector("#authName").value.trim();
    if (!name) return showError("Enter your full name to create an account.");
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { name } }, // read by the handle_new_user trigger, same as the iOS signup flow
    });
    if (error) return showError(error.message);
    if (!data.session) {
      return showError("Check your email to confirm your account, then sign in here.");
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
    <div class="card" style="max-width:520px;margin:20px auto;">
      <h1>Become a Guide</h1>
      <p class="sub">Tell us about yourself and upload a photo ID. We manually review every application before your listings go live.</p>
      ${rejected ? `<div class="error-box">Your previous application wasn't approved. You're welcome to re-apply with updated info.</div>` : ""}
      <div id="applyError"></div>

      <label>Phone Number</label>
      <input type="tel" id="applyPhone" />

      <label>Years of Experience Guiding</label>
      <input type="number" id="applyYears" min="0" max="50" value="1" />

      <label>Bio</label>
      <textarea id="applyBio" placeholder="Explorers will see this on your listings."></textarea>

      <label>Government-Issued Photo ID</label>
      <input type="file" id="applyIdPhoto" accept="image/*" />
      <div class="field-hint">Only used to verify your identity. Never shown publicly.</div>

      <div class="checkbox-row">
        <input type="checkbox" id="applyWaiver" />
        <label for="applyWaiver">I've read and accept the TruGuidz Guide Agreement and consent to identity verification.</label>
      </div>

      <button class="btn btn-primary btn-block" id="applySubmit" style="margin-top:10px;">Submit Application</button>
    </div>
  `);

  function showError(msg) {
    wrap.querySelector("#applyError").innerHTML = msg ? `<div class="error-box">${escapeHtml(msg)}</div>` : "";
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
      <h1>Application Submitted</h1>
      <p class="sub">We're reviewing your application now. You'll be able to list trips here as soon as it's approved.</p>
      <button class="btn btn-ghost" id="pendingSignOut">Sign Out</button>
    </div>
  `);
}
// delegate since this view is re-rendered fresh each time
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "pendingSignOut") signOut();
});

// ---------------- Listings ----------------
async function loadListings() {
  const { data, error } = await sb
    .from("listings")
    .select("*")
    .eq("guide_id", state.session.user.id)
    .order("created_at", { ascending: false });
  if (!error) state.listings = data;
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
    body.appendChild(h(`<div class="card empty-state">No listings yet. Create your first trip to start getting bookings.</div>`));
  } else {
    const grid = h(`<div class="listing-grid"></div>`);
    state.listings.forEach((listing) => {
      const card = h(`
        <div class="listing-card ${listing.is_active ? "" : "inactive"}">
          <img class="listing-photo" src="${listing.image_urls?.[0] || ""}" onerror="this.style.visibility='hidden'" />
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
    body.appendChild(grid);
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

  const wrap = h(`
    <div class="card" style="max-width:560px;margin:0 auto;">
      <h1>${isEdit ? "Edit Listing" : "New Listing"}</h1>
      <div id="formError"></div>

      <label>Title</label>
      <input type="text" id="fTitle" value="${isEdit ? escapeHtml(listing.title) : ""}" placeholder="e.g. Susquehanna Bass Excursion" />

      <label>Category</label>
      <select id="fCategory">
        ${CATEGORY_OPTIONS.map(o => `<option value="${o.value}" ${isEdit && listing.category === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
      </select>

      <label>Description</label>
      <textarea id="fDescription">${isEdit ? escapeHtml(listing.description) : ""}</textarea>

      <label>Location (e.g. Catawissa, PA)</label>
      <input type="text" id="fLocation" value="${isEdit ? escapeHtml(listing.location_name) : ""}" />

      <label>Pricing</label>
      <select id="fPricingUnit">
        ${PRICING_OPTIONS.map(o => `<option value="${o.value}" ${isEdit && listing.pricing_unit === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
      </select>
      <input type="number" id="fPrice" min="0" step="0.01" value="${isEdit ? listing.price_per_person : ""}" placeholder="Price ($)" style="margin-top:8px;" />

      <label>Max Group Size</label>
      <input type="number" id="fMaxGroup" min="1" value="${isEdit ? listing.max_group_size : 4}" />

      <label>Trip Length</label>
      <select id="fTripLength">
        ${TRIP_LENGTH_OPTIONS.map(o => `<option value="${o.value}" ${isEdit && listing.trip_length === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
      </select>
      <div id="fPackageDaysWrap" style="display:${isEdit && listing.trip_length === "multi_day" ? "block" : "none"};">
        <label>Package Length (days)</label>
        <input type="number" id="fPackageDays" min="2" max="30" value="${isEdit && listing.package_days ? listing.package_days : 3}" />
      </div>

      <label>Available Days</label>
      <div class="days-picker" id="fDays">
        ${DAY_LABELS.map((d, i) => `<div class="day-chip ${selectedDays.has(i) ? "selected" : ""}" data-day="${i}">${d}</div>`).join("")}
      </div>

      <label>Photos (up to 3 — first is the cover shown on cards)</label>
      <div class="photo-inputs" id="fPhotos">
        ${photoSlotHtml(0, existingUrls[0])}
        ${photoSlotHtml(1, existingUrls[1])}
        ${photoSlotHtml(2, existingUrls[2])}
      </div>

      <div style="display:flex; gap:10px; margin-top:24px;">
        <button class="btn btn-primary" id="fSave">${isEdit ? "Save Changes" : "Publish Listing"}</button>
        <button class="btn btn-ghost" id="fCancel">Cancel</button>
        ${isEdit ? `<button class="btn ${listing.is_active ? "btn-danger" : "btn-success"}" id="fToggleActive" style="margin-left:auto;">${listing.is_active ? "Deactivate" : "Reactivate"}</button>` : ""}
      </div>
    </div>
  `);

  function showError(msg) {
    wrap.querySelector("#formError").innerHTML = msg ? `<div class="error-box">${escapeHtml(msg)}</div>` : "";
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

  wrap.querySelector("#fCancel").addEventListener("click", renderListingsView);

  if (isEdit) {
    wrap.querySelector("#fToggleActive").addEventListener("click", async () => {
      const newValue = !listing.is_active;
      if (!newValue === false && listing.is_active) {
        if (!confirm("Deactivate this listing? It will disappear from Explore right away. Existing bookings and messages aren't affected.")) return;
      }
      const { error } = await sb.from("listings").update({ is_active: newValue }).eq("id", listing.id);
      if (error) return showError(error.message);
      renderListingsView();
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

      renderListingsView();
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
    body.appendChild(h(`<div class="card empty-state">No bookings yet.</div>`));
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
              <div class="listing-meta">${new Date(b.date).toLocaleDateString()} · ${b.number_of_guests} guest${b.number_of_guests === 1 ? "" : "s"} · ${money(b.total_price)}</div>
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

    body.querySelectorAll("[data-confirm]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const { error } = await sb.functions.invoke("stripe-capture-payment", { body: { bookingId: btn.dataset.confirm } });
        if (error) { alert("Could not confirm booking: " + error.message); btn.disabled = false; return; }
        renderBookingsView();
      });
    });
    body.querySelectorAll("[data-decline]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Decline this booking request?")) return;
        btn.disabled = true;
        const { error } = await sb.functions.invoke("stripe-cancel-payment", { body: { bookingId: btn.dataset.decline } });
        if (error) { alert("Could not decline booking: " + error.message); btn.disabled = false; return; }
        renderBookingsView();
      });
    });
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
    body.appendChild(h(`<div class="card empty-state">Messaging opens once a booking is confirmed.</div>`));
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
  const wrap = h(`
    <div class="card" style="max-width:480px;margin:0 auto;">
      <h1>Payouts</h1>
      <p class="sub">Payments are handled through Stripe Connect — the same setup as the iOS app.</p>
      ${enabled
        ? `<div class="info-box">✓ Your Stripe account is connected and ready to accept payments.</div>`
        : `<div class="error-box">You haven't finished connecting Stripe yet — your listings won't be bookable until you do.</div>`
      }
      <button class="btn btn-primary btn-block" id="stripeConnectBtn" style="margin-top:14px;">
        ${enabled ? "Manage Stripe Account" : "Connect with Stripe"}
      </button>
      <div id="payoutsError"></div>
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
      wrap.querySelector("#payoutsError").innerHTML = `<div class="error-box">${escapeHtml(err.message || "Could not start Stripe onboarding.")}</div>`;
      btn.disabled = false;
      btn.textContent = enabled ? "Manage Stripe Account" : "Connect with Stripe";
    }
  });

  appEl.innerHTML = "";
  appEl.appendChild(wrap);
}

init();
