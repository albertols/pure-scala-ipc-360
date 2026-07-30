#!/usr/bin/env python3
"""Deterministic b15 operational-history generator (spec §5).
Same inputs => byte-identical output. Regenerate: python3 scripts/gen_b15_history.py
Extend the window: --anchor <later-date> [--days N] — never edit committed CSVs by hand."""
import argparse, csv, random, re, sys
from datetime import date, timedelta
from pathlib import Path

LAYERS = ["STG", "ODS", "DWH", "CDM", "RDM", "QDM", "ETL", "OUTPUT"]
FILENAME = "b15_application_end_with_recipe_null_status.csv"
COLUMNS = ["cluster_name", "recipe_filename", "job_id", "app_start_iso",
           "avg_job_duration_in_mins_sec", "status", "message"]

def recipes(sql_root: Path):
    found = []
    for layer in LAYERS:                                   # fixed order => determinism
        f = sql_root / layer / "statements.sql"
        if f.is_file():
            found += re.findall(r"'(_ETL_[A-Za-z0-9_]+\.json)'", f.read_text())
    return sorted(set(found))

def fmt_duration(seconds: int) -> str:
    return f"{seconds // 60}m {seconds % 60:02d}sec"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=360)
    ap.add_argument("--anchor", default="2026-07-29")
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--sql-root", default="backend/src/main/resources/mock/DWH_CONTROL/LAYER_TO_LAYER")
    ap.add_argument("--out", default="backend/src/main/resources/mock/composer/dwh/config/cluster_tuning/inputs")
    a = ap.parse_args()
    recs = recipes(Path(a.sql_root))
    if not recs: sys.exit("no recipes found under " + a.sql_root)
    anchor = date.fromisoformat(a.anchor)
    rng = random.Random(a.seed)
    # per-recipe stable profile drawn once, in sorted order
    profiles = {r: {"cluster": f"cluster-wf-syn-{i:02d}-{rng.randint(1000, 9999)}",
                    "base_s": rng.randint(120, 5400),
                    "fail_day": rng.randint(0, a.days - 1),
                    "null_status": (i % 7 == 3),           # every 7th-ish recipe: the b15 null-status case
                    "gap_start": rng.randint(0, a.days - 1) if i % 9 == 5 else None}
                for i, r in enumerate(recs)}
    for d in range(a.days - 1, -1, -1):
        day = anchor - timedelta(days=d)
        outdir = Path(a.out) / day.strftime("%Y_%m_%d")
        outdir.mkdir(parents=True, exist_ok=True)
        with open(outdir / FILENAME, "w", newline="") as fh:
            w = csv.writer(fh, lineterminator="\n"); w.writerow(COLUMNS)
            for i, r in enumerate(recs):
                p = profiles[r]
                if p["gap_start"] is not None and p["gap_start"] <= (a.days - 1 - d) < p["gap_start"] + 2:
                    continue                               # recipe disappears for two days
                seconds = p["base_s"] + rng.randint(-60, 60)
                start_h, start_m = 4 + (i % 6), rng.randint(0, 59)
                status, msg = "SUCCESS", ""
                if p["null_status"]: status = ""
                elif (a.days - 1 - d) == p["fail_day"]: status, msg = "FAILED", "Stage failure, executor lost (synthetic)"
                w.writerow([p["cluster"], r,
                            f"application_{1774840000 + a.seed}_{d:02d}{i:03d}",
                            f"{day.isoformat()}T{start_h:02d}:{start_m:02d}:00.000Z",
                            fmt_duration(max(seconds, 30)), status, msg])
    print(f"wrote {a.days} snapshots for {len(recs)} recipes under {a.out}")

if __name__ == "__main__":
    main()
