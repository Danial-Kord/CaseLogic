"""Locked 17-category contributing-factor taxonomy from the released eval CSV.

This is the label space for both the extraction tagger (Person 2) and the
`factor` filter on retrieval (Person 3 / Person 4). Frontend dropdown reads
from `GET /factors`, which counts statutes per category in this list.

Strings are byte-exact with `eval-ca-vehicle-code.csv` so equality checks just
work — no normalization, no aliases.
"""

from __future__ import annotations

from enum import Enum


class ContributingFactor(str, Enum):
    DUI_DWI = "DUI/DWI"
    DRIVING_TOO_FAST_FOR_CONDITIONS = "Driving Too Fast For Conditions"
    FAILURE_TO_MAINTAIN_LANE = "Failure to Maintain Lane"
    FAILURE_TO_OBEY_TRAFFIC_CONTROL_DEVICE = "Failure to Obey Traffic Control Device"
    FAILURE_TO_USE_HORN = "Failure to Use/Activate Horn"
    FAILURE_TO_YIELD_AT_YIELD_SIGN = "Failure to Yield at a Yield Sign"
    FAILURE_TO_YIELD = "Failure to Yield the Right-of-Way"
    FLEEING_POLICE = "Fleeing a Police Officer"
    FLEEING_SCENE = "Fleeing the Scene of a Collision"
    FOLLOWING_TOO_CLOSELY = "Following Too Closely"
    IMPROPER_LANE_OF_TRAVEL = "Improper Lane of Travel"
    IMPROPER_PASSING = "Improper Passing"
    IMPROPER_STARTING = "Improper Starting"
    IMPROPER_STOPPING = "Improper Stopping"
    IMPROPER_TURNING = "Improper Turning"
    RECKLESS_DRIVING = "Reckless Driving"
    USING_WIRELESS_PHONE = "Using a Wireless Telephone/Texting While Driving"


FACTORS: tuple[str, ...] = tuple(sorted(f.value for f in ContributingFactor))
"""Canonical alphabetical list — what `GET /factors` returns and what the UI dropdown uses."""

FACTORS_SET: frozenset[str] = frozenset(FACTORS)


def is_known_factor(value: str) -> bool:
    """True if `value` is one of the 17 locked factor strings (byte-exact)."""
    return value in FACTORS_SET
