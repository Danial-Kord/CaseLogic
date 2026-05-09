"""Quoted-span extraction for the verification layer.

Pulls every direct quotation out of the assistant's answer so the verifier
can check whether each one actually appears verbatim in some retrieved
source. We deliberately only audit *quoted* prose — paraphrases would
require an LLM judge, which is out of scope for the deterministic layer.

What counts as a quote:
  - Straight double quotes:           "like this"
  - Curly/typographic double quotes:  \u201clike this\u201d
  - Block quotes:                     > like this  (markdown line)

Single quotes are intentionally skipped: they're far more likely to be
contractions, ellipses, or apostrophes than legal quotations, and Claude
rarely uses them for direct quoting.

Spans shorter than `MIN_QUOTE_CHARS` are also dropped because false
positives dominate at that length (e.g. "yes", "no", "shall"). Lawyers
reading the verification badge care about whether the *claim-bearing*
quotes are real, not throwaway phrases.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


# Quotes shorter than this are skipped — too noisy to bother auditing.
# Tuned so that "shall stop at a marked limit line" (37 chars) passes but
# "yes" (3) doesn't.
MIN_QUOTE_CHARS = 25


# Straight + curly double quotes. Non-greedy so consecutive quotes don't
# merge into one giant span.
_RX_STRAIGHT = re.compile(r'"([^"\n]{1,500}?)"')
_RX_CURLY = re.compile(r"\u201c([^\u201c\u201d\n]{1,500}?)\u201d")
# Markdown blockquote lines: a "> " at line start, taking the rest of the
# line. We strip the leading marker before storing the span.
_RX_BLOCKQUOTE = re.compile(r"^>\s?(.+)$", re.MULTILINE)


@dataclass(frozen=True)
class QuotedSpan:
    """One direct quotation from the assistant's answer.

    `text` is the quoted content with the surrounding quote marks/markers
    stripped. `offset` points at the *opening* delimiter so the frontend
    can underline the span in the source position if it needs to.

    `kind` is informational — useful for displaying a different chip
    style for blockquoted material in the UI.
    """

    text: str
    offset: int
    kind: str  # "double" | "curly" | "blockquote"


def extract_quotes(text: str) -> list[QuotedSpan]:
    """Return every quoted span >= MIN_QUOTE_CHARS, in source order.

    Duplicates within the same answer are preserved (the verifier counts
    mentions when reporting coverage). The caller can dedupe if desired.
    """

    if not text:
        return []

    spans: list[QuotedSpan] = []

    for m in _RX_STRAIGHT.finditer(text):
        body = m.group(1).strip()
        if len(body) >= MIN_QUOTE_CHARS:
            spans.append(QuotedSpan(text=body, offset=m.start(), kind="double"))
    for m in _RX_CURLY.finditer(text):
        body = m.group(1).strip()
        if len(body) >= MIN_QUOTE_CHARS:
            spans.append(QuotedSpan(text=body, offset=m.start(), kind="curly"))
    for m in _RX_BLOCKQUOTE.finditer(text):
        body = m.group(1).strip()
        # Strip surrounding quote marks if the writer also added them
        # inside the blockquote — common when Claude blockquotes a quote.
        body = body.strip("\u201c\u201d\u2018\u2019\"'")
        if len(body) >= MIN_QUOTE_CHARS:
            spans.append(
                QuotedSpan(text=body, offset=m.start(), kind="blockquote")
            )

    spans.sort(key=lambda s: s.offset)
    return spans


def normalize_for_match(text: str) -> str:
    """Whitespace + punctuation-tolerant normalization for substring search.

    Used both on the quoted span and on each evidence text. Collapses any
    run of whitespace to a single space and lowercases. Punctuation is
    intentionally NOT stripped — legal text differs by a comma sometimes,
    and we'd rather flag that as unsupported (asking the lawyer to look)
    than silently treat them as equivalent.
    """

    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip().lower()
