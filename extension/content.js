// content.js - Main content script for AI text detection

const MIN_WORDS = 30;        // Min words in a paragraph to analyze
const AUTO_SCAN_DELAY = 2000; // ms after page load before auto-scan
const HIGH_THRESHOLD = 0.75;  // Score >= this = high AI likelihood
const MED_THRESHOLD = 0.45;   // Score >= this = medium AI likelihood

let activePopup = null;
let scanInProgress = false;
let pageScanned = false;
let currentDomain = window.location.hostname;

// ── Utility ────────────────────────────────────────────────────────────────

function getDomain() {
  return window.location.hostname;
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function scoreToLabel(score) {
  if (score >= HIGH_THRESHOLD) return { label: "Likely AI", tier: "high" };
  if (score >= MED_THRESHOLD) return  { label: "Possibly AI", tier: "med" };
  return                               { label: "Likely Human", tier: "low" };
}

function scoreToColor(score) {
  if (score >= HIGH_THRESHOLD) return "#ef4444"; // red
  if (score >= MED_THRESHOLD) return "#f59e0b";  // amber
  return "#22c55e";                               // green
}

// ── Popup ──────────────────────────────────────────────────────────────────

function createPopup(analysisData, anchorEl, isManual = false) {
  removePopup();

  const { overall_score, overall_label, reasoning, sentences } = analysisData;
  const color = scoreToColor(overall_score);
  const pct = Math.round(overall_score * 100);

  const popup = document.createElement("div");
  popup.className = "aitd-popup";
  popup.setAttribute("data-aitd", "true");

  // Build sentence breakdown HTML
  let sentenceHTML = "";
  if (sentences && sentences.length > 0) {
    sentenceHTML = `
      <div class="aitd-popup-section">
        <div class="aitd-popup-section-title">Sentence Breakdown</div>
        <div class="aitd-sentences">
          ${sentences.map(s => `
            <div class="aitd-sentence-row">
              <span class="aitd-sentence-score" style="background:${scoreToColor(s.score)}">${Math.round(s.score * 100)}%</span>
              <span class="aitd-sentence-text">${escapeHtml(s.text.substring(0, 80))}${s.text.length > 80 ? "…" : ""}</span>
            </div>
          `).join("")}
        </div>
      </div>`;
  }

  popup.innerHTML = `
    <div class="aitd-popup-header">
      <span class="aitd-popup-icon">🤖</span>
      <span class="aitd-popup-title">AI Content Analysis</span>
      <button class="aitd-popup-close" title="Close">✕</button>
    </div>
    <div class="aitd-popup-score-row">
      <div class="aitd-popup-gauge">
        <svg viewBox="0 0 100 60" width="100" height="60">
          <path d="M10,50 A40,40 0 0,1 90,50" fill="none" stroke="#e5e7eb" stroke-width="10" stroke-linecap="round"/>
          <path d="M10,50 A40,40 0 0,1 90,50" fill="none" stroke="${color}" stroke-width="10"
            stroke-linecap="round"
            stroke-dasharray="${overall_score * 125.6} 125.6"/>
        </svg>
        <div class="aitd-gauge-pct" style="color:${color}">${pct}%</div>
      </div>
      <div class="aitd-popup-label-block">
        <div class="aitd-popup-label" style="color:${color}">${overall_label}</div>
        <div class="aitd-popup-sublabel">AI likelihood score</div>
      </div>
    </div>
    <div class="aitd-popup-section">
      <div class="aitd-popup-section-title">Analysis</div>
      <div class="aitd-popup-reasoning">${escapeHtml(reasoning)}</div>
    </div>
    ${sentenceHTML}
    <div class="aitd-popup-footer">${isManual ? "Manual selection" : "Auto-detected"}</div>
  `;

  document.body.appendChild(popup);

  // Position popup near anchor
  positionPopup(popup, anchorEl);

  // Close button
  popup.querySelector(".aitd-popup-close").addEventListener("click", removePopup);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("click", outsideClickHandler, { once: true });
  }, 100);

  activePopup = popup;
  return popup;
}

function positionPopup(popup, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;

  let top = rect.bottom + scrollY + 8;
  let left = rect.left + scrollX;

  // Keep within viewport
  const popupWidth = 340;
  if (left + popupWidth > window.innerWidth + scrollX) {
    left = window.innerWidth + scrollX - popupWidth - 16;
  }
  if (left < scrollX + 8) left = scrollX + 8;

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
}

function outsideClickHandler(e) {
  if (activePopup && !activePopup.contains(e.target)) {
    removePopup();
  }
}

