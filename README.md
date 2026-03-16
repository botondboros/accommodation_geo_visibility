# Accommodation GEO Visibility Analyzer

**How does AI see your hotel?** This tool analyzes how generative AI assistants (Claude, ChatGPT, Gemini) recommend — or ignore — your accommodation property. It simulates real traveler queries, then runs a hybrid rules + AI engine to surface visibility gaps, competitive positioning, and actionable recommendations.

> GEO (Generative Engine Optimization) is the emerging discipline of optimizing your brand's presence in AI-generated responses — the next frontier beyond traditional SEO.

---

## The Problem

Travelers increasingly ask AI assistants *"Where should I stay in Budapest?"* instead of searching Google. But accommodation operators have **zero visibility** into how these AI systems represent their properties:

- Does the AI even mention your hotel?
- When it does, is it the first recommendation or an afterthought?
- What does the AI say about your competitors that it doesn't say about you?
- What content gaps could you fill to improve your AI visibility?

**No existing tool answers these questions.** Traditional SEO tools don't cover generative engines. This tool fills that gap.

---

## Architecture

The tool uses a **hybrid rules + AI architecture** — a deliberate design choice that demonstrates when to use AI and when deterministic logic is the better tool.

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

---

## Features

- **Live LLM analysis** — Real API calls simulate actual traveler queries (not mocked data)
- **Visibility score** — Composite score (0–100) based on mention frequency, first-position rate, and AI sentiment
- **Share of voice** — Your property's mention count vs competitors as a percentage
- **Smart name matching** — 4-tier matching engine: exact → accent-insensitive → brand-word → strong-word.
- **Content gap detection** — AI identifies specific topics where your property has no presence in AI responses
- **Competitor benchmarking** — See what competitors do better in AI visibility and why
- **Action plan** — Prioritized recommendations tagged by category (content/technical/strategic)
- **Full decision audit trail** — Latency per phase, cost per finding, confidence scores, architecture transparency

---

## Quick Start

1. Open the live demo: **https://botondboros.github.io/accommodation_geo_visibility/**
2. Add one or more API keys: [Anthropic](https://console.anthropic.com/), [OpenAI](https://platform.openai.com/api-keys), [Google AI](https://aistudio.google.com/apikey)
3. Enter any accommodation property name and city
4. Add up to 3 local competitors
5. Click **Analyze** — the tool queries each enabled model with real traveler questions
6. Explore results across 4 tabs: Overview, Model Queries, Action Plan, Decision Log

> **Your API keys stay in your browser session only** — never stored, logged, or sent anywhere except directly to each provider's API. More models = richer cross-model comparison.

---

## Tech Stack

- **Frontend:** React 18 (via CDN), vanilla CSS-in-JS
- **AI:** Claude Sonnet, GPT-4o-mini, Gemini 2.5 Flash — BYOK (bring your own key), use one or all three
- **Rules Engine:** Pure JavaScript, client-side, zero dependencies
- **Deployment:** Single HTML file, no build step required

---

## Limitations & Production Considerations

This is a portfolio demonstration. A production version would need:

| Limitation | Production Solution |
|-----------|-------------------|
| Single run (non-deterministic) | Average results across 5–10 runs per model |
| 5 queries per analysis | 15–25 queries covering more traveler personas |
| No persistence | Database for tracking visibility over time |
| Client-side API calls | Backend proxy with rate limiting and key management |
| No authentication | User accounts, property management |
| BYOK required | Hosted backend with managed API keys |

