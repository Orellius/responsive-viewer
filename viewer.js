const el = (id) => document.getElementById(id);
const ui = {
  form: el("urlForm"),
  url: el("url"),
  device: el("device"),
  custom: el("customDims"),
  customW: el("customW"),
  customH: el("customH"),
  rotate: el("rotate"),
  zoom: el("zoom"),
  reload: el("reload"),
  dims: el("dimsLabel"),
  slot: el("deviceSlot"),
  scaler: el("deviceScaler"),
  bezel: el("bezel"),
  frame: el("frame"),
  stage: el("stage"),
};

const state = {
  url: "",
  deviceId: "iphone-14",
  orientation: "portrait",
  zoom: "fit",
  customW: 400,
  customH: 800,
};

// Embed mode: viewer.html is injected as a full-screen overlay iframe on a page
// and driven by the popup, instead of run as its own tab. The popup owns the
// DNR header-strip/UA, so we skip configure() here.
let EMBED = false;

function device() {
  return DEVICES.find((d) => d.id === state.deviceId) || DEVICES[0];
}

function baseDims() {
  const d = device();
  if (d.id === "custom") return { w: state.customW, h: state.customH };
  return { w: d.width, h: d.height };
}

function orientedDims() {
  const { w, h } = baseDims();
  return state.orientation === "landscape" ? { w: h, h: w } : { w, h };
}

function fitZoom(natW, natH) {
  if (state.zoom !== "fit") return parseFloat(state.zoom);
  const pad = 48; // stage padding both axes
  const availW = ui.stage.clientWidth - pad;
  const availH = ui.stage.clientHeight - pad;
  // Scale UP to fill the viewport (not capped at 100%), so the device is big on
  // any screen. Capped at 3x so it never gets absurd on huge monitors.
  return Math.max(0.2, Math.min(3, availW / natW, availH / natH));
}

function applyFrame() {
  const { w, h } = orientedDims();
  ui.bezel.dataset.frame = device().frame || "none";

  // Screen is the logical device size; the bezel adds padding around it.
  ui.frame.style.width = w + "px";
  ui.frame.style.height = h + "px";

  // Measure the bezel's natural (unscaled) footprint, then scale + size the slot.
  ui.scaler.style.transform = "none";
  const natW = ui.scaler.offsetWidth;
  const natH = ui.scaler.offsetHeight;
  const z = fitZoom(natW, natH);
  ui.scaler.style.transform = `scale(${z})`;
  ui.slot.style.width = Math.round(natW * z) + "px";
  ui.slot.style.height = Math.round(natH * z) + "px";

  ui.dims.textContent = `${w} × ${h}${z !== 1 ? ` · ${Math.round(z * 100)}%` : ""}`;
}

function normalizeUrl(raw) {
  const v = raw.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+/.test(v)) return "https://" + v;
  return "https://www.google.com/search?q=" + encodeURIComponent(v);
}

async function configure() {
  // Strip framing headers + set the device UA for THIS tab before the iframe
  // requests the target. Must complete first or the first load keeps XFO/CSP.
  try {
    await chrome.runtime.sendMessage({ type: "configure", userAgent: device().userAgent || "" });
  } catch (e) {
    console.warn("configure failed", e);
  }
}

// Profile consumed by emulate.js (in-page navigator/touch/DPR override). Passed
// through the iframe's window.name so emulate.js can scope itself to our frame.
function emulationProfile(d) {
  const ua = d.userAgent || "";
  const frame = d.frame || "none";
  const isPhone = frame === "android" || frame.indexOf("ios") === 0;
  const isTablet = frame === "tablet";
  const apple = /iPhone|iPad/.test(ua);
  const android = /Android/.test(ua);
  let platform = "";
  if (/iPhone/.test(ua)) platform = "iPhone";
  else if (/iPad/.test(ua)) platform = "iPad";
  else if (android) platform = "Linux armv8l";
  return {
    ua,
    platform,
    vendor: apple ? "Apple Computer, Inc." : android ? "Google Inc." : "",
    touch: isPhone || isTablet,
    maxTouchPoints: 5,
    dpr: d.dpr || 0,
    uaData: android, // Client Hints are a Chromium-only surface
    mobile: isPhone,
    uaPlatform: android ? "Android" : "",
  };
}

function frameName(d) {
  return "__rvsim__" + encodeURIComponent(JSON.stringify(emulationProfile(d)));
}

