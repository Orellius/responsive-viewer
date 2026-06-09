<p align="center">
  <img src=".github/logo.svg" width="96" height="96" alt="responsive-viewer logo" />
</p>

# Responsive Viewer (Unlocked)

A local Brave/Chrome extension that previews the page you're on at any device
resolution — **in place**, no separate tab. Click the toolbar icon → a popup with
a searchable picker (168 devices) → the device frame overlays the current page →
"Return to normal" removes it. Every preset is free, plus custom W×H. No paywall.

## What it actually does

The "value" paid mobile-simulator extensions charge for is two things:

1. A list of device width×height presets (`devices.js` — edit it freely).
2. Stripping the headers that stop a site from loading in an `<iframe>`
   (`X-Frame-Options`, CSP `frame-ancestors`). That's `background.js`, ~20 lines,
   scoped to the viewer tab only so your normal browsing is untouched.

It loads the target URL in a correctly-sized iframe and emulates the device so
responsive sites reflow the way they do on a phone — both the CSS viewport (iframe
width) AND the in-page JS environment.

## Device emulation (the part that makes the *size* right)

A correctly-sized iframe gets CSS media-queries right, but any site that branches
its layout on `navigator.userAgent` / touch / `devicePixelRatio` in JavaScript
still thinks it's a desktop. `emulate.js` fixes that: it runs at `document_start`
in the page's MAIN world and overrides `navigator.userAgent`, `platform`,
`vendor`, `maxTouchPoints` (+ `ontouchstart`), `devicePixelRatio`, and
`navigator.userAgentData` to match the selected device.

Scoping: `viewer.js` recreates the iframe each load and stamps the device profile
onto the frame's `window.name` (set on the same-origin about:blank frame, which
survives the navigation — the iframe `name` *attribute* does **not** propagate).
`emulate.js` runs on every frame but returns immediately unless `window.name`
carries the `__rvsim__` marker, so your normal browsing is untouched.

## Load it (Brave or Chrome)

1. Open `brave://extensions` (or `chrome://extensions`).
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** → select this folder
   (`/Users/orelohayon/Desktop/Projects/responsive-viewer`).
4. Browse to any normal site, click the extension's toolbar icon → the **popup**
   opens.
5. Search/scroll the device list and click a device → the frame overlays the page
   in place. Use Rotate / Zoom in the popup. Click **✕ Return to normal** (or Esc)
   to dismiss.

After editing any file, hit the ↻ reload on the extension card (it's a popup +
content-script now, so just reopen the popup — no tab to refresh).

## Architecture (popup + in-place overlay)

- `popup.html/js/css` — toolbar popup: searchable device list (brand-grouped),
  zoom, rotate, Return-to-normal. Owns the picker so there's no giant dropdown.
- `overlay-inject.js` — content script (top frame). On the popup's signal it drops
  a full-screen iframe (the viewer in `?embed=1` mode) over the current page and
  tears it down on Return. The real page is never navigated, so dismissing is
  instant and lossless.
- `viewer.html/js/css` — the device frame + sizing/emulation, now rendered inside
  that overlay iframe. The framed page is a fresh load of the current URL (a CSS
  container can't trigger a site's width media-queries — only a real iframe
  viewport can), with the original untouched underneath.

## Known limits (honest)

- Emulation patches the JS-visible environment (UA, touch, DPR) but does not move
  the *visual* viewport the way Chrome DevTools device mode does (that needs the
  DevTools Protocol, which can't apply to one iframe inside our toolbar tab). For
  the vast majority of responsive sites, iframe-width + the JS overrides match a
  real device; DevTools-grade pixel emulation is the only thing beyond reach.
- `emulate.js` is a MAIN-world content script on `<all_urls>`/`all_frames` — it
  runs (and instantly returns) on every page you browse. Cheap, but it is broad
  injection; that's the cost of `document_start` timing.
- http-only sites may be blocked as mixed content (the viewer is https-context).

## Roadmap (parity with Web Mobile First)

- **HD screenshot** — `chrome.tabs.captureVisibleTab` then crop to the device's
  bounding box on a canvas. (Can't `drawImage` the cross-origin iframe directly —
  tab-capture + crop is the way.)
- **GIF recording** — repeated tab-capture frames encoded with a bundled gif
  encoder. Heavier; needs one vendored JS lib.
- **Side-by-side multi-device** — render N frames in a row, one configure rule
  per frame.

## Files

- `manifest.json` — MV3, `declarativeNetRequestWithHostAccess` + `<all_urls>`.
- `background.js` — opens the viewer, strips framing headers + sets request UA per tab.
- `emulate.js` — MAIN-world `document_start` script; overrides navigator/touch/DPR
  inside the framed page when tagged by the viewer.
- `devices.js` — the preset list: **168 devices across 15 brands** (Apple, Samsung
  incl. Z Fold/Flip in both folded + unfolded states, Google, OnePlus, Nothing,
  Xiaomi/Redmi/Poco, Motorola incl. razr, Oppo, Vivo, Honor, Asus), each with
  viewport + dpr + cutout, grouped by brand. Accuracy tiers documented in the file
  header. **This is the part you were paying for.**
- `viewer.html` / `viewer.css` / `viewer.js` — the toolbar + device frame UI.
