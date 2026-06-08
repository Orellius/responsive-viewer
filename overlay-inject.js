// Injected into the active tab on demand by the popup (chrome.scripting). Inert
// until the popup tells it to activate. It overlays a full-screen iframe (the
// viewer in embed mode) on top of the current page; the real page is never
// navigated, so "Return to normal" just removes the overlay and you're back.
//
// The popup re-injects on every use; this guard makes that a no-op so we never
// double-register the message listener.
(() => {
  if (window.__rvOverlayInit) return;
  window.__rvOverlayInit = true;

  const OVERLAY_ID = "__rv_overlay_frame__";
  let current = { deviceId: "", zoom: "fit", orientation: "portrait" };

  const overlay = () => document.getElementById(OVERLAY_ID);

  function ensureOverlay() {
    const existing = overlay();
    if (existing) return { el: existing, created: false };
    const el = document.createElement("iframe");
    el.id = OVERLAY_ID;
    el.setAttribute("allow", "fullscreen");
    el.style.cssText =
      "position:fixed;inset:0;width:100vw;height:100vh;border:0;margin:0;" +
      "z-index:2147483647;background:transparent;color-scheme:normal;display:block;";
    const q = new URLSearchParams({
      embed: "1",
      device: current.deviceId,
      zoom: current.zoom,
      orientation: current.orientation,
      src: location.href,
    });
    el.src = chrome.runtime.getURL("viewer.html") + "?" + q.toString();
    document.documentElement.appendChild(el);
    return { el, created: true };
  }

  function removeOverlay() {
    const el = overlay();
    if (el) el.remove();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "rv-status") {
      sendResponse({ active: !!overlay(), ...current });
      return;
    }
    if (msg.type === "rv-set") {
      current = {
        deviceId: msg.deviceId || "",
        zoom: msg.zoom || "fit",
        orientation: msg.orientation || "portrait",
      };
      const { el, created } = ensureOverlay();
      if (!created) {
        el.contentWindow.postMessage({ type: "rv-config", ...current }, "*");
      }
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === "rv-deactivate") {
      removeOverlay();
      sendResponse({ ok: true });
      return;
    }
  });

  // The embed viewer's ✕ button (or Esc) asks its parent to close the overlay.
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "rv-close") removeOverlay();
  });
})();
