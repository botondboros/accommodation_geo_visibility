# 🤖 HR Assistant

> **An AI-powered job application pipeline that reads your LinkedIn alerts, scores every job against your profile, and generates tailored CVs + cover letters — automatically, every 48 hours.**

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)
![Claude API](https://img.shields.io/badge/Claude-Sonnet_4.6-D97706?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-22C55E?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?style=flat-square&logo=windows&logoColor=white)

---

## What It Does

Most job seekers spend hours manually reviewing listings, rewriting CVs, and crafting cover letters. This pipeline does it for you:

1. **Reads your Gmail** for LinkedIn job alert emails
2. **Scrapes each job posting** for the full description
3. **Scores every job** using Claude AI against your profile and preferences
4. **Generates a tailored CV** in `.docx` format for each match
5. **Writes a personalised cover letter** following strict content rules
6. **Tracks everything** in a live dashboard with 7-day expiry on unactioned jobs
7. **Runs automatically** every 48 hours via Windows Task Scheduler

---

## Pipeline Architecture

```
Gmail Inbox
    │
    ▼
┌─────────────────┐
│  gmail_reader   │  Fetches LinkedIn job alert emails (last 48h)
└────────┬────────┘
         │  raw job URLs + titles
         ▼
┌─────────────────┐
│  job_scraper    │  Scrapes full job descriptions from LinkedIn
└────────┬────────┘
         │  structured job data (jobs_detailed.json)
         ▼
┌─────────────────┐
│  job_filter     │  Claude AI scores each job 0–100 vs. your preferences
└────────┬────────┘
         │  matched jobs (score ≥ threshold)
         ▼
┌─────────────────┐
│  cv_generator   │  Claude generates tailored CV content per job
└────────┬────────┘
         │  DOCX files in cv_output/
         ▼
┌──────────────────────┐
│  cover_letter_       │  Claude writes 4-paragraph cover letters
│  generator           │  injected into .docx template
└────────┬─────────────┘
         │  DOCX files in cl_output/
         ▼
┌─────────────────┐
│  job_tracker    │  Updates job_tracker.json, purges expired jobs
└────────┬────────┘
         │
         ▼
    tracker.html     ← Open in browser, tracks application status
```

---

## Features

### 🎯 AI-Powered Scoring
Each job is scored 0–100 by Claude against your `preferences.yaml`:
- Role title match
- Seniority level
- Location preferences
- Industry fit
- Dealbreaker detection
- Suggested CV angle

### 📄 Tailored CV Generation
- Hardcoded real experience (no hallucination)
- Dynamically rewritten intro, title, and achievements per job
- Injected directly into a `.docx` template preserving all formatting
- Strict rules: no fabricated skills, no false claims

### ✉️ Cover Letter Generation
Four-paragraph structure enforced for every letter:
1. Profile intro (paraphrased, role-specific)
2. Recent AI & product experience (HTB, Google, merXu)
3. Secondary strength (leadership, certifications, CEE expertise)
4. What excites me about this specific opportunity

### 📋 Application Tracker
- Live HTML dashboard reading from `job_tracker.json`
- Per-job status: Not Applied → Applied → Interview → Offer / Rejected
- 7-day expiry countdown for unactioned jobs
- Notes and application URL per job
- Auto-purges jobs with no action after 7 days

### ⏰ Automated Scheduling
- Windows Task Scheduler integration (48-hour cadence)
- One-click setup via `setup_scheduler.bat`
- Incremental: only processes *new* jobs each run
- Preserves all existing statuses and notes

---

## File Structure

```
hr_assistant/
├── run_pipeline.py          # Main orchestrator — runs all stages
├── gmail_reader.py          # Stage 1: Gmail OAuth + email parsing
├── job_scraper.py           # Stage 2: LinkedIn job page scraper
├── job_filter.py            # Stage 3: Claude AI scoring engine
├── cv_generator.py          # Stage 4-5: CV content + DOCX injection
├── cover_letter_generator.py# Stage 6: Cover letter generation
│
├── preferences.yaml         # Your job preferences & scoring config
├── job_tracker.json         # Live tracker state (auto-generated)
├── tracker.html             # Application dashboard (open in browser)
├── setup_scheduler.bat      # One-click Windows Task Scheduler setup
│
├── templates/
│   ├── CV_template.docx     # Your CV template
│   └── CL_template.docx     # Your cover letter template
│
├── cv_output/               # Generated CV files
├── cl_output/               # Generated cover letter files
│
├── jobs_detailed.json       # Scraped job data (Stage 2 output)
├── jobs_matched.json        # Filtered matches (Stage 3 output)
├── jobs_rejected.json       # Rejected jobs with reasons
└── hr_assistant.log         # Full pipeline log
```

---

## Setup

### Prerequisites
- Python 3.10+
- An [Anthropic API key](https://console.anthropic.com)
- Gmail account with LinkedIn job alerts enabled
- Google Cloud project with Gmail API enabled (for OAuth)

### Installation

```bash
git clone https://github.com/yourusername/hr-assistant.git
cd hr-assistant
pip install anthropic pyyaml google-auth-oauthlib google-api-python-client playwright python-docx
playwright install chromium
```

### Configuration

**1. Set your API key:**
```bash
# Windows CMD
set ANTHROPIC_API_KEY=sk-ant-your-key-here

# Or add permanently via System Environment Variables
```

**2. Edit `preferences.yaml`:**
```yaml
your_profile: "15+ years in digital transformation, product management, AI deployment..."

target_roles:
  - "Director of Product"
  - "Head of Digital"
  - "AI Lead"
  - "Senior Product Manager"

seniority:
  - "Director"
  - "Head of"
  - "Senior"

minimum_score: 42

locations:
  preferred:
    - "Remote"
    - "Budapest"
    - "Vienna"
    - "Prague"
  excluded:
    - "On-site only outside Europe"

dealbreaker_keywords:
  - "requires 10+ years in"
  - "native German required"
```

**3. Add your templates:**
- Place your CV as `templates/CV_template.docx`
- Place your cover letter as `templates/CL_template.docx`
- The cover letter template needs a `<<COVER_LETTER_BODY>>` placeholder

**4. Gmail OAuth:**
- Download `credentials.json` from Google Cloud Console
- Place in project root
- First run will open a browser for OAuth consent

### Running

**Manual run:**
```bash
python run_pipeline.py
```

**Skip to scoring (if you already have scraped data):**
```bash
python run_pipeline.py --from-filter
```

**Skip to generation (if you already have matched jobs):**
```bash
python run_pipeline.py --from-generate
```

**Set up automated 48-hour scheduling:**
```bash
# Right-click setup_scheduler.bat → Run as administrator
```

---

## Tracker Dashboard

Open `tracker.html` in Chrome or Edge from the project folder. It reads `job_tracker.json` directly.

- Jobs expire after **7 days** with no action (auto-purged on next pipeline run)
- Only jobs discovered after **22 Feb 2026** are tracked (configurable via `CUTOFF_DATE` in `run_pipeline.py`)
- Status and notes are saved in browser `localStorage`

---

## Cost

Running the full pipeline on 90 jobs costs approximately:
| Stage | Cost |
|-------|------|
| Scoring 90 jobs | ~$0.15 |
| Generating 10 CVs | ~$0.80 |
| Generating 10 cover letters | ~$0.60 |
| **Total per run** | **~$1.55** |

At 48-hour intervals, roughly **~$3/week** or **~$12/month**.

---

## Customisation

### Changing the scoring threshold
Edit `preferences.yaml`:
```yaml
minimum_score: 42   # Lower = more matches, Higher = stricter filtering
```

### Changing the expiry window
Edit `run_pipeline.py`:
```python
EXPIRY_DAYS = 7   # Days before unactioned jobs are purged
```

### Changing the run frequency
Edit `setup_scheduler.bat`:
```batch
/sc DAILY /mo 2   # Every 2 days. Change to /mo 1 for daily.
```

---

## Limitations

- LinkedIn scraping may break if LinkedIn changes their HTML structure
- Requires a stable internet connection during pipeline runs
- Gmail OAuth token needs to be refreshed periodically
- Cover letter and CV quality depend on prompt tuning in your templates

---

## License

MIT — use freely, modify as needed, attribution appreciated.

---

*Built with [Claude](https://anthropic.com) · Runs on Python · Designed for senior professionals actively job searching*
