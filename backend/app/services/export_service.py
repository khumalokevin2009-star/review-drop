"""Comment export rendering — CSV + PDF (CLAUDE.md Sections 8, 9).

Pure, database-free helpers so the file generation can be unit-tested without a
DB: the route layer flattens ORM rows into :class:`CommentRecord` values and
hands them here.

Scope & ordering (matches the canvas comment list exactly):
* Only TOP-LEVEL comments are exported — these are the numbered pins the
  designer sees in the sidebar; replies live inside a thread and carry no pin
  number. The route filters ``parent_id IS NULL`` before building records.
* Pins are numbered PER PAGE by creation order, mirroring the frontend's
  ``numberCommentsForPage`` (``frontend/src/components/canvas/pins.ts``): the
  page URL is normalised (lowercased host/scheme, fragment + trailing slash
  dropped) and each page's comments are numbered 1..N by ``created_at``. Pages
  are emitted in first-comment order so the document reads chronologically.

PDF uses reportlab only (pure-Python, no system libraries — works in our Docker
image; weasyprint and friends are deliberately avoided). It is text-based and
print-friendly (light background); screenshots are intentionally out of scope
for v1.
"""

from __future__ import annotations

import csv
import io
import os
import re
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import urlsplit, urlunsplit
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)

# --- Unicode font (best effort) ---------------------------------------------
# reportlab's built-in Helvetica is Latin-1 only, so CJK/Cyrillic/Arabic/emoji
# in a comment body or guest name would silently render as blanks (reportlab
# substitutes .notdef rather than raising). Register a Unicode TrueType font if
# one is present on the host — DejaVu/Noto ship in our Debian image, Arial
# Unicode on macOS dev — and fall back to Helvetica otherwise (never crashes;
# at worst non-Latin text is dropped, exactly as before). Bundling a TTF would
# remove the host dependency and is the natural future hardening.
_REGULAR_FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
)
_BOLD_FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
)


def _register_unicode_fonts() -> tuple[str, str]:
    """Return ``(regular, bold)`` PDF font names, preferring a registered Unicode
    TTF over the Latin-1-only Helvetica when one is available on the host."""
    regular, bold = "Helvetica", "Helvetica-Bold"
    for path in _REGULAR_FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("OrvelleSans", path))
                regular = "OrvelleSans"
                break
            except Exception:  # noqa: BLE001 - a locked/corrupt font just falls back
                continue
    for path in _BOLD_FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("OrvelleSans-Bold", path))
                bold = "OrvelleSans-Bold"
                break
            except Exception:  # noqa: BLE001
                continue
    # Unicode regular but no Unicode bold (e.g. Arial Unicode on macOS): prefer
    # coverage over weight so a non-Latin heading still renders.
    if regular == "OrvelleSans" and bold == "Helvetica-Bold":
        bold = "OrvelleSans"
    return regular, bold


_BODY_FONT, _BOLD_FONT = _register_unicode_fonts()

# Cells whose value starts with one of these are treated as a formula by
# Excel/Sheets/Numbers — neutralise them to prevent CSV/formula injection.
_CSV_INJECTION_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


# --- palette (CLAUDE.md Section 10, tuned for print on white) ----------------

_INK = colors.HexColor("#18181B")
_MUTED = colors.HexColor("#71717A")
_FAINT = colors.HexColor("#A1A1AA")
_HAIRLINE = colors.HexColor("#E4E4E7")
_BRAND = colors.HexColor("#6366F1")
_STATUS_COLORS = {
    "open": colors.HexColor("#DC2626"),
    "in_progress": colors.HexColor("#B45309"),
    "resolved": colors.HexColor("#15803D"),
}
_STATUS_LABELS = {
    "open": "Open",
    "in_progress": "In progress",
    "resolved": "Resolved",
}

CSV_HEADER = [
    "Number",
    "Status",
    "Author",
    "Author type",
    "Comment",
    "Region",
    "Page URL",
    "Created (ISO)",
]


# --- input + intermediate shapes --------------------------------------------


@dataclass(frozen=True)
class CommentRecord:
    """A single top-level comment, flattened from the ORM by the route."""

    page_url: str
    status: str  # 'open' | 'in_progress' | 'resolved'
    author_name: str
    author_type: str  # 'designer' | 'client'
    body: str
    region_width: float | None
    region_height: float | None
    created_at: datetime


@dataclass(frozen=True)
class NumberedRecord:
    number: int  # per-page pin number, as shown in the canvas
    record: CommentRecord


@dataclass(frozen=True)
class PageGroup:
    page_url: str  # the first original (un-normalised) URL seen for this page
    rows: tuple[NumberedRecord, ...]


