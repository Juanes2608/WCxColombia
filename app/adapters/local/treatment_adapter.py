"""
ITreatmentRepository backed by lawyer-data/treatments.csv.

Used when Neo4j is not configured (local dev / demo without cloud).
"""
from __future__ import annotations

import csv
import logging
import re
from collections import defaultdict
from pathlib import Path

from app.ports.treatment import ITreatmentRepository, TreatmentHistory

logger = logging.getLogger("traceit.local_treatment")


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _load_treatments(path: Path) -> dict[str, TreatmentHistory]:
    """
    Returns {node_id: TreatmentHistory} built from treatments.csv.
    A case is OVERRULED if it appears in any OVERRULES row as case_to.
    A case is DISTINGUISHED if it appears only in DISTINGUISHES rows.
    """
    overruled_by: dict[str, list[dict]]    = defaultdict(list)
    distinguished_by: dict[str, list[dict]] = defaultdict(list)

    try:
        with path.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                from_name = row.get("case_from_short_name", "").strip()
                to_name   = row.get("case_to_short_name", "").strip()
                treatment = row.get("treatment", "").strip().upper()
                if not from_name or not to_name or treatment not in {"OVERRULES", "DISTINGUISHES"}:
                    continue
                to_id = _slug(to_name)
                edge = {
                    "citing_case": from_name,
                    "year": int(row.get("year", "0") or 0),
                    "court": row.get("court", "").strip(),
                    "context": row.get("context", "").strip(),
                }
                if treatment == "OVERRULES":
                    overruled_by[to_id].append(edge)
                else:
                    distinguished_by[to_id].append(edge)
    except FileNotFoundError:
        logger.warning("treatments.csv not found — all treatment history unknown")

    histories: dict[str, TreatmentHistory] = {}
    all_ids = set(overruled_by) | set(distinguished_by)
    for node_id in all_ids:
        ov = overruled_by.get(node_id, [])
        di = distinguished_by.get(node_id, [])
        if ov:
            verdict = "OVERRULED"
        elif di:
            verdict = "DISTINGUISHED"
        else:
            verdict = "GOOD_LAW"
        histories[node_id] = TreatmentHistory(
            verdict=verdict,
            overruled_by=ov,
            distinguished_by=di,
            source="csv",
        )
    return histories


class LocalTreatmentAdapter(ITreatmentRepository):
    """Reads treatment history from treatments.csv. No network required."""

    def __init__(self, lawyer_data_dir: Path | None = None) -> None:
        from app.adapters.local.corpus_adapter import _find_lawyer_data
        data_dir = lawyer_data_dir or _find_lawyer_data()
        self._histories = _load_treatments(data_dir / "treatments.csv")

    def get_history(self, node_id: str) -> TreatmentHistory:
        return self._histories.get(
            node_id, TreatmentHistory(verdict="GOOD_LAW", source="csv_no_entry")
        )