function removePopup() {
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Highlighting ────────────────────────────────────────────────────────────

function highlightParagraph(el, analysisData) {
  const { overall_score } = analysisData;
  const color = scoreToColor(overall_score);
  const pct = Math.round(overall_score * 100);

  el.setAttribute("data-aitd-scored", "true");
  el.setAttribute("data-aitd-score", overall_score);
  el.style.setProperty("--aitd-color", color);

  // Add highlight wrapper
  el.classList.add("aitd-highlight");
  if (overall_score >= HIGH_THRESHOLD) el.classList.add("aitd-high");
  else if (overall_score >= MED_THRESHOLD) el.classList.add("aitd-med");
  else el.classList.add("aitd-low");

  // Score badge
  const badge = document.createElement("span");
  badge.className = "aitd-badge";
  badge.textContent = `${pct}%`;
  badge.style.background = color;
  badge.setAttribute("data-aitd", "true");
  el.style.position = "relative";
  el.appendChild(badge);

  // Hover → show popup
  el.addEventListener("mouseenter", () => {
    if (!activePopup) {
      createPopup(analysisData, el, false);
    }
  });
  el.addEventListener("mouseleave", (e) => {
    // Don't close if moving into popup
    if (activePopup && !activePopup.contains(e.relatedTarget)) {
      // Small delay so user can move to popup
      setTimeout(() => {
        if (activePopup && !activePopup.matches(":hover")) {
          removePopup();
        }
      }, 300);
    }
  });
}

// ── Auto-scan ───────────────────────────────────────────────────────────────

async function autoScanPage() {
  if (scanInProgress || pageScanned) return;

  // Check whitelist
  const listStatus = await browser.runtime.sendMessage({
    action: "checkWhitelist",
    domain: getDomain()
  });
  if (listStatus.whitelisted) return;

  scanInProgress = true;

  // Gather paragraphs worth analyzing
  const candidates = [];
  const tags = ["p", "article", "section", "div", "li", "blockquote"];
  const seen = new Set();

  for (const tag of tags) {
    for (const el of document.querySelectorAll(tag)) {
      // Skip nav, header, footer, aitd elements
      if (el.closest("nav, header, footer, aside, script, style, [data-aitd]")) continue;
      if (el.getAttribute("data-aitd-scored")) continue;

      const text = el.innerText || el.textContent || "";
      const trimmed = text.trim();

      if (wordCount(trimmed) < MIN_WORDS) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);

      // Skip if a parent was already added
      let parentAdded = false;
      for (const c of candidates) {
        if (c.el.contains(el) || el.contains(c.el)) { parentAdded = true; break; }
      }
      if (parentAdded) continue;

      candidates.push({ el, text: trimmed });
    }
  }

  // Analyze top N paragraphs (avoid spamming API)
  const MAX_AUTO = 20;
  const toAnalyze = candidates.slice(0, MAX_AUTO);

  let totalScore = 0;
  let analyzed = 0;

  for (const { el, text } of toAnalyze) {
    try {
      const result = await browser.runtime.sendMessage({
        action: "analyzeText",
        text,
        context: "auto"
      });
      if (result.success) {
        highlightParagraph(el, result.data);
        totalScore += result.data.overall_score;
        analyzed++;
      }
    } catch (e) {
      console.warn("[AITD] Analysis failed for paragraph:", e);
    }
  }

  if (analyzed > 0) {
    const avgScore = totalScore / analyzed;
    browser.runtime.sendMessage({
      action: "recordStat",
      domain: getDomain(),
      score: avgScore
    });
  }

  scanInProgress = false;
  pageScanned = true;
}

// ── Manual selection (from context menu) ───────────────────────────────────

async function analyzeSelection(text) {
  // Show loading indicator near cursor / selection
  const sel = window.getSelection();
  let anchorEl = document.body;
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    anchorEl = range.startContainer.parentElement || document.body;
  }

  // Show loading popup
  removePopup();
  const loadingPopup = document.createElement("div");
  loadingPopup.className = "aitd-popup aitd-loading";
  loadingPopup.setAttribute("data-aitd", "true");
  loadingPopup.innerHTML = `
    <div class="aitd-popup-header">
      <span class="aitd-popup-icon">🤖</span>
      <span class="aitd-popup-title">Analyzing…</span>
    </div>
    <div class="aitd-loading-bar"><div class="aitd-loading-fill"></div></div>
  `;
  document.body.appendChild(loadingPopup);
  positionPopup(loadingPopup, anchorEl);
  activePopup = loadingPopup;

  try {
    const result = await browser.runtime.sendMessage({
      action: "analyzeText",
      text,
      context: "manual"
    });
    removePopup();
    if (result.success) {
      createPopup(result.data, anchorEl, true);
      browser.runtime.sendMessage({
        action: "recordStat",
        domain: getDomain(),
        score: result.data.overall_score
      });
    } else {
      showError(anchorEl, result.error || "Analysis failed.");
    }
  } catch (e) {
    removePopup();
    showError(anchorEl, "Could not reach backend. Is the server running?");
  }
}

function showError(anchorEl, message) {
  removePopup();
  const errPopup = document.createElement("div");
  errPopup.className = "aitd-popup aitd-error-popup";
  errPopup.setAttribute("data-aitd", "true");
  errPopup.innerHTML = `
    <div class="aitd-popup-header">
      <span class="aitd-popup-icon">⚠️</span>
      <span class="aitd-popup-title">Error</span>
      <button class="aitd-popup-close">✕</button>
    </div>
    <div class="aitd-error-msg">${escapeHtml(message)}</div>
  `;
  document.body.appendChild(errPopup);
  positionPopup(errPopup, anchorEl);
  errPopup.querySelector(".aitd-popup-close").addEventListener("click", removePopup);
  activePopup = errPopup;
}

// ── Message listener ────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((message) => {
  if (message.action === "analyzeSelection") {
    analyzeSelection(message.text);
  }
  if (message.action === "triggerScan") {
    pageScanned = false;
    autoScanPage();
  }
});

// ── Init ────────────────────────────────────────────────────────────────────

setTimeout(autoScanPage, AUTO_SCAN_DELAY);
