"""
job_filter.py
-------------
Stage 3: Uses Claude AI to score each scraped job against your preferences
and selects only the best matches for CV generation.
"""

import json
import os
import logging
import time
from pathlib import Path

import anthropic
import yaml

log = logging.getLogger(__name__)

INPUT_FILE = "jobs_detailed.json"
OUTPUT_FILE_MATCHED = "jobs_matched.json"
OUTPUT_FILE_REJECTED = "jobs_rejected.json"
PREFERENCES_FILE = "preferences.yaml"
MODEL = "claude-haiku-4-5-20251001"
REQUEST_DELAY = 3

def load_preferences(path: str = PREFERENCES_FILE) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        prefs = yaml.safe_load(f)
    log.info(f"Loaded preferences from {path}")
    return prefs


def build_preferences_summary(prefs: dict) -> str:
    lines = []
    if prefs.get("target_roles"):
        lines.append(f"Target roles: {', '.join(prefs['target_roles'])}")
    if prefs.get("seniority"):
        lines.append(f"Seniority levels: {', '.join(prefs['seniority'])}")
    if prefs.get("preferred_industries") and prefs["preferred_industries"] != [None]:
        lines.append(f"Preferred industries: {', '.join(prefs['preferred_industries'])}")
    if prefs.get("excluded_industries"):
        excl = [x for x in prefs["excluded_industries"] if x]
        if excl:
            lines.append(f"Excluded industries: {', '.join(excl)}")
    loc_pref = prefs.get("locations", {}).get("preferred", [])
    if loc_pref:
        lines.append(f"Preferred locations: {', '.join(loc_pref)}")
    loc_excl = prefs.get("locations", {}).get("excluded", [])
    loc_excl = [x for x in loc_excl if x]
    if loc_excl:
        lines.append(f"Excluded locations: {', '.join(loc_excl)}")
    if prefs.get("employment_type"):
        lines.append(f"Employment type: {', '.join(prefs['employment_type'])}")
    must = [x for x in prefs.get("must_have_keywords", []) if x]
    if must:
        lines.append(f"Must-have keywords: {', '.join(must)}")
    deal = [x for x in prefs.get("dealbreaker_keywords", []) if x]
    if deal:
        lines.append(f"Dealbreaker keywords: {', '.join(deal)}")
    return "\n".join(lines)


SCORING_PROMPT = """You are an expert career advisor helping a professional find the right job.

## Candidate Profile
{profile}

## Job Preferences
{preferences}

## Job Posting to Evaluate
**Title:** {title}
**Company:** {company}
**Location:** {location}
**Employment Type:** {employment_type}
**Seniority:** {seniority}
**Industry:** {industry}

**Full Job Description:**
{description}

---

## Your Task
Evaluate how well this job matches the candidate's profile and preferences.

Respond ONLY with valid JSON in exactly this format (no extra text, no markdown):
{{
  "score": <integer 0-100>,
  "recommendation": "<STRONG MATCH | GOOD MATCH | WEAK MATCH | NOT A FIT>",
  "title_match": <true|false>,
  "seniority_match": <true|false>,
  "location_match": <true|false>,
  "dealbreaker_found": <true|false>,
  "dealbreaker_reason": "<empty string or explanation>",
  "key_reasons": ["<reason 1>", "<reason 2>", "<reason 3>"],
  "concerns": ["<concern 1>", "<concern 2>"],
  "suggested_cv_angle": "<one sentence on how to angle the CV for this specific job>"
}}

Scoring guide:
- 85-100: Excellent fit, tailor-made for the candidate
- 70-84:  Good fit, worth applying with a targeted CV
- 50-69:  Partial fit, some mismatches but worth considering
- 0-49:   Poor fit, significant mismatches"""


def score_job_with_claude(client: anthropic.Anthropic, job: dict, prefs: dict) -> dict:
    criteria = job.get("criteria", {})
    preferences_text = build_preferences_summary(prefs)

    prompt = SCORING_PROMPT.format(
        profile=prefs.get("your_profile", "Senior professional seeking a leadership role."),
        preferences=preferences_text,
        title=job.get("title", "Unknown"),
        company=job.get("company", "Unknown"),
        location=job.get("location", "Unknown"),
        employment_type=criteria.get("employment_type", "Not specified"),
        seniority=criteria.get("seniority_level", "Not specified"),
        industry=criteria.get("industries", "Not specified"),
        description=(job.get("description", "") or "No description available.")[:3000]
    )

    MAX_RETRIES = 3
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}]
            )

            # ── Guard: empty response — retry ─────────────────────────────────
            if not response.content or len(response.content) == 0:
                if attempt < MAX_RETRIES:
                    log.warning(f"  Empty response for {job.get('title')} (attempt {attempt}/{MAX_RETRIES}), retrying in 5s...")
                    time.sleep(5)
                    continue
                raise ValueError("Claude returned an empty response after all retries")

            raw = response.content[0].text.strip()

            if not raw:
                if attempt < MAX_RETRIES:
                    log.warning(f"  Empty text for {job.get('title')} (attempt {attempt}/{MAX_RETRIES}), retrying in 5s...")
                    time.sleep(5)
                    continue
                raise ValueError("Claude returned empty text after all retries")

            # Strip ```json fences if present
            if "```" in raw:
                parts = raw.split("```")
                for part in parts:
                    part = part.strip()
                    if part.startswith("json"):
                        part = part[4:].strip()
                    if part.startswith("{"):
                        raw = part
                        break

            # Extract JSON object
            start = raw.find('{')
            end = raw.rfind('}')
            if start == -1 or end == -1:
                raise ValueError(f"No JSON found in response: {raw[:300]}")
            raw = raw[start:end+1]

            scoring = json.loads(raw)
            job["ai_scoring"] = scoring
            job["score"] = scoring.get("score", 0)
            job["recommendation"] = scoring.get("recommendation", "UNKNOWN")

            log.info(
                f"  Scored: {job.get('title')} @ {job.get('company')} - "
                f"{job['score']}/100 ({job['recommendation']})"
            )
            break  # success — exit retry loop

        except json.JSONDecodeError as e:
            log.error(f"  JSON parse error for {job.get('title')}: {e}")
            job["score"] = 0
            job["recommendation"] = "ERROR"
            job["ai_scoring"] = {"error": str(e)}
            break

        except Exception as e:
            log.error(f"  Claude API error for {job.get('title')}: {e}")
            job["score"] = 0
            job["recommendation"] = "ERROR"
            job["ai_scoring"] = {"error": str(e)}
            if attempt == MAX_RETRIES:
                break

    return job


