// popup.js - Toolbar popup logic

const BACKEND = "http://localhost:5000";

let currentDomain = "";

// ── Tabs ────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function scoreToColor(score) {
  if (score >= 0.75) return "#ef4444";
  if (score >= 0.45) return "#f59e0b";
  return "#22c55e";
}
function scoreToLabel(score) {
  if (score >= 0.75) return "Likely AI";
  if (score >= 0.45) return "Possibly AI";
  return "Likely Human";
}

async function checkBackend() {
  try {
    const r = await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  // Get active tab domain
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    try {
      currentDomain = new URL(tab.url).hostname;
    } catch { currentDomain = "unknown"; }
  }
  document.getElementById("currentDomain").textContent = currentDomain;

  // Check backend health
  const online = await checkBackend();
  const dot = document.getElementById("statusDot");
  const warn = document.getElementById("serverWarning");
  if (online) {
    dot.classList.add("online");
    warn.style.display = "none";
  } else {
    dot.classList.add("offline");
    warn.style.display = "block";
  }

  // Load overview stats
  loadSiteStats();

  // Load history
  loadHistory();

  // Load lists
  loadLists();
}

async function loadSiteStats() {
  try {
    const r = await fetch(`${BACKEND}/stats?domain=${encodeURIComponent(currentDomain)}`);
    if (!r.ok) return;
    const data = await r.json();
    if (!data || data.count === 0) return;

    const score = data.avg_score;
    const color = scoreToColor(score);
    const pct = Math.round(score * 100);

    document.getElementById("gaugePct").textContent = `${pct}%`;
    document.getElementById("gaugePct").style.color = color;
    document.getElementById("gaugeFill").setAttribute("stroke", color);
    document.getElementById("gaugeFill").setAttribute("stroke-dasharray", `${score * 125.6} 125.6`);
    document.getElementById("siteVerdict").textContent = scoreToLabel(score);
    document.getElementById("siteVerdict").style.color = color;
    document.getElementById("statScans").textContent = data.count;
    document.getElementById("statHighRisk").textContent = data.high_risk_count || 0;
  } catch {}
}

async function loadHistory() {
  try {
    const r = await fetch(`${BACKEND}/stats/history`);
    if (!r.ok) return;
    const data = await r.json();
    const container = document.getElementById("scanHistory");
    if (!data.length) {
      container.innerHTML = '<div class="empty-state">No scan history yet</div>';
      return;
    }
    container.innerHTML = data.map(item => {
      const color = scoreToColor(item.avg_score);
      const pct = Math.round(item.avg_score * 100);
      return `
        <div class="scan-row">
          <span class="scan-domain" title="${item.domain}">${item.domain}</span>
          <span class="scan-score" style="color:${color}">${pct}%</span>
        </div>`;
    }).join("");
  } catch {}
}

async function loadLists() {
  try {
    const r = await fetch(`${BACKEND}/list`);
    if (!r.ok) return;
    const data = await r.json();

    renderList("whitelistItems", data.whitelist || [], "whitelist");
    renderList("blacklistItems", data.blacklist || [], "blacklist");
  } catch {}
}

function renderList(containerId, items, type) {
  const el = document.getElementById(containerId);
  if (!items.length) {
    el.innerHTML = `<div class="empty-state">No ${type === "whitelist" ? "whitelisted" : "blacklisted"} domains</div>`;
    return;
  }
  const tagClass = type === "whitelist" ? "tag-white" : "tag-black";
  const tagText  = type === "whitelist" ? "ALLOW" : "BLOCK";
  el.innerHTML = items.map(domain => `
    <div class="domain-item">
      <span>${domain}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="tag ${tagClass}">${tagText}</span>
        <button class="remove" data-domain="${domain}" data-type="${type}">✕</button>
      </div>
    </div>
  `).join("");

  el.querySelectorAll(".remove").forEach(btn => {
    btn.addEventListener("click", async () => {
      await removeDomain(btn.dataset.domain, btn.dataset.type);
      loadLists();
    });
  });
}

async function removeDomain(domain, type) {
  await fetch(`${BACKEND}/list`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, type })
  });
}

// ── Button handlers ──────────────────────────────────────────────────────────

document.getElementById("btnRescan").addEventListener("click", async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    browser.tabs.sendMessage(tab.id, { action: "triggerScan" });
    window.close();
  }
});

document.getElementById("btnClearSite").addEventListener("click", async () => {
  await fetch(`${BACKEND}/stats?domain=${encodeURIComponent(currentDomain)}`, { method: "DELETE" });
  loadSiteStats();
});

document.getElementById("btnClearAll").addEventListener("click", async () => {
  await fetch(`${BACKEND}/stats/all`, { method: "DELETE" });
  loadHistory();
});

document.getElementById("btnAddList").addEventListener("click", async () => {
  const domain = document.getElementById("listDomainInput").value.trim();
  const type = document.getElementById("listTypeSelect").value;
  if (!domain) return;
  await fetch(`${BACKEND}/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, type })
  });
  document.getElementById("listDomainInput").value = "";
  loadLists();
});

init();
