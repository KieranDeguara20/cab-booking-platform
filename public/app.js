const state = {
  token: localStorage.getItem("cabBookingToken") || "",
  customer: null,
  locations: [],
};

const message = document.querySelector("#message");
const sessionStatus = document.querySelector("#sessionStatus");
const apiStatus = document.querySelector("#apiStatus");
const loadingOverlay = document.querySelector("#loadingOverlay");
let activeRequests = 0;

function showMessage(text) {
  message.textContent = text;
  message.classList.add("visible");
  window.setTimeout(() => message.classList.remove("visible"), 3200);
}

function updateSession() {
  sessionStatus.textContent = state.token && state.customer
    ? `Signed in as ${state.customer.email}`
    : state.token
      ? "Signed in"
      : "Signed out";
}

function setLoading(isLoading) {
  activeRequests += isLoading ? 1 : -1;
  activeRequests = Math.max(activeRequests, 0);
  loadingOverlay.classList.toggle("visible", activeRequests > 0);

  document.querySelectorAll("button").forEach((button) => {
    button.disabled = activeRequests > 0;
  });
}

async function parseJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("The server returned an invalid JSON response.");
  }
}

function formDataToObject(form) {
  const data = Object.fromEntries(new FormData(form).entries());

  for (const checkbox of form.querySelectorAll('input[type="checkbox"]')) {
    data[checkbox.name] = checkbox.checked;
  }

  return data;
}

async function gateway(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  let response;
  let payload;

  setLoading(true);

  try {
    response = await fetch(`/api/gateway${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    payload = await parseJsonResponse(response);
  } catch (error) {
    throw new Error("Could not reach the online service. Try again after a few seconds.");
  } finally {
    setLoading(false);
  }

  if (!response.ok) {
    throw new Error(payload.data?.message || payload.message || "Request failed.");
  }

  return payload.data;
}

async function checkApiStatus() {
  try {
    const response = await fetch("/health");
    const data = await parseJsonResponse(response);

    if (!response.ok || data.status !== "ok") {
      throw new Error("Health check failed.");
    }

    apiStatus.textContent = "API online";
    apiStatus.classList.remove("offline");
    apiStatus.classList.add("online");
  } catch (error) {
    apiStatus.textContent = "API waking up";
    apiStatus.classList.remove("online");
    apiStatus.classList.add("offline");
  }
}

function renderJson(elementId, data) {
  document.querySelector(elementId).textContent = JSON.stringify(data, null, 2);
}

function renderList(elementId, items, renderer, emptyText) {
  const container = document.querySelector(elementId);
  container.innerHTML = "";

  if (!items || items.length === 0) {
    container.innerHTML = `<div class="item meta">${emptyText}</div>`;
    return;
  }

  for (const item of items) {
    const node = document.createElement("div");
    node.className = "item";
    node.innerHTML = renderer(item);
    container.appendChild(node);
  }
}

async function loadProfile() {
  const data = await gateway("/customers/me");
  state.customer = data.customer;
  updateSession();
  renderJson("#profileOutput", data.customer);
}

async function loadNotifications() {
  const data = await gateway("/customers/me/notifications");
  renderList(
    "#notificationsList",
    data.notifications,
    (notification) => `
      <strong>${notification.title}</strong>
      <div class="meta">${notification.message}</div>
      <div class="meta">Type: ${notification.type} | Read: ${notification.read}</div>
    `,
    "No notifications found."
  );
}

async function loadBookings(type) {
  const data = await gateway(`/bookings/${type}`);
  renderList(
    "#bookingsList",
    data.bookings,
    (booking) => `
      <strong>${booking.startingLocation} to ${booking.endingLocation}</strong>
      <div class="meta">ID: ${booking.id}</div>
      <div class="meta">${new Date(booking.bookingDateTime).toLocaleString()} | ${booking.cabType} | ${booking.passengers} passenger(s)</div>
      <div class="meta">Status: ${booking.status} | Payment: ${booking.paymentStatus}</div>
    `,
    "No bookings found."
  );
}

async function loadPayments() {
  const data = await gateway("/payments");
  renderList(
    "#paymentsList",
    data.payments,
    (payment) => `
      <strong>${payment.currency} ${payment.totalPrice}</strong>
      <div class="meta">Payment ID: ${payment.id}</div>
      <div class="meta">Booking ID: ${payment.bookingId}</div>
      <div class="meta">Method: ${payment.paymentMethod} | Fare source: ${payment.fareSource}</div>
    `,
    "No payments found."
  );
}

async function loadLocations() {
  const data = await gateway("/locations");
  state.locations = data.locations || [];
  renderList(
    "#locationsList",
    state.locations,
    (location) => `
      <strong>${location.label}</strong>
      <div class="meta">${location.address}, ${location.city || ""} ${location.country || ""}</div>
      <div class="meta">ID: ${location.id}</div>
      <div class="inline-actions">
        <button class="secondary" type="button" data-weather="${location.id}">Weather</button>
        <button class="secondary" type="button" data-edit-location="${location.id}">Edit</button>
        <button class="danger" type="button" data-delete-location="${location.id}">Delete</button>
      </div>
    `,
    "No favourite locations found."
  );
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.panel}`).classList.add("active");
  });
});