def filter_jobs(
    input_file: str = INPUT_FILE,
    preferences_file: str = PREFERENCES_FILE,
    min_score: int = None
) -> tuple[list, list]:
    if not Path(input_file).exists():
        raise FileNotFoundError(f"{input_file} not found. Run job_scraper.py first.")

    with open(input_file, "r", encoding="utf-8") as f:
        jobs = json.load(f)

    log.info(f"Loaded {len(jobs)} jobs from {input_file}")

    prefs = load_preferences(preferences_file)
    threshold = min_score or prefs.get("minimum_score", 65)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set.\nRun: set ANTHROPIC_API_KEY=sk-ant-your-key-here")
    client = anthropic.Anthropic(api_key=api_key)

    matched = []
    rejected = []

    for i, job in enumerate(jobs):
        if job.get("scrape_status") != "success":
            log.warning(f"Skipping failed scrape: {job.get('url')}")
            rejected.append({**job, "skip_reason": "scrape_failed"})
            continue

        log.info(f"[{i+1}/{len(jobs)}] Scoring: {job.get('title')} @ {job.get('company')}")
        job = score_job_with_claude(client, job, prefs)

        scoring = job.get("ai_scoring", {})
        if scoring.get("dealbreaker_found"):
            log.info(f"  REJECTED (dealbreaker): {scoring.get('dealbreaker_reason')}")
            job["filter_decision"] = "rejected_dealbreaker"
            rejected.append(job)
        elif job["score"] >= threshold:
            log.info(f"  MATCHED (score {job['score']} >= {threshold})")
            job["filter_decision"] = "matched"
            matched.append(job)
        else:
            log.info(f"  REJECTED (score {job['score']} < {threshold})")
            job["filter_decision"] = "rejected_score"
            rejected.append(job)

        if i < len(jobs) - 1:
            time.sleep(REQUEST_DELAY)

    matched.sort(key=lambda x: x.get("score", 0), reverse=True)

    with open(OUTPUT_FILE_MATCHED, "w", encoding="utf-8") as f:
        json.dump(matched, f, indent=2, ensure_ascii=False)

    with open(OUTPUT_FILE_REJECTED, "w", encoding="utf-8") as f:
        json.dump(rejected, f, indent=2, ensure_ascii=False)

    log.info(f"\nFilter complete: {len(matched)} matched, {len(rejected)} rejected")
    return matched, rejected


def print_filter_summary(matched: list, rejected: list):
    total = len(matched) + len(rejected)
    print(f"\n{'='*65}")
    print(f"JOB FILTER RESULTS - {len(matched)} matched / {total} total")
    print(f"{'='*65}")

    if matched:
        print(f"\nMATCHED JOBS (sorted by score):\n")
        for i, job in enumerate(matched, 1):
            scoring = job.get("ai_scoring", {})
            print(f"  [{i}] {job.get('score', 0):>3}/100  {job.get('recommendation', '')}")
            print(f"       {job.get('title')} @ {job.get('company')}")
            print(f"       Location: {job.get('location', 'N/A')}")
            reasons = scoring.get("key_reasons", [])
            if reasons:
                print(f"       Reasons: {' | '.join(reasons[:2])}")
            concerns = scoring.get("concerns", [])
            if concerns:
                print(f"       Concern: {concerns[0]}")
            cv_angle = scoring.get("suggested_cv_angle", "")
            if cv_angle:
                print(f"       CV angle: {cv_angle}")
            print()
    else:
        print("\n  No jobs matched your preferences this week.")
        print("  Consider lowering 'minimum_score' in preferences.yaml")

    if rejected:
        print(f"\nREJECTED ({len(rejected)} jobs):")
        for job in rejected:
            reason = job.get("filter_decision", "")
            score = job.get("score", "N/A")
            dealbreaker = job.get("ai_scoring", {}).get("dealbreaker_reason", "")
            label = f"score {score}/100" if "score" in reason else dealbreaker or reason
            print(f"  - {job.get('title', '?')} @ {job.get('company', '?')} ({label})")

    print(f"\nFull results saved to: {OUTPUT_FILE_MATCHED} and {OUTPUT_FILE_REJECTED}")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler("hr_assistant.log"),
            logging.StreamHandler()
        ]
    )
    matched, rejected = filter_jobs()
    print_filter_summary(matched, rejected)
    print(f"\nNext step: run cv_generator.py to create tailored CVs for the {len(matched)} matched job(s).")
