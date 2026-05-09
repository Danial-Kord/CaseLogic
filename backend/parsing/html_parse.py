"""Extract statute metadata and text from leginfo.legislature.ca.gov HTML pages.

The parser is deterministic — no LLM, no heuristics beyond what the live page
structure dictates.  Tested against the real site structure (May 2026).

Structure of a leginfo section page (id="codeLawSectionNoHead"):
  <div>Vehicle Code - VEH</div>
  <div>DIVISION 11. RULES OF THE ROAD [21000 - 23336]...</div>
  <div></div>            ← spacer
  <div>CHAPTER 7. Speed Laws [22348 - 22445.6]...</div>
  <div></div>
  <div>ARTICLE 1. Generally [22348 - 22366]...</div>  ← optional
  <br>
  <div></div>
  <div>22350.No person shall drive a vehicle...</div>  ← section text
"""

from __future__ import annotations

import re
import warnings

from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

# Matches the leading section number in the content div, e.g. "22350." or "2800.1."
_SECTION_NUM_RE = re.compile(r"^(\d[\d.]*)\.")


def parse_leginfo_section(html: str, url: str) -> dict:
    """Parse one leginfo section page into structured statute metadata.

    Returns a dict with keys:
        url             str   — the leginfo URL passed in
        code_name       str|None  — e.g. "Vehicle Code - VEH"
        division        str|None  — e.g. "DIVISION 11. RULES OF THE ROAD [21000 - 23336]..."
        chapter         str|None  — e.g. "CHAPTER 7. Speed Laws [22348 - 22445.6]..."
        section_number  str|None  — numeric part only, e.g. "22350" or "2800.1"
        statute_text    str|None  — full section text from leginfo (all subdivisions)
    """
    soup = BeautifulSoup(html, "lxml")

    result: dict = {
        "url": url,
        "code_name": None,
        "division": None,
        "chapter": None,
        "section_number": None,
        "statute_text": None,
    }

    block = soup.find(id="codeLawSectionNoHead")
    if not block:
        return result

    for div in block.find_all("div", recursive=False):
        # Normalize non-breaking spaces to regular spaces for matching
        text = div.get_text(separator=" ", strip=True).replace("\xa0", " ")
        if not text:
            continue

        if re.match(r"DIVISION\s+\d", text):
            result["division"] = text
        elif re.match(r"CHAPTER\s+\d", text):
            result["chapter"] = text
        elif text.startswith("Vehicle Code") or text.startswith("VEHICLE CODE"):
            result["code_name"] = text
        else:
            m = _SECTION_NUM_RE.match(text)
            if m:
                result["section_number"] = m.group(1)
                result["statute_text"] = text

    return result