document.querySelector("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const data = await gateway("/customers/register", {
      method: "POST",
      body: formDataToObject(event.currentTarget),
    });
    state.token = data.token;
    state.customer = data.customer;
    localStorage.setItem("cabBookingToken", state.token);
    updateSession();
    renderJson("#profileOutput", data.customer);
    showMessage("Account created.");
  } catch (error) {
    showMessage(error.message);
  }
});

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const data = await gateway("/customers/login", {
      method: "POST",
      body: formDataToObject(event.currentTarget),
    });
    state.token = data.token;
    state.customer = data.customer;
    localStorage.setItem("cabBookingToken", state.token);
    updateSession();
    renderJson("#profileOutput", data.customer);
    showMessage("Login successful.");
  } catch (error) {
    showMessage(error.message);
  }
});

document.querySelector("#logoutButton").addEventListener("click", () => {
  state.token = "";
  state.customer = null;
  localStorage.removeItem("cabBookingToken");
  updateSession();
  showMessage("Logged out.");
});

document.querySelector("#loadProfileButton").addEventListener("click", () => {
  loadProfile().catch((error) => showMessage(error.message));
});

document.querySelector("#bookingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = formDataToObject(event.currentTarget);
  body.bookingDateTime = new Date(body.bookingDateTime).toISOString();
  body.passengers = Number(body.passengers);

  try {
    await gateway("/bookings", { method: "POST", body });
    event.currentTarget.reset();
    showMessage("Booking created.");
    await loadBookings("current");
  } catch (error) {
    showMessage(error.message);
  }
});

document.querySelector("#loadCurrentBookingsButton").addEventListener("click", () => {
  loadBookings("current").catch((error) => showMessage(error.message));
});

document.querySelector("#loadPastBookingsButton").addEventListener("click", () => {
  loadBookings("past").catch((error) => showMessage(error.message));
});

document.querySelector("#paymentForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await gateway("/payments", {
      method: "POST",
      body: formDataToObject(event.currentTarget),
    });
    event.currentTarget.reset();
    showMessage("Payment processed.");
    await loadPayments();
  } catch (error) {
    showMessage(error.message);
  }
});

document.querySelector("#loadPaymentsButton").addEventListener("click", () => {
  loadPayments().catch((error) => showMessage(error.message));
});

document.querySelector("#locationForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = formDataToObject(form);
  const locationId = body.locationId;
  delete body.locationId;

  try {
    await gateway(locationId ? `/locations/${locationId}` : "/locations", {
      method: locationId ? "PUT" : "POST",
      body,
    });
    form.reset();
    showMessage("Location saved.");
    await loadLocations();
  } catch (error) {
    showMessage(error.message);
  }
});

document.querySelector("#loadLocationsButton").addEventListener("click", () => {
  loadLocations().catch((error) => showMessage(error.message));
});

document.querySelector("#locationsList").addEventListener("click", async (event) => {
  const weatherId = event.target.dataset.weather;
  const deleteId = event.target.dataset.deleteLocation;
  const editLocation = event.target.dataset.editLocation;

  try {
    if (weatherId) {
      const data = await gateway(`/locations/${weatherId}/weather`);
      showMessage(`${data.weather.location}: ${data.weather.current.condition}, ${data.weather.current.temperatureC}C`);
    }

    if (deleteId) {
      await gateway(`/locations/${deleteId}`, { method: "DELETE", body: {} });
      showMessage("Location removed.");
      await loadLocations();
    }

    if (editLocation) {
      const location = state.locations.find((item) => item.id === editLocation);

      if (!location) {
        return;
      }

      const form = document.querySelector("#locationForm");
      form.locationId.value = location.id;
      form.label.value = location.label || "";
      form.address.value = location.address || "";
      form.city.value = location.city || "";
      form.country.value = location.country || "";
      form.notes.value = location.notes || "";
    }
  } catch (error) {
    showMessage(error.message);
  }
});

document.querySelector("#loadNotificationsButton").addEventListener("click", () => {
  loadNotifications().catch((error) => showMessage(error.message));
});

updateSession();
checkApiStatus();
if (state.token) {
  loadProfile().catch(() => updateSession());
}
