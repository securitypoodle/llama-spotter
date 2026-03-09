// background.js - Handles context menus and message routing

const BACKEND_URL = "http://localhost:5000";

// Create context menu item
browser.contextMenus.create({
  id: "analyze-selection",
  title: "🤖 Analyze for AI content",
  contexts: ["selection"]
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyze-selection") {
    const selectedText = info.selectionText;
    browser.tabs.sendMessage(tab.id, {
      action: "analyzeSelection",
      text: selectedText
    });
  }
});

// Route analysis requests from content script to backend
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "analyzeText") {
    analyzeText(message.text, message.context)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === "checkWhitelist") {
    checkWhitelist(message.domain)
      .then(result => sendResponse(result))
      .catch(() => sendResponse({ whitelisted: false, blacklisted: false }));
    return true;
  }

  if (message.action === "recordStat") {
    recordStat(message.domain, message.score);
    return false;
  }

  if (message.action === "getStats") {
    getStats(message.domain)
      .then(stats => sendResponse(stats))
      .catch(() => sendResponse(null));
    return true;
  }
});

async function analyzeText(text, context = "auto") {
  console.log("[AITD] Sending to backend:", { length: text.length, preview: text.slice(0, 80) });
  const response = await fetch(`${BACKEND_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, context })
  });
  if (!response.ok) throw new Error(`Backend error: ${response.status}`);
  return response.json();
}

async function checkWhitelist(domain) {
  const response = await fetch(`${BACKEND_URL}/list/check?domain=${encodeURIComponent(domain)}`);
  if (!response.ok) return { whitelisted: false, blacklisted: false };
  return response.json();
}

async function recordStat(domain, score) {
  fetch(`${BACKEND_URL}/stats/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, score })
  }).catch(() => {});
}

async function getStats(domain) {
  const response = await fetch(`${BACKEND_URL}/stats?domain=${encodeURIComponent(domain)}`);
  if (!response.ok) return null;
  return response.json();
}
