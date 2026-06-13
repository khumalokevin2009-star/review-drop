"""HTML + plain-text rendering for transactional emails (CLAUDE.md Section 11).

Kept dependency-free and email-client-safe: light theme (best for deliverability
and client inboxes), table-based layout, inline styles, all user-supplied content
HTML-escaped. Each renderer returns ``(html, text)``; the subject line is the
caller's concern.
"""

from __future__ import annotations

import html as _html

_FONT = (
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
)
_INDIGO = "#6366f1"


def _esc(value: str | None) -> str:
    return _html.escape(value or "")


def render_new_comment_email(
    *,
    project_name: str,
    review_name: str | None,
    commenter_name: str,
    preview: str,
    count: int,
    url: str,
) -> tuple[str, str]:
    """Render the designer's "new client feedback" email.

    ``count`` is the number of comments this email covers (1 for a single
    comment, >1 for a coalesced batch). ``preview`` is the most-recent comment's
    text; ``url`` deep-links to the review canvas.
    """
    project = _esc(project_name)
    commenter = _esc(commenter_name)
    body_preview = _esc(preview)
    where = _esc(review_name) or project

    if count > 1:
        heading = f"{count} new comments on {project}"
        meta_html = (
            f"Plus {count - 1} more comment{'s' if count - 1 != 1 else ''} "
            "since your last email."
        )
        meta_text = (
            f"Plus {count - 1} more comment"
            f"{'s' if count - 1 != 1 else ''} since your last email.\n"
        )
    else:
        heading = f"New feedback on {project}"
        meta_html = ""
        meta_text = ""

    intro = f"{commenter} left a comment on {where}."

    html = f"""\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{_esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f8fa;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fa;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e6e8eb;border-radius:12px;overflow:hidden;font-family:{_FONT};">
<tr><td style="padding:28px 32px 0 32px;">
<span style="font-size:18px;font-weight:600;color:#0f172a;letter-spacing:-0.01em;">Orvelle<span style="color:{_INDIGO};">.</span></span>
</td></tr>
<tr><td style="padding:18px 32px 0 32px;">
<p style="margin:0;font-size:18px;line-height:1.35;font-weight:600;color:#0f172a;">{_esc(heading)}</p>
</td></tr>
<tr><td style="padding:8px 32px 0 32px;">
<p style="margin:0;font-size:14px;line-height:1.5;color:#475569;">{intro}</p>
</td></tr>
<tr><td style="padding:16px 32px 0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid {_INDIGO};background:#f8fafc;border-radius:0 8px 8px 0;">
<tr><td style="padding:12px 16px;">
<p style="margin:0;font-size:14px;line-height:1.5;color:#0f172a;">&ldquo;{body_preview}&rdquo;</p>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:24px 32px 0 32px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="border-radius:8px;background:{_INDIGO};">
<a href="{url}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">View feedback &rarr;</a>
</td>
</tr></table>
</td></tr>
<tr><td style="padding:20px 32px 28px 32px;">
<p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">{meta_html}{' ' if meta_html else ''}You're receiving this because you own {project} on Orvelle.</p>
</td></tr>
</table>
<p style="margin:16px 0 0 0;font-size:11px;color:#b0b7c0;font-family:{_FONT};">Orvelle &middot; Client feedback on your website drafts</p>
</td></tr>
</table>
</body>
</html>"""

    text = (
        f"{heading}\n\n"
        f"{commenter_name} left a comment on {review_name or project_name}:\n\n"
        f'  "{preview}"\n\n'
        f"{meta_text}"
        f"View the feedback: {url}\n\n"
        f"—\n"
        f"Orvelle · Client feedback on your website drafts\n"
        f"You're receiving this because you own {project_name}.\n"
    )

    return html, text