async function load() {
  if (!EMBED) await configure();
  const url = normalizeUrl(state.url);

  // Recreate the iframe each load: a fresh about:blank frame is same-origin, so
  // we can set window.name — emulate.js's transport — even after a previous
  // cross-origin page. (The iframe NAME ATTRIBUTE does not reach window.name.)
  const fresh = document.createElement("iframe");
  fresh.id = "frame";
  fresh.title = "preview";
  fresh.setAttribute("allow", "fullscreen");
  ui.bezel.replaceChild(fresh, ui.frame);
  ui.frame = fresh;
  applyFrame();

  if (url) {
    try {
      fresh.contentWindow.name = frameName(device());
    } catch (e) {
      console.warn("could not set frame name", e);
    }
    fresh.src = url;
  }
  save();
}

function save() {
  if (typeof chrome === "undefined" || !chrome.storage) return;
  chrome.storage.local.set({ state });
}

async function restore() {
  if (typeof chrome === "undefined" || !chrome.storage) return;
  const { state: saved } = await chrome.storage.local.get("state");
  if (saved) Object.assign(state, saved);
}

function buildDeviceOptions() {
  const groups = {};
  for (const d of DEVICES) (groups[d.brand] ||= []).push(d);
  ui.device.replaceChildren();
  for (const [group, items] of Object.entries(groups)) {
    const og = document.createElement("optgroup");
    og.label = group;
    for (const d of items) {
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent =
        d.id === "custom" ? d.name : `${d.name} — ${d.width}×${d.height}`;
      og.appendChild(o);
    }
    ui.device.appendChild(og);
  }
}

function syncControls() {
  ui.url.value = state.url;
  ui.device.value = state.deviceId;
  ui.zoom.value = state.zoom;
  ui.customW.value = state.customW;
  ui.customH.value = state.customH;
  ui.custom.classList.toggle("hidden", state.deviceId !== "custom");
}

function wire() {
  ui.form.addEventListener("submit", (e) => {
    e.preventDefault();
    state.url = ui.url.value;
    load();
  });

  ui.device.addEventListener("change", () => {
    state.deviceId = ui.device.value;
    ui.custom.classList.toggle("hidden", state.deviceId !== "custom");
    load();
  });

  ui.rotate.addEventListener("click", () => {
    state.orientation = state.orientation === "portrait" ? "landscape" : "portrait";
    applyFrame();
    save();
  });

  ui.zoom.addEventListener("change", () => {
    state.zoom = ui.zoom.value;
    applyFrame();
    save();
  });

  ui.reload.addEventListener("click", () => {
    if (ui.frame.src) ui.frame.src = ui.frame.src; // cross-origin: can't poke contentWindow
  });

  const onCustom = () => {
    state.customW = +ui.customW.value || 400;
    state.customH = +ui.customH.value || 800;
    applyFrame();
    save();
  };
  ui.customW.addEventListener("input", onCustom);
  ui.customH.addEventListener("input", onCustom);

  window.addEventListener("resize", () => {
    if (state.zoom === "fit") applyFrame();
  });
}

function setupEmbed(params) {
  EMBED = true;
  if (params.get("device")) state.deviceId = params.get("device");
  if (params.get("zoom")) state.zoom = params.get("zoom");
  if (params.get("orientation")) state.orientation = params.get("orientation");
  state.url = params.get("src") || "";
  document.body.classList.add("embed");
  const toolbar = document.querySelector(".toolbar");
  if (toolbar) toolbar.style.display = "none";

  const close = document.createElement("button");
  close.textContent = "✕ Return to normal";
  close.style.cssText =
    "position:fixed;top:14px;right:16px;z-index:10;padding:8px 14px;border-radius:10px;" +
    "border:1px solid rgba(255,93,108,.5);background:#15171c;color:#ff5d6c;cursor:pointer;font:600 13px system-ui";
  close.addEventListener("click", closeEmbed);
  document.body.appendChild(close);

  // The popup pushes device/zoom/orientation changes here while active.
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || d.type !== "rv-config") return;
    const deviceChanged = d.deviceId && d.deviceId !== state.deviceId;
    if (d.deviceId) state.deviceId = d.deviceId;
    if (d.zoom) state.zoom = d.zoom;
    if (d.orientation) state.orientation = d.orientation;
    syncControls();
    if (deviceChanged) load();
    else applyFrame();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeEmbed();
  });
}

function closeEmbed() {
  try {
    window.parent.postMessage({ type: "rv-close" }, "*");
  } catch (e) {}
}

(async function init() {
  buildDeviceOptions();
  const params = new URLSearchParams(location.search);
  if (params.get("embed") === "1") {
    setupEmbed(params);
  } else {
    await restore();
    const fromTab = params.get("src");
    if (fromTab) state.url = fromTab;
  }
  syncControls();
  wire();
  applyFrame();
  if (state.url) load();
  else if (!EMBED) ui.url.focus();
})();
