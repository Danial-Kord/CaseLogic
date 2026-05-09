"""CLI entry point for statute ingestion.

Usage:
    python3 -m backend.ingestion.run --jurisdiction CA --code VEH
    python3 -m backend.ingestion.run --jurisdiction FL --code STAT
    python3 -m backend.ingestion.run --jurisdiction NY --code VAT
    python3 -m backend.ingestion.run --jurisdiction WA --code RCW

CA VEH runs in two phases:
  Phase A — eval CSV (fast, ~37 HTTP requests)
  Phase B — full division walk (~40 min first run; instant on re-runs from cache)

FL/NY/WA run a single section walk:
  FL STAT — Chapter 316, sections 316.001–316.650 (~650 numbers, ~300 valid)
  NY VAT  — Articles 21/30, sections 1100–1299 (~200 numbers, ~100 valid)
  WA RCW  — Chapter 46.61, sections 001–990 (~990 numbers, ~200 valid)

All states: first run fetches from the official site; subsequent runs use disk cache.
"""

from __future__ import annotations

import argparse
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

_SUPPORTED = {
    ("CA", "VEH"): "California Vehicle Code (Divisions 11 + 11.5)",
    ("FL", "STAT"): "Florida Statutes Chapter 316 (Traffic Control)",
    ("NY", "VAT"): "New York Vehicle & Traffic Law (Articles 21 + 30)",
    ("WA", "RCW"): "Washington RCW Chapter 46.61 (Rules of the Road)",
}


def _print_walk_report(report) -> None:
    print(f"      Section numbers attempted : {report.sections_attempted}")
    print(f"      Valid sections found      : {report.sections_found}")
    print(f"      New rows saved            : {report.sections_persisted}")
    print(f"      Already in DB (skipped)   : {report.sections_skipped}")
    print(f"      Not in code (missing)     : {report.sections_missing}")
    print(f"      Failures                  : {len(report.failures)}")
    if report.failures:
        print("\n  FAILURES (first 10):")
        for f in report.failures[:10]:
            print(f"    ✗ {f}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest statute data into the local database.",
    )
    parser.add_argument("--jurisdiction", required=True,
                        help="Jurisdiction code: CA, FL, NY, WA")
    parser.add_argument("--code", required=True,
                        help="Code abbreviation: VEH, STAT, VAT, RCW")
    parser.add_argument("--csv", default=None,
                        help="(CA only) Path to eval CSV")
    parser.add_argument("--csv-only", action="store_true",
                        help="(CA only) Skip division walk; ingest eval CSV only.")
    args = parser.parse_args()

    jurisdiction = args.jurisdiction.upper()
    code = args.code.upper()
    key = (jurisdiction, code)

    print(f"\n{'='*60}")
    print(f"  Statute Ingestion  |  {jurisdiction} {code}")
    if key in _SUPPORTED:
        print(f"  {_SUPPORTED[key]}")
    print(f"{'='*60}")

    print("\n[1] Initialising database …")
    from backend.db import init_db
    init_db()
    print("    done.")

    if key not in _SUPPORTED:
        print(f"\nNo ingestion handler for --jurisdiction {jurisdiction} --code {code}.")
        print("Supported combinations:")
        for (j, c), desc in _SUPPORTED.items():
            print(f"  --jurisdiction {j} --code {c}   ({desc})")
        sys.exit(1)

    # ------------------------------------------------------------------
    # California Vehicle Code
    # ------------------------------------------------------------------
    if key == ("CA", "VEH"):
        from backend.config import REPO_ROOT
        from backend.ingestion.pipeline import ingest_ca_vehicle_code, ingest_ca_vehicle_code_divisions

        csv_path = args.csv or str(REPO_ROOT / "eval-ca-vehicle-code.csv")
        print(f"\n[2] Phase A — eval CSV: {csv_path}")
        csv_report = ingest_ca_vehicle_code(csv_path)
        print(f"    Rows in CSV              : {csv_report.rows_requested}")
        print(f"    Unique sections fetched  : {csv_report.rows_fetched}")
        print(f"    Statute rows saved       : {csv_report.rows_persisted}")
        print(f"    Already present (skipped): {csv_report.rows_skipped}")
        print(f"    Failures                 : {len(csv_report.failures)}")
        if csv_report.failures:
            for f in csv_report.failures:
                print(f"    ✗ {f}")

        if args.csv_only:
            print("\n  --csv-only set: skipping division walk.")
        else:
            print("\n[3] Phase B — full division walk (Div 11 + 11.5)")
            print("    First run ~40 min; re-runs instant from cache.\n")
            walk_report = ingest_ca_vehicle_code_divisions()
            _print_walk_report(walk_report)

        print("\n[4] Done.")
        sys.exit(0)

    # ------------------------------------------------------------------
    # Florida Statutes Chapter 316
    # ------------------------------------------------------------------
    if key == ("FL", "STAT"):
        from backend.ingestion.pipeline import ingest_fl_statutes
        print("\n[2] Walking Florida Statutes Chapter 316 (316.001–316.650)")
        print("    ~650 section numbers; ~300 valid. First run ~12 min.\n")
        report = ingest_fl_statutes()
        _print_walk_report(report)
        print("\n[3] Done.")
        sys.exit(1 if report.failures else 0)

    # ------------------------------------------------------------------
    # New York Vehicle & Traffic Law
    # ------------------------------------------------------------------
    if key == ("NY", "VAT"):
        from backend.ingestion.pipeline import ingest_ny_statutes
        print("\n[2] Walking NY Vehicle & Traffic Law (sections 1100–1299)")
        print("    ~200 section numbers; ~100 valid. First run ~5 min.\n")
        report = ingest_ny_statutes()
        _print_walk_report(report)
        print("\n[3] Done.")
        sys.exit(1 if report.failures else 0)

    # ------------------------------------------------------------------
    # Washington RCW 46.61
    # ------------------------------------------------------------------
    if key == ("WA", "RCW"):
        from backend.ingestion.pipeline import ingest_wa_statutes
        print("\n[2] Walking Washington RCW 46.61 (sections 001–990)")
        print("    ~990 section numbers; ~200 valid. First run ~18 min.\n")
        report = ingest_wa_statutes()
        _print_walk_report(report)
        print("\n[3] Done.")
        sys.exit(1 if report.failures else 0)


if __name__ == "__main__":
    main()
