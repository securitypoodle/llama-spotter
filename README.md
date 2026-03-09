# <img width="50" height="50" alt="llama-spotter-icon" src="https://github.com/user-attachments/assets/13f99ca1-6e71-4707-a9cf-fdf234ff3aa1" /> Llama Spotter

> A Firefox extension that detects AI-generated text on any webpage — fully local, free, and private.

Llama Spotter analyzes web page text and estimates the likelihood it was written by an AI model (ChatGPT, Gemini, Copilot, etc.). All inference runs on your own machine using **Mistral 7b via Ollama** — no API keys, no subscriptions, no data leaving your device.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Firefox](https://img.shields.io/badge/Browser-Firefox-orange.svg)
![Python](https://img.shields.io/badge/Python-3.10+-green.svg)
![Ollama](https://img.shields.io/badge/LLM-Mistral%207b-purple.svg)

---

## Features

- 🔍 **Auto-scan** — Automatically analyzes paragraphs when you visit a page
- 🖱️ **Right-click analysis** — Highlight any text, right-click, and analyze on demand
- 🎨 **Color-coded highlights** — Paragraphs highlighted directly on the page
  - 🔴 Red: Likely AI (75%+)
  - 🟡 Amber: Possibly AI (45–74%)
  - 🟢 Green: Likely Human (0–44%)
- 💬 **Hover popups** — Hover over highlights for score, reasoning, and sentence breakdown
- 📊 **Dashboard** — Toolbar popup with per-site stats and scan history
- 🚫 **Whitelist / Blacklist** — Skip trusted domains or always-flag specific ones
- 🔒 **100% local** — Inference runs on your GPU via Ollama, nothing is sent externally

<img width="1632" height="1168" alt="image" src="https://github.com/user-attachments/assets/8ae2e840-dc1e-4c5a-91d1-6d21a1c29f29" />

<img width="1397" height="1138" alt="image" src="https://github.com/user-attachments/assets/6b0352c4-718d-4410-8122-0a0eb8edc141" />


---

## Requirements

- Firefox 109+
- Python 3.10+
- [Ollama](https://ollama.com) with `mistral:7b` pulled (~4.1GB)
- Nvidia GPU recommended (CPU works but is slower)

---

## Installation

### 1. Install Ollama & pull the model
```bash
# Linux
curl -fsSL https://ollama.com/install.sh | sh

# macOS / Windows: download from https://ollama.com

# Pull the model (~4.1GB)
ollama pull mistral:7b

# Verify it's ready
ollama list
```

### 2. Start the Python backend
```bash
cd backend
pip install -r requirements.txt
python server.py
```

The backend runs on `http://localhost:5000`. Keep this terminal open while browsing.

### 3. Load the Firefox extension

1. Open Firefox and navigate to `about:debugging`
2. Click **"This Firefox"** in the left sidebar
3. Click **"Load Temporary Add-on…"**
4. Select `extension/manifest.json` from this repo
5. The Llama Spotter icon will appear in your toolbar

> **Note:** Temporary add-ons are removed on Firefox restart. Re-load via `about:debugging` after each restart, or follow [Mozilla's guide](https://extensionworkshop.com/documentation/publish/) to self-sign for permanent installation.

---

## Usage

### Auto-scan
Navigate to any page and wait ~2 seconds. Paragraphs with enough text are automatically analyzed and highlighted. Hover over any highlight to see the full analysis popup.

### Manual selection
1. Highlight any text on a page
2. Right-click → **"🤖 Analyze for AI content"**
3. A loading indicator appears while the model runs, then the popup displays results

### Dashboard
Click the toolbar icon to open the dashboard:
- **Overview** — Average AI score for the current site, scan count, high-risk paragraph count, and a rescan button
- **History** — AI scores across all recently visited domains
- **Lists** — Add domains to the whitelist (skip analysis) or blacklist (always flag)

---

## Configuration

Tune behavior by editing the constants at the top of `extension/content.js`:
```js
const MIN_WORDS = 30;         // Minimum words required to analyze a paragraph
const AUTO_SCAN_DELAY = 2000; // Milliseconds to wait after page load before scanning
const HIGH_THRESHOLD = 0.75;  // Score >= this = "Likely AI" (red)
const MED_THRESHOLD = 0.45;   // Score >= this = "Possibly AI" (amber)
const MAX_AUTO = 20;          // Max paragraphs to auto-analyze per page
```

To use a different Ollama model, change the `MODEL` constant in `backend/analyzer.py`:
```python
MODEL = "mistral:7b"  # swap for e.g. "llama3.1:8b" or "gemma2:9b"
```

---

## Project Structure
```
llama-spotter/
├── extension/                  ← Firefox extension (load this in about:debugging)
│   ├── manifest.json
│   ├── background.js           ← Context menu + message routing
│   ├── content.js              ← Page scanning, highlighting, and popups
│   ├── styles.css              ← Injected styles for highlights and popups
│   ├── popup.html              ← Toolbar dashboard UI
│   ├── popup.js                ← Dashboard logic
│   └── icons/                  ← Extension icons
└── backend/                    ← Local Python server
    ├── server.py               ← Flask REST API
    ├── analyzer.py             ← Ollama/Mistral integration
    ├── database.py             ← SQLite scan history + domain lists
    └── requirements.txt
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check + Ollama status |
| `POST` | `/analyze` | Analyze text `{ text, context }` |
| `POST` | `/stats/record` | Record a scan `{ domain, score }` |
| `GET` | `/stats?domain=` | Get stats for a domain |
| `DELETE` | `/stats?domain=` | Clear stats for a domain |
| `GET` | `/stats/history` | Scan history across all domains |
| `DELETE` | `/stats/all` | Clear all scan history |
| `GET` | `/list` | Get whitelist and blacklist |
| `GET` | `/list/check?domain=` | Check if a domain is listed |
| `POST` | `/list` | Add domain `{ domain, type }` |
| `DELETE` | `/list` | Remove domain `{ domain, type }` |

---

## Performance

Tested on Nvidia GPU with CUDA:

| | Time |
|---|---|
| First request (model loading) | 5–15s |
| Subsequent requests | 2–6s per paragraph |

VRAM usage: ~5GB for `mistral:7b`. CPU-only inference works but expect 30–90s per paragraph.

---

## Troubleshooting

**"Backend offline" in the popup**
→ Start the Flask server: `python backend/server.py`

**"Ollama is not running"**
→ Run `ollama serve` in a terminal. On Linux it should start automatically after install.

**"Model not found"**
→ Run `ollama pull mistral:7b` and wait for the download to complete.

**Analysis is slow on first request**
→ Normal — the model is loading into VRAM. Subsequent requests on the same session are fast.

**Extension not analyzing pages**
→ Check the background script console at `about:debugging` → Inspect for errors.
→ Content scripts are blocked on Firefox internal pages (`about:*`, `moz-extension:*`, etc.).

**Firefox blocking localhost requests**
→ Go to `about:config` and set `network.proxy.allow_hijacking_localhost` to `true`.

---

# Database (contains personal browsing data)
backend/detector.db
