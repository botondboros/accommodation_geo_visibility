# Meridian — Accommodation GEO Visibility Analyzer

**How does AI see your hotel?** Meridian analyzes how generative AI assistants (ChatGPT, Claude, Perplexity) recommend — or ignore — your accommodation property. It simulates real traveler queries, then runs a hybrid rules + AI engine to surface visibility gaps, competitive positioning, and actionable recommendations.

> GEO (Generative Engine Optimization) is the emerging discipline of optimizing your brand's presence in AI-generated responses — the next frontier beyond traditional SEO.


---

## The Problem

Travelers increasingly ask AI assistants *"Where should I stay in Budapest?"* instead of searching Google. But accommodation operators have **zero visibility** into how these AI systems represent their properties:

- Does the AI even mention your hotel?
- When it does, is it the first recommendation or an afterthought?
- What does the AI say about your competitors that it doesn't say about you?
- What content gaps could you fill to improve your AI visibility?

**No existing tool answers these questions.** Traditional SEO tools don't cover generative engines. Meridian fills that gap.

---

## Architecture

Meridian uses a **hybrid rules + AI architecture** — a deliberate design choice that demonstrates when to use AI and when deterministic logic is the better tool.

```
┌─────────────────────────────────────────────────────┐
│                   USER INPUT                         │
│  Property name, city, type, competitors, USP         │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │   PHASE 1: DISCOVERY    │
          │   LLM API Call #1       │
          │                         │
          │  5 simulated traveler   │
          │  queries → AI responses │
          └────────────┬────────────┘
                       │
          ┌────────────▼────────────┐
          │  PHASE 2: RULES ENGINE  │
          │  Client-side, 0 API     │
          │                         │
          │  • Mention counting     │
          │  • First-position track │
          │  • Share of voice calc  │
          │  • Recommendation detect│
          │  • Competitor comparison │
          │                         │
          │  Cost: $0 | <1ms        │
          └────────────┬────────────┘
                       │
          ┌────────────▼────────────┐
          │  PHASE 3: AI ANALYSIS   │
          │  LLM API Call #2        │
          │                         │
          │  • Sentiment evaluation │
          │  • Content gap analysis │
          │  • Strategic recommen-  │
          │    dations              │
          │  • Competitor insights  │
          │                         │
          │  Only for interpretive  │
          │  analysis rules can't   │
          │  handle                 │
          └────────────┬────────────┘
                       │
          ┌────────────▼────────────┐
          │      RESULTS DASHBOARD  │
          │                         │
          │  Overview │ Queries │   │
          │  Action Plan │ Log      │
          │                         │
          │  Every finding tagged:  │
          │  Rules vs AI source,    │
          │  confidence, cost       │
          └─────────────────────────┘
```

### Why hybrid?

| Layer | What it handles | Why not AI? |
|-------|----------------|-------------|
| **Rules Engine** | Mention counting, share of voice, first-mention position, recommendation detection | Deterministic, instant, free, 100% reproducible, auditable |
| **AI Layer** | Sentiment interpretation, content gap identification, strategic recommendations | Requires contextual understanding that regex/rules can't provide |

The **Decision Log** tab exposes this split transparently — every finding shows its source (Rules vs AI), confidence score, and cost. This isn't just a product feature; it demonstrates architectural judgment about when AI is the right tool and when it isn't.

---

## Features

- **Live LLM analysis** — Real API calls simulate actual traveler queries (not mocked data)
- **Visibility score** — Composite score (0–100) based on mention frequency, first-position rate, and AI sentiment
- **Share of voice** — Your property's mention count vs competitors as a percentage
- **Smart name matching** — 4-tier matching engine: exact → accent-insensitive → brand-word → strong-word. Handles "Kempinski Budapest" matching "Kempinski Hotel Corvinus" and "Börzsöny Vendégház" matching "Borzsony Vendeghaz"
- **Content gap detection** — AI identifies specific topics where your property has no presence in AI responses
- **Competitor benchmarking** — See what competitors do better in AI visibility and why
- **Action plan** — Prioritized recommendations tagged by category (content/technical/strategic)
- **Full decision audit trail** — Latency per phase, cost per finding, confidence scores, architecture transparency

---

## Quick Start

1. Open `index.html` in any modern browser
2. Fill in your property details (pre-populated with a demo)
3. Click **Analyze My Property's AI Visibility**
4. Explore results across 4 tabs: Overview, Guest Queries, Action Plan, Decision Log

> **Note:** This runs as a Claude artifact using the Anthropic API within claude.ai. To run standalone, you'd need to add your own API key to the `callClaude()` function.

---

## Tech Stack

- **Frontend:** React 18 (via CDN), vanilla CSS-in-JS
- **AI:** Claude Sonnet (Anthropic API) — 2 calls per analysis
- **Rules Engine:** Pure JavaScript, client-side, zero dependencies
- **Deployment:** Single HTML file, no build step required

---

## Limitations & Production Considerations

This is a portfolio demonstration. A production version would need:

| Limitation | Production Solution |
|-----------|-------------------|
| Single LLM (Claude only) | Query ChatGPT, Gemini, Perplexe in parallel |
| Single run (non-deterministic) | Average results across 5–10 runs per model |
| 5 queries per analysis | 15–25 queries covering more traveler personas |
| No persistence | Database for tracking visibility over time |
| Client-side API calls | Backend proxy with rate limiting and key management |
| No authentication | User accounts, property management |

---

## About

Built as a portfolio project demonstrating system design, hybrid AI architecture, and production thinking for senior technical roles.

The core insight: **AI isn't always the answer.** The rules engine handles everything deterministic (counting, matching, comparing) at zero cost and 100% reliability. AI is reserved for what it's actually good at — interpretation and strategy. The Decision Log makes this architectural choice fully transparent and auditable.

---

## License

MIT
