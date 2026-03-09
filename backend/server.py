"""
server.py – AI Text Detector backend
Flask server that receives text from the Firefox extension,
calls local Ollama/Mistral for analysis, and manages stats/lists in SQLite.

Requirements:
    pip install flask flask-cors

Usage:
    ollama pull mistral:7b
"""

import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from analyzer import analyze_text
from database import Database

app = Flask(__name__)
CORS(app, origins=["moz-extension://*", "http://localhost:*"])

db = Database("detector.db")


# ── Health ──────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    from analyzer import check_ollama
    ollama_ok, msg = check_ollama()
    return jsonify({
        "status": "ok",
        "ollama": ollama_ok,
        "ollama_message": msg
    })


# ── Analysis ─────────────────────────────────────────────────────────────────

@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json()
    print(f"[AITD] Received: {data}")
    if not data or "text" not in data:
        return jsonify({"error": "Missing 'text' field"}), 400

    text = data["text"].strip()
    if len(text) < 20:
        return jsonify({"error": "Text too short to analyze"}), 400
    if len(text) > 15000:
        text = text[:15000]  # Truncate to avoid huge API calls

    context = data.get("context", "auto")  # "auto" or "manual"

    try:
        result = analyze_text(text, context)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        app.logger.error(f"Analysis error: {e}")
        return jsonify({"error": "Analysis failed. Check your API key and try again."}), 500


# ── Stats ─────────────────────────────────────────────────────────────────────

@app.route("/stats/record", methods=["POST"])
def record_stat():
    data = request.get_json()
    domain = data.get("domain", "").strip()
    score = float(data.get("score", 0))
    if not domain:
        return jsonify({"error": "Missing domain"}), 400
    db.record_scan(domain, score)
    return jsonify({"ok": True})


@app.route("/stats", methods=["GET"])
def get_stats():
    domain = request.args.get("domain", "").strip()
    if not domain:
        return jsonify({"error": "Missing domain"}), 400
    stats = db.get_domain_stats(domain)
    return jsonify(stats)


@app.route("/stats", methods=["DELETE"])
def clear_domain_stats():
    domain = request.args.get("domain", "").strip()
    if not domain:
        return jsonify({"error": "Missing domain"}), 400
    db.clear_domain(domain)
    return jsonify({"ok": True})


@app.route("/stats/history", methods=["GET"])
def get_history():
    limit = int(request.args.get("limit", 20))
    history = db.get_history(limit)
    return jsonify(history)


@app.route("/stats/all", methods=["DELETE"])
def clear_all_stats():
    db.clear_all_stats()
    return jsonify({"ok": True})


# ── Lists ─────────────────────────────────────────────────────────────────────

@app.route("/list", methods=["GET"])
def get_lists():
    return jsonify({
        "whitelist": db.get_list("whitelist"),
        "blacklist": db.get_list("blacklist")
    })


@app.route("/list/check", methods=["GET"])
def check_list():
    domain = request.args.get("domain", "").strip()
    return jsonify({
        "whitelisted": db.domain_in_list(domain, "whitelist"),
        "blacklisted":  db.domain_in_list(domain, "blacklist")
    })


@app.route("/list", methods=["POST"])
def add_to_list():
    data = request.get_json()
    domain = data.get("domain", "").strip()
    list_type = data.get("type", "")
    if not domain or list_type not in ("whitelist", "blacklist"):
        return jsonify({"error": "Invalid domain or type"}), 400
    db.add_to_list(domain, list_type)
    return jsonify({"ok": True})


@app.route("/list", methods=["DELETE"])
def remove_from_list():
    data = request.get_json()
    domain = data.get("domain", "").strip()
    list_type = data.get("type", "")
    if not domain or list_type not in ("whitelist", "blacklist"):
        return jsonify({"error": "Invalid domain or type"}), 400
    db.remove_from_list(domain, list_type)
    return jsonify({"ok": True})


# ── Run ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    from analyzer import check_ollama
    ollama_ok, msg = check_ollama()
    if ollama_ok:
        print("✅ Ollama is running and mistral:7b is available")
    else:
        print(f"\n⚠️  WARNING: {msg}\n")
    print("🚀 AI Text Detector backend running on http://localhost:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
