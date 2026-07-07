"""Serialize normalized Data Bridge rows to CSV and XLSX."""

from __future__ import annotations

import csv
import io
from typing import Any

from openpyxl import Workbook

EXPORT_COLUMNS: list[tuple[str, str]] = [
    ("streetAddress", "Street Address"),
    ("city", "City"),
    ("state", "State"),
    ("zip", "Zip"),
    ("violationIssueType", "Violation/Issue Type"),
    ("violationDate", "Violation Date"),
    ("descriptionNotes", "Description/Notes"),
    ("distressedSignalTag", "Distressed Signal Tag"),
    ("matchedIndicators", "Matched Indicators"),
    ("confidenceLevel", "Confidence Level"),
    ("sourceFile", "Source File"),
    ("uploadType", "Upload Type"),
    ("processedAt", "Processed At"),
]


def _export_row(row: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, label in EXPORT_COLUMNS:
        out[label] = str(row.get(key) or "").strip()
    return out


def rows_to_csv_bytes(rows: list[dict]) -> bytes:
    if not rows:
        raise ValueError("rows must not be empty")
    buffer = io.StringIO()
    labels = [label for _, label in EXPORT_COLUMNS]
    writer = csv.DictWriter(buffer, fieldnames=labels, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow(_export_row(row))
    return buffer.getvalue().encode("utf-8")


def rows_to_xlsx_bytes(rows: list[dict]) -> bytes:
    if not rows:
        raise ValueError("rows must not be empty")
    wb = Workbook()
    ws = wb.active
    ws.title = "Bridge Export"
    labels = [label for _, label in EXPORT_COLUMNS]
    ws.append(labels)
    for row in rows:
        exported = _export_row(row)
        ws.append([exported[label] for label in labels])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()