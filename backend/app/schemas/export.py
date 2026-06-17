"""Export schemas (CLAUDE.md Sections 8, 9).

A review's comments can be exported as CSV or PDF — a Pro-only feature. The
only request input is the format, modelled as an enum so FastAPI rejects
anything else with a 422 before the handler runs.
"""

from __future__ import annotations

from enum import Enum


class ExportFormat(str, Enum):
    csv = "csv"
    pdf = "pdf"
