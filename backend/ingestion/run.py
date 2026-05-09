"""CLI entry point for statute ingestion.

Usage:
    python3 -m backend.ingestion.run --jurisdiction CA --code VEH

For CA VEH the run proceeds in two phases:

  Phase A — eval CSV (fast, ~37 HTTP requests)
      Ingests every citation in eval-ca-vehicle-code.csv, including sections
      outside Division 11 (e.g. § 2800.1, § 20001, § 27001).

  Phase B — full division walk (slow first run, ~40 min; instant on re-runs)
      Walks every integer in Division 11 [21000–23336] and
      Division 11.5 [23500–23675] and persists each section that exists.
      Sections already ingested in Phase A are skipped.
      Non-existent section numbers are marked with an .invalid cache file so
      subsequent runs don't re-fetch them.
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


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest statute data into the local database.",
    )
    parser.add_argument(
        "--jurisdiction",
        required=True,
        help="Two-letter jurisdiction code, e.g. CA",
    )
    parser.add_argument(
        "--code",
        required=True,
        help="Statute code abbreviation, e.g. VEH",
    )
    parser.add_argument(
        "--csv",
        default=None,
        help="Path to the eval CSV (default: repo-root/eval-ca-vehicle-code.csv)",
    )
    parser.add_argument(
        "--csv-only",
        action="store_true",
        help="Skip the full division walk; only ingest the eval CSV rows.",
    )
    args = parser.parse_args()

    jurisdiction = args.jurisdiction.upper()
    code = args.code.upper()

    print(f"\n{'='*54}")
    print(f"  Statute Ingestion  |  {jurisdiction} {code}")
    print(f"{'='*54}")

    print("\n[1/4] Initialising database …")
    from backend.db import init_db
    init_db()
    print("      done.")

    if jurisdiction != "CA" or code != "VEH":
        print(f"\nNo ingestion handler for jurisdiction={jurisdiction}, code={code}.")
        print("Supported: --jurisdiction CA --code VEH")
        sys.exit(1)

    from backend.config import REPO_ROOT
    from backend.ingestion.pipeline import ingest_ca_vehicle_code, ingest_ca_vehicle_code_divisions

    # ------------------------------------------------------------------
    # Phase A — eval CSV
    # ------------------------------------------------------------------
    csv_path = args.csv or str(REPO_ROOT / "eval-ca-vehicle-code.csv")
    print(f"\n[2/4] Phase A — eval CSV: {csv_path}")
    print("      Fetches the 41 eval citations (including out-of-division sections).")
    print("      Cached pages are reused on repeat runs.\n")

    csv_report = ingest_ca_vehicle_code(csv_path)

    print(f"      Rows in CSV              : {csv_report.rows_requested}")
    print(f"      Unique sections fetched  : {csv_report.rows_fetched}")
    print(f"      Statute rows saved       : {csv_report.rows_persisted}")
    print(f"      Already present (skipped): {csv_report.rows_skipped}")
    print(f"      Failures                 : {len(csv_report.failures)}")
    if csv_report.failures:
        print("\n  PHASE A FAILURES:")
        for f in csv_report.failures:
            print(f"    ✗ {f}")

    # ------------------------------------------------------------------
    # Phase B — full division walk
    # ------------------------------------------------------------------
    if args.csv_only:
        print("\n  --csv-only set: skipping division walk.")
    else:
        print(f"\n[3/4] Phase B — full division walk")
        print("      Division 11  [21000–23336] + Division 11.5 [23500–23675]")
        print("      ~2,500 section numbers to check; ~1,500 valid sections expected.")
        print("      First run: ~40 min at 1 req/sec. Re-runs use disk cache (seconds).")
        print("      Non-existent section numbers write a .invalid marker and are")
        print("      skipped instantly on future runs.\n")

        walk_report = ingest_ca_vehicle_code_divisions()

        print(f"      Section numbers attempted : {walk_report.sections_attempted}")
        print(f"      Valid sections found      : {walk_report.sections_found}")
        print(f"      New rows saved            : {walk_report.sections_persisted}")
        print(f"      Already in DB (skipped)   : {walk_report.sections_skipped}")
        print(f"      Not in code (missing)     : {walk_report.sections_missing}")
        print(f"      Failures                  : {len(walk_report.failures)}")
        if walk_report.failures:
            print("\n  PHASE B FAILURES (first 10):")
            for f in walk_report.failures[:10]:
                print(f"    ✗ {f}")

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print(f"\n[4/4] Done.")
    any_failure = bool(csv_report.failures) or (
        not args.csv_only and bool(walk_report.failures)  # type: ignore[possibly-undefined]
    )
    if any_failure:
        print("  Some failures occurred (see above).")
        sys.exit(1)
    else:
        total_csv = csv_report.rows_persisted + csv_report.rows_skipped
        print(f"  All {total_csv} eval CSV citations accounted for. ✓")
        if not args.csv_only:
            total_walk = walk_report.sections_persisted + walk_report.sections_skipped  # type: ignore[possibly-undefined]
            print(f"  Division walk: {total_walk} sections in DB total. ✓")
        print()


if __name__ == "__main__":
    main()
