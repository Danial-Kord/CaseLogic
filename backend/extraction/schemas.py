"""Pydantic schemas for Variant A — PI Case Comparator structured extraction.

Locked at Phase 1 kickoff. Every extracted field carries `SourceSupport` so that the
verification layer can later trace the field back to a public URL + paragraph.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


SCHEMA_NAME = "personal_injury_case"


class SourceSupport(BaseModel):
    """Per-field traceability — a quote pulled from the source plus its location."""

    field: str = Field(..., description="Dotted path of the field this evidence supports, e.g. 'damages.non_pecuniary'.")
    quote: str = Field(..., description="Verbatim snippet from the source document.")
    url: str = Field(..., description="Public source URL the snippet came from.")
    paragraph: Optional[str] = Field(None, description="Paragraph number or anchor within the source, if available.")


class Damages(BaseModel):
    """Award amounts. Stored as the quoted strings from the source (e.g. '$85,000')
    rather than parsed numbers so we preserve exactly what the court wrote."""

    non_pecuniary: Optional[str] = Field(None, description="General / pain-and-suffering damages, as quoted.")
    future_care: Optional[str] = Field(None, description="Future-care or medical-cost award, as quoted.")
    past_loss_of_income: Optional[str] = Field(None, description="Past income loss, as quoted.")
    future_loss_of_income: Optional[str] = Field(None, description="Future income loss / loss of earning capacity, as quoted.")
    total: Optional[str] = Field(None, description="Total damages awarded, as quoted.")


LiabilityFinding = Literal["plaintiff", "defendant", "shared", "unclear"]


class Liability(BaseModel):
    finding: LiabilityFinding = Field(..., description="Who the court found liable.")
    apportionment: Optional[str] = Field(None, description="If shared, the split as quoted (e.g. '70/30 defendant/plaintiff').")
    contributory_negligence: bool = Field(False, description="Whether contributory negligence was found against the plaintiff.")


class PICaseFields(BaseModel):
    """The locked field set for Variant A. Narrow on purpose — every field must be
    useful for comparison or filtering. Don't add columns we won't surface in UI."""

    accident_type: Optional[str] = Field(None, description="One short phrase, e.g. 'rear-end motor vehicle collision'.")
    injuries: list[str] = Field(default_factory=list, description="Distinct injuries the plaintiff sustained.")
    damages: Damages = Field(default_factory=Damages)
    liability: Optional[Liability] = Field(None, description="Liability finding if the decision reached one.")
    key_facts: list[str] = Field(default_factory=list, description="Salient facts that drove the outcome (3-7 bullets).")
    legal_issues: list[str] = Field(default_factory=list, description="Legal issues the court actually decided.")
    jurisdiction: Optional[str] = Field(None, description="Province / state the decision belongs to.")
    court: Optional[str] = Field(None, description="Court name, e.g. 'Ontario Superior Court of Justice'.")
    decision_date: Optional[str] = Field(None, description="ISO-8601 date string when known, otherwise as-quoted.")
    citation: Optional[str] = Field(None, description="Canonical citation, e.g. '2021 ONSC 1234'.")


class PICaseExtraction(BaseModel):
    """The envelope `extract.py` returns. Mirrors baseline Module 4 example output."""

    document_id: str
    schema_name: Literal["personal_injury_case"] = SCHEMA_NAME
    fields: PICaseFields
    confidence: float = Field(..., ge=0.0, le=1.0, description="Self-reported model confidence in the overall extraction.")
    source_support: list[SourceSupport] = Field(default_factory=list, description="One entry per important extracted field.")
