"""
database.py – SQLite database for AI Text Detector

Tables:
    scans        – per-domain scan history with scores
    domain_lists – whitelist / blacklist entries
"""

import sqlite3
import threading
from datetime import datetime


class Database:
    def __init__(self, db_path: str = "detector.db"):
        self.db_path = db_path
        self._local = threading.local()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        """Thread-local connection."""
        if not hasattr(self._local, "conn") or self._local.conn is None:
            self._local.conn = sqlite3.connect(self.db_path, check_same_thread=False)
            self._local.conn.row_factory = sqlite3.Row
        return self._local.conn

    def _init_db(self):
        conn = self._conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS scans (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                domain    TEXT NOT NULL,
                score     REAL NOT NULL CHECK(score >= 0 AND score <= 1),
                scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_scans_domain ON scans(domain);

            CREATE TABLE IF NOT EXISTS domain_lists (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                domain     TEXT NOT NULL,
                list_type  TEXT NOT NULL CHECK(list_type IN ('whitelist','blacklist')),
                added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(domain, list_type)
            );
        """)
        conn.commit()

    # ── Scans ─────────────────────────────────────────────────────────────────

    def record_scan(self, domain: str, score: float):
        conn = self._conn()
        conn.execute(
            "INSERT INTO scans (domain, score) VALUES (?, ?)",
            (domain, round(score, 4))
        )
        conn.commit()

    def get_domain_stats(self, domain: str) -> dict:
        conn = self._conn()
        row = conn.execute("""
            SELECT
                COUNT(*)          AS count,
                AVG(score)        AS avg_score,
                MAX(score)        AS max_score,
                MIN(score)        AS min_score,
                SUM(CASE WHEN score >= 0.75 THEN 1 ELSE 0 END) AS high_risk_count,
                MAX(scanned_at)   AS last_scanned
            FROM scans
            WHERE domain = ?
        """, (domain,)).fetchone()

        if not row or row["count"] == 0:
            return {"domain": domain, "count": 0, "avg_score": None}

        return {
            "domain": domain,
            "count":           row["count"],
            "avg_score":       round(row["avg_score"], 3),
            "max_score":       round(row["max_score"], 3),
            "min_score":       round(row["min_score"], 3),
            "high_risk_count": row["high_risk_count"],
            "last_scanned":    row["last_scanned"]
        }

    def get_history(self, limit: int = 20) -> list[dict]:
        conn = self._conn()
        rows = conn.execute("""
            SELECT
                domain,
                COUNT(*)    AS count,
                AVG(score)  AS avg_score,
                MAX(scanned_at) AS last_scanned
            FROM scans
            GROUP BY domain
            ORDER BY last_scanned DESC
            LIMIT ?
        """, (limit,)).fetchall()

        return [
            {
                "domain":       r["domain"],
                "count":        r["count"],
                "avg_score":    round(r["avg_score"], 3),
                "last_scanned": r["last_scanned"]
            }
            for r in rows
        ]

    def clear_domain(self, domain: str):
        conn = self._conn()
        conn.execute("DELETE FROM scans WHERE domain = ?", (domain,))
        conn.commit()

    def clear_all_stats(self):
        conn = self._conn()
        conn.execute("DELETE FROM scans")
        conn.commit()

    # ── Lists ──────────────────────────────────────────────────────────────────

    def get_list(self, list_type: str) -> list[str]:
        conn = self._conn()
        rows = conn.execute(
            "SELECT domain FROM domain_lists WHERE list_type = ? ORDER BY domain",
            (list_type,)
        ).fetchall()
        return [r["domain"] for r in rows]

    def domain_in_list(self, domain: str, list_type: str) -> bool:
        conn = self._conn()
        row = conn.execute(
            "SELECT 1 FROM domain_lists WHERE domain = ? AND list_type = ?",
            (domain, list_type)
        ).fetchone()
        return row is not None

    def add_to_list(self, domain: str, list_type: str):
        conn = self._conn()
        conn.execute(
            "INSERT OR IGNORE INTO domain_lists (domain, list_type) VALUES (?, ?)",
            (domain, list_type)
        )
        conn.commit()

    def remove_from_list(self, domain: str, list_type: str):
        conn = self._conn()
        conn.execute(
            "DELETE FROM domain_lists WHERE domain = ? AND list_type = ?",
            (domain, list_type)
        )
        conn.commit()
