"""CLI entry point for statute ingestion.

Usage:
    python3 -m backend.ingestion.run --jurisdiction CA --code VEH

For CA VEH this reads eval-ca-vehicle-code.csv, fetches each section from
leginfo.legislature.ca.gov (cached to data/raw/ca_statutes/), and persists
structured rows to the Statute table.
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
    args = parser.parse_args()

    jurisdiction = args.jurisdiction.upper()
    code = args.code.upper()

    print(f"\n{'='*50}")
    print(f"  Statute Ingestion  |  {jurisdiction} {code}")
    print(f"{'='*50}")

    print("\n[1/3] Initialising database …")
    from backend.db import init_db
    init_db()
    print("      done.")

    if jurisdiction == "CA" and code == "VEH":
        from backend.config import REPO_ROOT
        from backend.ingestion.pipeline import ingest_ca_vehicle_code

        csv_path = args.csv or str(REPO_ROOT / "eval-ca-vehicle-code.csv")
        print(f"\n[2/3] Ingesting CA Vehicle Code from: {csv_path}")
        print("      (fetching ~35 unique sections from leginfo.legislature.ca.gov)")
        print("      Cached pages will be reused on repeat runs.\n")

        report = ingest_ca_vehicle_code(csv_path)

        print(f"\n[3/3] Summary")
        print(f"      Rows in CSV        : {report.rows_requested}")
        print(f"      Unique sections fetched : {report.rows_fetched}")
        print(f"      Sections parsed    : {report.rows_parsed}")
        print(f"      Statute rows saved : {report.rows_persisted}")
        print(f"      Already present    : {report.rows_skipped}")
        print(f"      Failures           : {len(report.failures)}")

        if report.failures:
            print("\n  FAILURES:")
            for failure in report.failures:
                print(f"    ✗ {failure}")
            sys.exit(1)
        else:
            total = report.rows_persisted + report.rows_skipped
            print(f"\n  All {total} citations accounted for. ✓")
            print(f"  Run again to verify idempotency (all rows will show as 'Already present').\n")
    else:
        print(f"\nNo ingestion handler for jurisdiction={jurisdiction}, code={code}.")
        print("Supported: --jurisdiction CA --code VEH")
        sys.exit(1)


if __name__ == "__main__":
    main()
