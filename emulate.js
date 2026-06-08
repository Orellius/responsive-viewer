// Runs at document_start in the MAIN world of EVERY frame, but only acts on the
// simulator's iframe — which the viewer tags with a window.name marker before it
// navigates. This is what makes a site's in-page JavaScript actually believe it's
// on the selected device (navigator.userAgent / touch / devicePixelRatio checks),
// which a correctly-sized iframe alone cannot do. Normal browsing is untouched:
// any frame whose window.name doesn't carry the marker returns immediately.
(() => {
  const MARKER = "__rvsim__";
  if (typeof window.name !== "string" || window.name.indexOf(MARKER) !== 0) return;

  let p;
  try {
    p = JSON.parse(decodeURIComponent(window.name.slice(MARKER.length)));
  } catch (e) {
    return;
  }

  const def = (obj, prop, value) => {
    try {
      Object.defineProperty(obj, prop, { configurable: true, get: () => value });
    } catch (e) {}
  };

  if (p.ua) {
    def(navigator, "userAgent", p.ua);
    def(navigator, "appVersion", p.ua.replace(/^Mozilla\//, ""));
  }
  if (p.platform) def(navigator, "platform", p.platform);
  if (p.vendor != null) def(navigator, "vendor", p.vendor);

  if (p.touch) {
    def(navigator, "maxTouchPoints", p.maxTouchPoints || 5);
    if (!("ontouchstart" in window)) {
      try { window.ontouchstart = null; } catch (e) {}
    }
  }

  if (p.dpr) def(window, "devicePixelRatio", p.dpr);

  if (p.uaData) {
    const data = {
      mobile: !!p.mobile,
      platform: p.uaPlatform || "",
      brands: [],
      getHighEntropyValues: () =>
        Promise.resolve({ mobile: !!p.mobile, platform: p.uaPlatform || "" }),
      toJSON: () => ({ mobile: !!p.mobile, platform: p.uaPlatform || "" }),
    };
    def(navigator, "userAgentData", data);
  }
})();