# --- grouping / numbering ----------------------------------------------------


def normalize_page_url(url: str) -> str:
    """Mirror the frontend's ``normalizePageUrl``: drop the fragment and a
    trailing slash, lowercasing scheme/host, so two spellings of the same page
    group (and number) together. Falls back to the raw string if unparseable."""
    try:
        parts = urlsplit(url.strip())
        scheme = parts.scheme.lower()
        netloc = parts.netloc.lower()
        # Drop the default port so http://h:80/p, https://h:443/p and the bare
        # forms group together — matching the browser's new URL() normalisation
        # the canvas stores comments with.
        if (scheme == "http" and netloc.endswith(":80")) or (
            scheme == "https" and netloc.endswith(":443")
        ):
            netloc = netloc.rsplit(":", 1)[0]
        rebuilt = urlunsplit((scheme, netloc, parts.path, parts.query, ""))
        if rebuilt.endswith("/"):
            rebuilt = rebuilt[:-1]
        return rebuilt
    except ValueError:
        return url


def group_and_number(records: list[CommentRecord]) -> list[PageGroup]:
    """Group records by normalised page URL and number each page 1..N by
    creation order. Pages are returned in first-comment chronological order."""
    ordered = sorted(records, key=lambda r: r.created_at)
    groups: dict[str, list[NumberedRecord]] = {}
    for record in ordered:
        key = normalize_page_url(record.page_url)
        bucket = groups.setdefault(key, [])
        bucket.append(NumberedRecord(number=len(bucket) + 1, record=record))
    # The normalised URL (no fragment / trailing slash) is the page's canonical
    # display value — consistent across the group regardless of how each
    # individual comment's URL was spelled.
    return [PageGroup(page_url=key, rows=tuple(rows)) for key, rows in groups.items()]


def summarise(groups: list[PageGroup]) -> tuple[int, int]:
    """Return ``(total, resolved)`` across all groups."""
    rows = [nr.record for g in groups for nr in g.rows]
    resolved = sum(1 for r in rows if r.status == "resolved")
    return len(rows), resolved


def _csv_safe(value: str) -> str:
    """Neutralise CSV/formula injection (OWASP): a cell beginning with a formula
    trigger is prefixed with a single quote so a spreadsheet treats it as text.
    Comment bodies and guest-chosen names are untrusted free text, so any cell
    derived from them is passed through here."""
    text = str(value)
    if text[:1] in _CSV_INJECTION_PREFIXES:
        return "'" + text
    return text


def _region_csv(record: CommentRecord) -> str:
    if record.region_width is not None and record.region_height is not None:
        return f"{round(record.region_width)}x{round(record.region_height)}"
    return "No"


def _region_pdf(record: CommentRecord) -> str | None:
    if record.region_width is not None and record.region_height is not None:
        return f"Region {round(record.region_width)}×{round(record.region_height)} px"
    return None


# --- CSV ---------------------------------------------------------------------


