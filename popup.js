const els = {
  search: document.getElementById("search"),
  list: document.getElementById("list"),
  notice: document.getElementById("notice"),
  rotate: document.getElementById("rotate"),
  zoom: document.getElementById("zoom"),
  deactivate: document.getElementById("deactivate"),
  statusDot: document.getElementById("statusDot"),
};

let tabId = null;
const state = { deviceId: null, zoom: "fit", orientation: "portrait", active: false };

const canRun = (url) => /^(https?|file):\/\//i.test(url || "");
const deviceById = (id) => DEVICES.find((d) => d.id === id);

function tabSend(msg) {
  return new Promise((resolve) => {
    if (tabId == null) return resolve(null);
    chrome.tabs.sendMessage(tabId, msg, (resp) => {
      void chrome.runtime.lastError; // swallow "no receiver" on chrome:// pages
      resolve(resp ?? null);
    });
  });
}

function configureTab(userAgent) {
  return chrome.runtime.sendMessage({ type: "configure", tabId, userAgent });
}

// Declared content scripts don't land in tabs that were already open when the
// extension loaded, so inject the overlay controller on demand. It self-guards
// against running twice, so re-injecting is a no-op.
async function ensureInjected() {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["overlay-inject.js"] });
    return true;
  } catch (e) {
    return false;
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  if (!tab || !canRun(tab.url)) {
    showNotice("Can't run here — open a normal http(s) site and try again.");
    return;
  }
  const { popupState } = await chrome.storage.local.get("popupState");
  if (popupState) Object.assign(state, popupState, { active: false });

  const injected = await ensureInjected();
  if (!injected) {
    showNotice("Can't run here — this page blocks extensions (try a normal site).");
    return;
  }
  const status = await tabSend({ type: "rv-status" });
  if (status?.active) {
    state.active = true;
    state.deviceId = status.deviceId || state.deviceId;
    state.zoom = status.zoom || state.zoom;
    state.orientation = status.orientation || state.orientation;
  }
  els.zoom.value = state.zoom;
  renderList();
  reflectActive();
  wire();
  els.search.focus();
}

function showNotice(text) {
  els.notice.textContent = text;
  els.notice.classList.remove("hidden");
  els.list.classList.add("hidden");
  els.search.disabled = true;
}

function renderList() {
  const q = els.search.value.trim().toLowerCase();
  const matches = DEVICES.filter((d) => {
    if (d.id === "custom") return false;
    if (!q) return true;
    return (d.name + " " + d.brand).toLowerCase().includes(q);
  });

  els.list.replaceChildren();
  if (!matches.length) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "No devices match.";
    els.list.appendChild(e);
    return;
  }
  let brand = null;
  for (const d of matches) {
    if (d.brand !== brand) {
      brand = d.brand;
      const h = document.createElement("div");
      h.className = "brand";
      h.textContent = brand;
      els.list.appendChild(h);
    }
    const row = document.createElement("div");
    row.className = "item" + (d.id === state.deviceId && state.active ? " active" : "");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = d.name;
    const dims = document.createElement("span");
    dims.className = "dims";
    dims.textContent = `${d.width}×${d.height}`;
    row.append(name, dims);
    row.addEventListener("click", () => pick(d.id));
    els.list.appendChild(row);
  }
}

function reflectActive() {
  els.statusDot.classList.toggle("on", state.active);
  els.deactivate.classList.toggle("hidden", !state.active);
}

function persist() {
  chrome.storage.local.set({
    popupState: { deviceId: state.deviceId, zoom: state.zoom, orientation: state.orientation },
  });
}

async function pick(id) {
  const d = deviceById(id);
  if (!d) return;
  state.deviceId = id;
  state.active = true;
  persist();
  await ensureInjected();
  // DNR header-strip + request UA must be in place before the frame loads.
  await configureTab(d.userAgent || "");
  await tabSend({ type: "rv-set", deviceId: id, zoom: state.zoom, orientation: state.orientation });
  renderList();
  reflectActive();
}

async function pushUpdate() {
  if (!state.active) return;
  await tabSend({
    type: "rv-set",
    deviceId: state.deviceId,
    zoom: state.zoom,
    orientation: state.orientation,
  });
}

function wire() {
  els.search.addEventListener("input", renderList);
  els.zoom.addEventListener("change", () => {
    state.zoom = els.zoom.value;
    persist();
    pushUpdate();
  });
  els.rotate.addEventListener("click", () => {
    state.orientation = state.orientation === "portrait" ? "landscape" : "portrait";
    persist();
    pushUpdate();
  });
  els.deactivate.addEventListener("click", async () => {
    await tabSend({ type: "rv-deactivate" });
    chrome.runtime.sendMessage({ type: "unconfigure", tabId });
    state.active = false;
    reflectActive();
    renderList();
  });
}

init();
