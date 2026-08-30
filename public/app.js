const TOKEN_KEY = "ods_admin_token";
const ORDER_LABEL = { animal: (a) => a[0].toUpperCase() + a.slice(1) };

const logEl = document.getElementById("log");
function log(message, level = "info") {
  const time = new Date().toLocaleTimeString();
  const prefix = level === "error" ? "✗" : "✓";
  logEl.textContent = `[${time}] ${prefix} ${message}\n${logEl.textContent}`;
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setTokenStatus() {
  const dot = document.getElementById("token-status");
  const has = Boolean(getToken());
  dot.classList.toggle("saved", has);
  dot.title = has ? "admin token saved" : "no admin token saved";
}

async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["x-admin-token"] = token;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = data && data.error ? JSON.stringify(data.error) : res.statusText;
    log(`${method} ${path} → ${res.status}: ${message}`, "error");
    throw new Error(message);
  }

  log(`${method} ${path} → ${res.status}`);
  return data;
}

function orderBadge(order) {
  const span = document.createElement("span");
  span.className = `order-badge order-${order.slug}`;
  span.innerHTML = `<span class="order-swatch"></span> ${order.name} (${order.animal})`;
  return span;
}

// ---------- Standings ----------

async function loadStandings() {
  const totals = await api("/orders/totals");
  totals.sort((a, b) => b.totalPoints - a.totalPoints);
  const body = document.getElementById("standings-body");
  body.innerHTML = "";
  for (const order of totals) {
    const tr = document.createElement("tr");
    const badgeTd = document.createElement("td");
    badgeTd.appendChild(orderBadge(order));
    tr.appendChild(badgeTd);
    tr.insertAdjacentHTML(
      "beforeend",
      `<td>${ORDER_LABEL.animal(order.animal)}</td><td>${order.playerCount}</td><td>${order.totalPoints}</td>`,
    );
    body.appendChild(tr);
  }
}

document.querySelector('[data-refresh="standings"]').addEventListener("click", () => {
  loadStandings().catch(() => {});
});

// ---------- Players ----------

let currentPlayer = null;

function renderPlayer(player) {
  currentPlayer = player;
  document.getElementById("player-card").hidden = false;
  document.getElementById("player-name").textContent = player.displayName || player.email;
  document.getElementById("player-id").textContent = player.id;
  document.getElementById("player-email").textContent = player.email;
  document.getElementById("player-order").textContent = player.order
    ? `${player.order.name} (${player.order.animal})`
    : player.orderSlug;
  document.getElementById("player-points").textContent = player.progress ? player.progress.points : "—";
  document.getElementById("player-degree").textContent = player.progress ? player.progress.degree : "—";

  const list = document.getElementById("player-achievements");
  list.innerHTML = "";
  const achievements = player.achievements || [];
  if (achievements.length === 0) {
    list.innerHTML = "<li>No achievements yet.</li>";
  } else {
    for (const a of achievements) {
      const li = document.createElement("li");
      li.innerHTML = `${a.title} <div class="code">${a.code}</div>`;
      list.appendChild(li);
    }
  }

  document.querySelector('#participation-form [name="playerId"]').value = player.id;
}

document.getElementById("player-lookup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = event.submitter?.dataset.action || "find";
  const form = event.target;
  const email = form.email.value.trim();
  const displayName = form.displayName.value.trim();

  try {
    if (action === "create") {
      const player = await api("/players", { method: "POST", body: { email, displayName: displayName || undefined } });
      renderPlayer(player);
    } else {
      const player = await api(`/players/by-email/${encodeURIComponent(email)}`);
      renderPlayer(player);
    }
  } catch {
    // already logged by api()
  }
});

document.getElementById("points-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentPlayer) return log("Find or create a player first.", "error");
  const points = Number(event.target.points.value);
  try {
    await api(`/players/${currentPlayer.id}/points`, { method: "POST", body: { points } });
    const refreshed = await api(`/players/${currentPlayer.id}`);
    renderPlayer(refreshed);
    event.target.reset();
    loadStandings().catch(() => {});
  } catch {
    // already logged
  }
});

document.getElementById("achievement-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentPlayer) return log("Find or create a player first.", "error");
  const form = event.target;
  const code = form.code.value.trim();
  const title = form.title.value.trim();
  const eventId = form.eventId.value.trim() || undefined;
  try {
    await api(`/players/${currentPlayer.id}/achievements`, { method: "POST", body: { code, title, eventId } });
    const refreshed = await api(`/players/${currentPlayer.id}`);
    renderPlayer(refreshed);
    form.reset();
  } catch {
    // already logged
  }
});

// ---------- Events ----------

let selectedEventId = null;

async function loadEvents() {
  const events = await api("/events");
  const list = document.getElementById("event-list");
  list.innerHTML = "";
  for (const evt of events) {
    const li = document.createElement("li");
    li.textContent = evt.name;
    li.dataset.id = evt.id;
    if (evt.id === selectedEventId) li.classList.add("selected");
    const date = evt.startDate ? new Date(evt.startDate).toLocaleDateString() : "";
    if (date) {
      const span = document.createElement("span");
      span.textContent = date;
      li.appendChild(span);
    }
    li.addEventListener("click", () => selectEvent(evt));
    list.appendChild(li);
  }
}

async function selectEvent(evt) {
  selectedEventId = evt.id;
  document.getElementById("selected-event-name").textContent = evt.name;
  document.querySelectorAll("#event-list li").forEach((li) => {
    li.classList.toggle("selected", li.dataset.id === evt.id);
  });
  loadEventTotals().catch(() => {});
}

async function loadEventTotals() {
  if (!selectedEventId) return;
  const totals = await api(`/events/${selectedEventId}/order-totals`);
  const body = document.getElementById("event-totals-body");
  body.innerHTML = "";
  for (const order of totals) {
    const tr = document.createElement("tr");
    const badgeTd = document.createElement("td");
    badgeTd.appendChild(orderBadge(order));
    tr.appendChild(badgeTd);
    tr.insertAdjacentHTML("beforeend", `<td>${order.playerCount}</td><td>${order.totalPoints}</td>`);
    body.appendChild(tr);
  }
}

document.getElementById("event-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const name = form.name.value.trim();
  const leagueAppsEventId = form.leagueAppsEventId.value.trim() || undefined;
  try {
    await api("/events", { method: "POST", body: { name, leagueAppsEventId } });
    form.reset();
    loadEvents().catch(() => {});
  } catch {
    // already logged
  }
});

document.getElementById("participation-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedEventId) return log("Select an event first.", "error");
  const form = event.target;
  const playerId = form.playerId.value.trim();
  const pointsEarned = Number(form.pointsEarned.value);
  const placement = form.placement.value ? Number(form.placement.value) : undefined;
  try {
    await api(`/events/${selectedEventId}/participation`, {
      method: "POST",
      body: { playerId, pointsEarned, placement },
    });
    loadEventTotals().catch(() => {});
    loadStandings().catch(() => {});
  } catch {
    // already logged
  }
});

// ---------- Admin token ----------

document.getElementById("save-token").addEventListener("click", () => {
  const input = document.getElementById("admin-token");
  if (input.value) {
    localStorage.setItem(TOKEN_KEY, input.value);
    log("Admin token saved to this browser.");
  } else {
    localStorage.removeItem(TOKEN_KEY);
    log("Admin token cleared.");
  }
  input.value = "";
  setTokenStatus();
});

// ---------- Init ----------

setTokenStatus();
loadStandings().catch(() => {});
loadEvents().catch(() => {});