def comments_to_csv(groups: list[PageGroup]) -> str:
    """One row per top-level comment, ordered by page then pin number. An empty
    review yields the header row only (still a valid, openable CSV)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_HEADER)
    for group in groups:
        for nr in group.rows:
            r = nr.record
            writer.writerow(
                [
                    nr.number,
                    _STATUS_LABELS.get(r.status, r.status),
                    _csv_safe(r.author_name),
                    r.author_type.capitalize(),
                    _csv_safe(r.body),
                    _region_csv(r),
                    _csv_safe(group.page_url),
                    r.created_at.isoformat(),
                ]
            )
    return buffer.getvalue()


# --- PDF ---------------------------------------------------------------------


def _styles() -> dict[str, ParagraphStyle]:
    base = ParagraphStyle(
        "base",
        fontName=_BODY_FONT,
        fontSize=10.5,
        leading=15,
        textColor=_INK,
        alignment=TA_LEFT,
    )
    return {
        "wordmark": ParagraphStyle(
            "wordmark",
            parent=base,
            fontName=_BOLD_FONT,
            fontSize=13,
            textColor=_BRAND,
            leading=15,
        ),
        "title": ParagraphStyle(
            "title", parent=base, fontName=_BOLD_FONT, fontSize=20, leading=24
        ),
        "meta": ParagraphStyle(
            "meta", parent=base, fontName="Courier", fontSize=8.5, textColor=_MUTED
        ),
        "summary": ParagraphStyle(
            "summary", parent=base, fontSize=9, textColor=_MUTED, leading=13
        ),
        "page": ParagraphStyle(
            "page",
            parent=base,
            fontName=_BOLD_FONT,
            fontSize=9,
            textColor=_FAINT,
            leading=12,
            spaceBefore=6,
        ),
        "entry_head": ParagraphStyle(
            "entry_head",
            parent=base,
            fontName=_BOLD_FONT,
            fontSize=11,
            leading=14,
        ),
        "entry_meta": ParagraphStyle(
            "entry_meta", parent=base, fontSize=8.5, textColor=_MUTED, leading=12
        ),
        "body": ParagraphStyle(
            "body", parent=base, fontSize=10.5, textColor=colors.HexColor("#27272A")
        ),
        "loc": ParagraphStyle(
            "loc", parent=base, fontSize=8.5, textColor=_FAINT, leading=12
        ),
        "empty": ParagraphStyle(
            "empty", parent=base, fontSize=11, textColor=_MUTED, leading=16
        ),
    }


def _fmt_date(value: datetime, *, with_time: bool = False) -> str:
    return value.strftime("%d %b %Y, %H:%M UTC" if with_time else "%d %b %Y")


def _entry_flowables(nr: NumberedRecord, styles: dict[str, ParagraphStyle]) -> list:
    r = nr.record
    status_color = _STATUS_COLORS.get(r.status, _MUTED)
    status_label = _STATUS_LABELS.get(r.status, r.status)
    head = (
        f'<font color="#18181B">#{nr.number}</font>&nbsp;&nbsp;'
        f'<font color="#{status_color.hexval()[2:]}" size="8">'
        f"{escape(status_label).upper()}</font>"
    )
    meta = (
        f"{escape(r.author_name)} · {escape(r.author_type.capitalize())} · "
        f"{_fmt_date(r.created_at, with_time=True)}"
    )
    flow = [
        Paragraph(head, styles["entry_head"]),
        Spacer(1, 2),
        Paragraph(meta, styles["entry_meta"]),
        Spacer(1, 4),
        Paragraph(escape(r.body).replace("\n", "<br/>"), styles["body"]),
    ]
    region = _region_pdf(r)
    if region:
        flow.append(Spacer(1, 3))
        flow.append(Paragraph(escape(region), styles["loc"]))
    flow.append(Spacer(1, 10))
    return [KeepTogether(flow)]


def comments_to_pdf(
    groups: list[PageGroup],
    *,
    project_name: str,
    review_name: str | None,
    review_url: str,
    exported_at: datetime,
) -> bytes:
    """Render a clean, print-friendly feedback document a developer can work
    straight from. Text-only (no screenshots in v1)."""
    styles = _styles()
    total, resolved = summarise(groups)

    title = escape(project_name)
    if review_name:
        title += f' <font color="#71717A">· {escape(review_name)}</font>'

    if total == 0:
        summary = "No comments yet"
    else:
        summary = (
            f"Exported {_fmt_date(exported_at)} · "
            f"{total} comment{'s' if total != 1 else ''} — {resolved} resolved"
        )

    story: list = [
        Paragraph("ORVELLE", styles["wordmark"]),
        Spacer(1, 6),
        Paragraph(title, styles["title"]),
        Spacer(1, 3),
        Paragraph(escape(review_url), styles["meta"]),
        Spacer(1, 4),
        Paragraph(summary, styles["summary"]),
        Spacer(1, 8),
        HRFlowable(width="100%", thickness=0.75, color=_HAIRLINE),
        Spacer(1, 10),
    ]

    if total == 0:
        story.append(
            Paragraph(
                "No comments on this review yet — share the link with your client "
                "to collect feedback.",
                styles["empty"],
            )
        )
    else:
        for gi, group in enumerate(groups):
            if gi > 0:
                story.append(Spacer(1, 4))
            try:
                page_path = urlsplit(group.page_url).path or "/"
            except ValueError:
                page_path = group.page_url
            story.append(Paragraph(escape(page_path).upper(), styles["page"]))
            story.append(Spacer(1, 6))
            for nr in group.rows:
                story.extend(_entry_flowables(nr, styles))

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        title=f"{project_name} — Orvelle feedback",
        author="Orvelle",
    )
    doc.build(story)
    return buffer.getvalue()


# --- filename ----------------------------------------------------------------


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug


def export_filename(project_name: str, review_name: str | None, ext: str) -> str:
    """``orvelle-{project[-review]}-feedback.{ext}`` — ASCII-safe for the
    Content-Disposition header; falls back to ``review`` when names are empty."""
    parts = [project_name]
    if review_name:
        parts.append(review_name)
    slug = _slugify(" ".join(parts)) or "review"
    return f"orvelle-{slug}-feedback.{ext}"
