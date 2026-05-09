"""Extract statute metadata and text from state statute HTML pages.

Parsers:
  parse_leginfo_section()  — California leginfo.legislature.ca.gov
  parse_fl_section()       — Florida leg.state.fl.us (Chapter 316)
  parse_ny_section()       — New York nysenate.gov (Vehicle & Traffic Law)
  parse_wa_section()       — Washington app.leg.wa.gov/rcw (RCW Title 46)

All parsers return the same dict shape:
  {url, code_name, division, chapter, section_number, statute_text}
"""

from __future__ import annotations

import re
import warnings

from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

# Matches the leading section number in the content div, e.g. "22350." or "2800.1."
_SECTION_NUM_RE = re.compile(r"^(\d[\d.]*)\.")


def _empty_result(url: str) -> dict:
    return {
        "url": url,
        "code_name": None,
        "division": None,
        "chapter": None,
        "section_number": None,
        "statute_text": None,
    }


def parse_leginfo_section(html: str, url: str) -> dict:
    """Parse one leginfo section page (California Vehicle Code).

    Block structure inside id="codeLawSectionNoHead":
      <div>Vehicle Code - VEH</div>
      <div>DIVISION 11. RULES OF THE ROAD [21000 - 23336]...</div>
      <div>CHAPTER 7. Speed Laws...</div>
      <div>22350.No person shall drive...</div>
    """
    soup = BeautifulSoup(html, "lxml")
    result = _empty_result(url)

    block = soup.find(id="codeLawSectionNoHead")
    if not block:
        return result

    for div in block.find_all("div", recursive=False):
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


def parse_fl_section(html: str, url: str) -> dict:
    """Parse one Florida Statutes section page (Chapter 316).

    Key elements:
      class="SectionBody"  — statute text
      id="statutes"        — full text including section number and title
    """
    soup = BeautifulSoup(html, "lxml")
    result = _empty_result(url)
    result["code_name"] = "Fla. Stat."
    result["chapter"] = "Chapter 316 — State Uniform Traffic Control"

    # Section number + title from id="statutes" div
    # Text starts like "F.S. 316.183316.183Unlawful speed.—..."
    statutes_div = soup.find(id="statutes")
    if statutes_div:
        raw = statutes_div.get_text(separator=" ", strip=True).replace("\xa0", " ")
        # Extract section number: first occurrence of NNN.NNN pattern
        m = re.search(r"\b(\d{3}\.\d+)\b", raw)
        if m:
            result["section_number"] = m.group(1)

    # Main text from SectionBody
    body = soup.find(class_="SectionBody")
    if body:
        result["statute_text"] = body.get_text(separator=" ", strip=True).replace("\xa0", " ")

    return result


def parse_ny_section(html: str, url: str) -> dict:
    """Parse one New York Vehicle & Traffic Law section page.

    Key elements:
      class="nys-openleg-result-title"       — section number + title + chapter/article
      class="nys-openleg-content-container"  — full statute text
    """
    soup = BeautifulSoup(html, "lxml")
    result = _empty_result(url)
    result["code_name"] = "N.Y. Veh. & Traf. Law"

    title_div = soup.find(class_="nys-openleg-result-title")
    if title_div:
        title_text = title_div.get_text(separator=" ", strip=True).replace("\xa0", " ")
        # e.g. "SECTION 1180 Basic rule and maximum limits Vehicle & Traffic (VAT) CHAPTER 71, TITLE 7, ARTICLE 30"
        m_sec = re.search(r"SECTION\s+(\d[\w.-]*)", title_text, re.IGNORECASE)
        if m_sec:
            result["section_number"] = m_sec.group(1)
        m_art = re.search(r"ARTICLE\s+\d+", title_text, re.IGNORECASE)
        if m_art:
            result["chapter"] = m_art.group(0)
        m_title = re.search(r"TITLE\s+\d+", title_text, re.IGNORECASE)
        if m_title:
            result["division"] = m_title.group(0)

    content = soup.find(class_="nys-openleg-content-container")
    if content:
        result["statute_text"] = content.get_text(separator=" ", strip=True).replace("\xa0", " ")

    return result


def parse_wa_section(html: str, url: str) -> dict:
    """Parse one Washington RCW section page (Title 46, Chapter 46.61).

    Key elements:
      class="section-page"    — main statute text body
      class="container-xxl"   — breadcrumb with section number and title
    """
    soup = BeautifulSoup(html, "lxml")
    result = _empty_result(url)
    result["code_name"] = "RCW"
    result["division"] = "Title 46 — Motor Vehicles"
    result["chapter"] = "Chapter 46.61 — Rules of the Road"

    # Extract section number from breadcrumb / container-xxl
    breadcrumb = soup.find(class_="container-xxl")
    if breadcrumb:
        bc_text = breadcrumb.get_text(separator=" ", strip=True)
        # e.g. "...Section 46.61.500..."
        m = re.search(r"Section\s+(46\.61\.\d+)", bc_text, re.IGNORECASE)
        if m:
            result["section_number"] = m.group(1)

    # Main statute text
    section_page = soup.find(class_="section-page")
    if section_page:
        result["statute_text"] = section_page.get_text(separator=" ", strip=True).replace("\xa0", " ")

    return result
