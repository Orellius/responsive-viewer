// Service worker. Per active tab, strip the response headers that block iframing
// (X-Frame-Options, CSP frame-ancestors) and set a device User-Agent, so the
// in-place overlay's iframe can load the page. The overlay iframe lives inside
// the same tab the user is on, so we scope the rule to that tab.
//
// Why per-tab session rules: tabIds conditions are only valid on session rules,
// and scoping to the tab means we never touch your normal browsing.
// resourceTypes:["sub_frame"] means we only rewrite the framed site's request.

const FRAMING_HEADERS = [
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // tabId comes explicitly from the popup (where sender.tab is absent) or from
  // the sending tab otherwise.
  const tabId = msg.tabId ?? sender.tab?.id;
  if (tabId == null) return;

  if (msg.type === "configure") {
    configureTab(tabId, msg.userAgent).then(() => sendResponse({ ok: true }));
    return true; // async reply
  }
  if (msg.type === "unconfigure") {
    chrome.declarativeNetRequest
      .updateSessionRules({ removeRuleIds: [tabId] })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function configureTab(tabId, userAgent) {
  const responseHeaders = FRAMING_HEADERS.map((header) => ({
    header,
    operation: "remove",
  }));

  const action = { type: "modifyHeaders", responseHeaders };
  if (userAgent) {
    action.requestHeaders = [
      { header: "user-agent", operation: "set", value: userAgent },
    ];
  }

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [tabId],
    addRules: [
      {
        id: tabId, // one rule per viewer tab, keyed by tab id
        priority: 1,
        action,
        condition: { tabIds: [tabId], resourceTypes: ["sub_frame"] },
      },
    ],
  });
}

// Clean up the tab's rule when it closes.
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] });
});
