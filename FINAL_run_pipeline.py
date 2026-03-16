"""
run_pipeline.py
---------------
Full HR Assistant pipeline — runs all 6 stages end-to-end:
  1. Read LinkedIn job alert emails from Gmail
  2. Scrape each job posting for full details
  3. Score and filter jobs using Claude AI
  4. Generate tailored CV + cover letter for NEW jobs only
  5. Update job_tracker.json (preserve existing statuses/notes)
  6. Purge jobs older than 7 days with no action taken

Run every 48 hours via Windows Task Scheduler (see setup_scheduler.bat).
"""

import logging
import sys
import json
import os
from datetime import datetime, timedelta
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("hr_assistant.log"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

TRACKER_FILE = "job_tracker.json"
CUTOFF_DATE  = "2026-02-22"   # Jobs discovered before this date are ignored
EXPIRY_DAYS  = 7              # Auto-delete if no action taken within this many days


# ── Tracker helpers ──────────────────────────────────────────────────────────

def load_tracker():
    """Load job_tracker.json, return dict keyed by job_id."""
    if not Path(TRACKER_FILE).exists():
        return {}
    with open(TRACKER_FILE) as f:
        jobs = json.load(f)
    return {j["id"]: j for j in jobs}


def save_tracker(tracker: dict):
    """Save tracker dict back to job_tracker.json as a list."""
    with open(TRACKER_FILE, "w") as f:
        json.dump(list(tracker.values()), f, indent=2, ensure_ascii=False)
    log.info(f"Tracker saved: {len(tracker)} jobs in {TRACKER_FILE}")


def make_job_id(title: str, company: str) -> str:
    """Stable ID from title + company."""
    import re
    raw = f"{company}_{title}".lower()
    return re.sub(r"[^a-z0-9]+", "_", raw).strip("_")[:60]


def merge_new_jobs(tracker: dict, matched: list) -> tuple[dict, list]:
    """
    Add genuinely new jobs to tracker.
    - Preserves status/notes/url for existing jobs.
    - Returns (updated_tracker, truly_new_jobs).
    """
    today = datetime.now().strftime("%Y-%m-%d")
    new_jobs = []

    for job in matched:
        jid = make_job_id(job.get("title", ""), job.get("company", ""))
        if jid in tracker:
            log.info(f"  Already tracked: {job.get('title')} @ {job.get('company')}")
            continue

        entry = {
            "id":              jid,
            "title":           job.get("title", ""),
            "company":         job.get("company", ""),
            "score":           job.get("score", 0),
            "discovered":      today,
            "status":          "not_applied",
            "note":            "",
            "url":             job.get("url", ""),
            "cv_file":         "",
            "cl_file":         "",
        }
        tracker[jid] = entry
        new_jobs.append(job)
        log.info(f"  New job added: {job.get('title')} @ {job.get('company')}")

    return tracker, new_jobs


def purge_expired(tracker: dict) -> dict:
    """
    Remove jobs where:
    - discovered before CUTOFF_DATE, OR
    - status is still 'not_applied' and discovered > EXPIRY_DAYS ago
    """
    cutoff = datetime.strptime(CUTOFF_DATE, "%Y-%m-%d")
    expiry_threshold = datetime.now() - timedelta(days=EXPIRY_DAYS)
    purged = []

    for jid, job in list(tracker.items()):
        discovered = datetime.strptime(job["discovered"], "%Y-%m-%d")

        if discovered < cutoff:
            purged.append(jid)
            log.info(f"  Purged (before cutoff): {job['title']} @ {job['company']}")
            del tracker[jid]
            continue

        if job["status"] == "not_applied" and discovered < expiry_threshold:
            purged.append(jid)
            log.info(f"  Purged (expired 7d, no action): {job['title']} @ {job['company']}")
            del tracker[jid]

    if purged:
        log.info(f"Purged {len(purged)} expired/old job(s).")
    else:
        log.info("No jobs to purge.")

    return tracker


def update_file_refs(tracker: dict) -> dict:
    """Scan cv_output/ and cl_output/ and attach filenames to tracker entries."""
    cv_dir = Path("cv_output")
    cl_dir = Path("cl_output")

    for jid, job in tracker.items():
        # Try to match by company+title slug in filename
        slug = jid  # our id is already the slug
        if cv_dir.exists():
            for f in cv_dir.iterdir():
                if slug[:20] in f.name.lower().replace(" ", "_"):
                    job["cv_file"] = f.name
                    break
        if cl_dir.exists():
            for f in cl_dir.iterdir():
                if slug[:20] in f.name.lower().replace(" ", "_"):
                    job["cl_file"] = f.name
                    break
    return tracker


# ── Main pipeline ────────────────────────────────────────────────────────────

if __name__ == "__main__":

    skip_to = None
    if "--from-filter" in sys.argv:
        skip_to = "filter"
    elif "--from-generate" in sys.argv:
        skip_to = "generate"

    # ── Stage 1: Gmail ────────────────────────────────────────────────────────
    if skip_to not in ("filter", "generate"):
        print("\n🔍 STAGE 1: Reading LinkedIn job alert emails from Gmail...")
        from gmail_reader import get_all_jobs
        jobs_raw = get_all_jobs(days_back=2)   # 48h window matches scheduler

        if not jobs_raw:
            print("No new jobs found in Gmail.")
            # Still run purge + save even if no new jobs
            tracker = load_tracker()
            tracker = purge_expired(tracker)
            save_tracker(tracker)
            print("Tracker purged and saved. Exiting.")
            exit()

        # ── Stage 2: Scrape ───────────────────────────────────────────────────
        print(f"\n🌐 STAGE 2: Scraping {len(jobs_raw)} job postings...")
        from job_scraper import scrape_all_jobs, print_summary
        detailed_jobs = scrape_all_jobs(jobs_raw)
        print_summary(detailed_jobs)

    # ── Stage 3: Filter ───────────────────────────────────────────────────────
    if skip_to != "generate":
        print(f"\n🤖 STAGE 3: Scoring and filtering jobs with Claude AI...")
        from job_filter import filter_jobs, print_filter_summary
        matched, rejected = filter_jobs()
        print_filter_summary(matched, rejected)

        if not matched:
            print("\nNo matched jobs this run.")
            tracker = load_tracker()
            tracker = purge_expired(tracker)
            save_tracker(tracker)
            print("Tracker purged and saved. Exiting.")
            exit()
    else:
        with open("jobs_matched.json") as f:
            matched = json.load(f)

    # ── Stage 4: Merge into tracker, find new jobs only ───────────────────────
    print(f"\n📋 STAGE 4: Updating job tracker...")
    tracker = load_tracker()
    tracker, new_jobs = merge_new_jobs(tracker, matched)

    if not new_jobs:
        print("No new jobs to generate applications for.")
        tracker = purge_expired(tracker)
        tracker = update_file_refs(tracker)
        save_tracker(tracker)
        print("Tracker updated. Exiting.")
        exit()

    # ── Stages 5-6: Generate CV + Cover Letter for NEW jobs only ──────────────
    print(f"\n📝 STAGES 5-6: Generating applications for {len(new_jobs)} new job(s)...")

    # Temporarily write only new jobs to jobs_matched.json for generators
    with open("jobs_matched.json", "w") as f:
        json.dump(new_jobs, f, indent=2)

    from cv_generator import generate_cvs
    results = generate_cvs()

    # Also generate cover letters for new jobs
    try:
        from cover_letter_generator import main as generate_cover_letters
        generate_cover_letters()
    except Exception as e:
        log.warning(f"Cover letter generation error: {e}")

    # ── Stage 7: Attach file refs + purge + save ──────────────────────────────
    print(f"\n🧹 STAGE 7: Purging expired jobs and saving tracker...")
    tracker = purge_expired(tracker)
    tracker = update_file_refs(tracker)
    save_tracker(tracker)

    # ── Done ──────────────────────────────────────────────────────────────────
    success_count = sum(1 for r in results if r.get("status") == "success")
    print(f"\n🎉 PIPELINE COMPLETE!")
    print(f"   {success_count}/{len(new_jobs)} new applications generated.")
    print(f"   Tracker: {TRACKER_FILE} ({len(tracker)} active jobs)")
    print(f"   Log: hr_assistant.log")
