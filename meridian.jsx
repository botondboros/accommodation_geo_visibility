import { useState, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = {
  bg: "#F8F7F4",
  card: "#FFFFFF",
  cardBorder: "rgba(0,0,0,0.08)",
  primary: "#1A6DD4",
  primaryMuted: "rgba(26,109,212,0.08)",
  accent: "#C67D15",
  accentMuted: "rgba(198,125,21,0.08)",
  green: "#1A8D5F",
  greenMuted: "rgba(26,141,95,0.08)",
  red: "#C43D3D",
  redMuted: "rgba(196,61,61,0.08)",
  text: "#1A1A1A",
  textMuted: "#6B7280",
  textDim: "#C5C7CB",
};

const fonts = `'Helvetica Neue', Helvetica, Arial, sans-serif`;
const serif = `Georgia, 'Times New Roman', serif`;

const INPUT_STYLE = {
  width: "100%", padding: "11px 14px", borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.1)", background: "#FAFAF8",
  color: COLORS.text, fontSize: 14, fontFamily: fonts, boxSizing: "border-box",
};

const LABEL_STYLE = {
  fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase",
  color: COLORS.textMuted, fontWeight: 600, display: "block", marginBottom: 8,
};

// ── Rules Engine (deterministic, zero API cost) ─────────────────────────
function runRulesEngine(responses, config) {
  const hotel = config.hotelName.toLowerCase();
  const competitors = config.competitors.map(c => c.toLowerCase()).filter(Boolean);
  const allNames = [hotel, ...competitors];
  const findings = [];
  const totalMentions = {};
  const firstMentions = {};
  const queryResults = [];

  allNames.forEach(n => { totalMentions[n] = 0; firstMentions[n] = 0; });

  responses.forEach(({ query, response }) => {
    const respLower = response.toLowerCase();
    const mentions = {};
    let earliest = { name: null, pos: Infinity };

    allNames.forEach(n => {
      const regex = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = response.match(regex);
      const count = matches ? matches.length : 0;
      mentions[n] = count;
      totalMentions[n] += count;

      const idx = respLower.indexOf(n);
      if (idx !== -1 && idx < earliest.pos) {
        earliest = { name: n, pos: idx };
      }
    });

    if (earliest.name) firstMentions[earliest.name]++;

    const recommended = /recommend|suggest|consider|great choice|excellent|top pick|standout|one of the best|highly rated|don't miss/i;
    const hotelRecommended = respLower.includes(hotel) && recommended.test(response);

    queryResults.push({ query, mentions, firstMention: earliest.name, hotelRecommended, response });
  });

  const totalHotelMentions = totalMentions[hotel] || 0;
  const totalAll = Object.values(totalMentions).reduce((s, v) => s + v, 0);
  const shareOfVoice = totalAll > 0 ? Math.round((totalHotelMentions / totalAll) * 100) : 0;
  const queriesWithMention = queryResults.filter(q => q.mentions[hotel] > 0).length;

  findings.push({
    source: "rule", cost: 0, confidence: 1.0,
    type: totalHotelMentions > 0 ? "positive" : "negative",
    title: totalHotelMentions > 0
      ? `Mentioned in ${queriesWithMention} of ${responses.length} queries`
      : "Not mentioned in any AI response",
    detail: totalHotelMentions > 0
      ? `"${config.hotelName}" appeared ${totalHotelMentions} time(s) with ${shareOfVoice}% share of voice across all responses.`
      : `"${config.hotelName}" was completely absent from AI recommendations for ${config.city}. Guests asking AI assistants for accommodation advice will never see your property.`,
  });

  const firstCount = firstMentions[hotel] || 0;
  if (totalHotelMentions > 0) {
    findings.push({
      source: "rule", cost: 0, confidence: 1.0,
      type: firstCount > 0 ? "positive" : "warning",
      title: firstCount > 0 ? `Listed first in ${firstCount} response(s)` : "Never listed first",
      detail: firstCount > 0
        ? `Your property was the first one named in ${firstCount} of ${responses.length} responses — strong top-of-mind positioning.`
        : `Your property was mentioned but never as the first recommendation. Competing properties consistently appear ahead of you.`,
    });
  }

  competitors.forEach(comp => {
    const compDisplay = config.competitors.find(c => c.toLowerCase() === comp) || comp;
    if ((totalMentions[comp] || 0) > totalHotelMentions) {
      findings.push({
        source: "rule", cost: 0, confidence: 1.0, type: "warning",
        title: `${compDisplay} has more mentions`,
        detail: `"${compDisplay}" was mentioned ${totalMentions[comp]} time(s) vs your ${totalHotelMentions}. They have stronger AI visibility for ${config.city} queries.`,
      });
    }
  });

  const recoCount = queryResults.filter(q => q.hotelRecommended).length;
  if (totalHotelMentions > 0) {
    findings.push({
      source: "rule", cost: 0, confidence: 0.9,
      type: recoCount > 0 ? "positive" : "warning",
      title: recoCount > 0 ? `Actively recommended in ${recoCount} response(s)` : "Mentioned but not recommended",
      detail: recoCount > 0
        ? `The AI didn't just mention your property — it actively recommended it with positive language.`
        : `Your property was mentioned, but the AI didn't use recommendation language. You're present but not endorsed.`,
    });
  }

  const sovData = [
    { name: config.hotelName, mentions: totalMentions[hotel] || 0, fill: COLORS.primary },
    ...competitors.map((c, i) => ({
      name: config.competitors.find(cn => cn.toLowerCase() === c) || c,
      mentions: totalMentions[c] || 0,
      fill: ["#7C3AED", "#C67D15", "#C43D3D"][i] || "#6B7280",
    }))
  ].sort((a, b) => b.mentions - a.mentions);

  return { findings, totalMentions, firstMentions, shareOfVoice, queryResults, sovData };
}

// ── API Calls ───────────────────────────────────────────────────────────
async function callClaude(systemPrompt, userPrompt) {
  const start = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  const data = await response.json();
  const latency = Date.now() - start;
  const text = data.content?.map(b => b.text || "").join("") || "";
  return { text, latency };
}

async function runDiscovery(config) {
  const queries = [
    `Where should I stay in ${config.city}? I'm looking for a ${config.hotelType} place.`,
    `What are the best places to stay in ${config.city} for ${config.guestType}?`,
    `I'm choosing between ${config.hotelName} and ${config.competitors[0] || "other places"} in ${config.city}. Which is better?`,
    `Recommend a ${config.hotelType} accommodation near ${config.neighborhood || config.city} with good reviews.`,
    `What accommodation should I book in ${config.city} if I want ${config.sellingPoint || "a great experience"}?`,
  ];

  const system = `You are a helpful travel assistant. Answer each accommodation query naturally and specifically. Mention real property names — do not make up fictional ones. Cover hotels, hostels, B&Bs, lodges, apartments, and other accommodation types as relevant. Give honest, balanced recommendations. For each query, respond in 2-4 sentences.

Return ONLY a valid JSON array: [{"query":"the question","response":"your answer"}]
No markdown, no backticks, no extra text.`;

  const user = queries.map((q, i) => `${i + 1}. ${q}`).join("\n");

  const { text, latency } = await callClaude(system, user);
  const clean = text.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error("Could not parse discovery responses");
  }
  return { responses: parsed, latency, queries };
}

async function runAIAnalysis(discoveryResponses, rulesFindings, config) {
  const system = `You are a hospitality brand visibility analyst specializing in GEO (Generative Engine Optimization). Analyze how a specific accommodation property appears in AI-generated travel recommendations. Return ONLY valid JSON, no markdown.`;

  const rulesSummary = rulesFindings.findings.map(f => `[${f.type}] ${f.title}: ${f.detail}`).join("\n");

  const user = `Analyze these AI-generated responses for the accommodation property "${config.hotelName}" in ${config.city}.

Property profile:
- Type: ${config.hotelType}
- Target guests: ${config.guestType}
- Key selling point: ${config.sellingPoint}
- Neighborhood: ${config.neighborhood || "N/A"}
- Competitors: ${config.competitors.filter(Boolean).join(", ")}

AI Responses collected: ${JSON.stringify(discoveryResponses)}

Rules engine already found:
${rulesSummary}

Now provide the deeper AI-powered analysis. Return JSON:
{
  "sentiment": "positive|neutral|negative",
  "sentimentDetail": "1 sentence explaining how the AI portrays this property",
  "positioning": "1 sentence summarizing the property's overall AI positioning vs competitors",
  "competitorInsights": [{"name":"competitor name","edge":"what they're doing better in AI visibility, 1 sentence"}],
  "contentGaps": ["specific content gap the property could fill to improve AI visibility — be very specific and actionable, e.g. 'No content about your rooftop terrace appears in AI responses — create a dedicated page'"],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "action": "specific, actionable recommendation",
      "reasoning": "why this would improve AI visibility",
      "category": "content|technical|strategic"
    }
  ]
}`;

  const { text, latency } = await callClaude(system, user);
  const clean = text.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error("Could not parse AI analysis");
  }
  return { analysis: parsed, latency };
}

// ── UI Components ───────────────────────────────────────────────────────
function Badge({ type, children }) {
  const colors = {
    rule: { bg: "rgba(26,109,212,0.06)", border: "rgba(26,109,212,0.2)", text: "#1A6DD4" },
    ai: { bg: "rgba(109,40,217,0.06)", border: "rgba(109,40,217,0.2)", text: "#6D28D9" },
    positive: { bg: COLORS.greenMuted, border: "rgba(26,141,95,0.25)", text: COLORS.green },
    negative: { bg: COLORS.redMuted, border: "rgba(196,61,61,0.25)", text: COLORS.red },
    warning: { bg: COLORS.accentMuted, border: "rgba(198,125,21,0.25)", text: COLORS.accent },
    high: { bg: COLORS.redMuted, border: "rgba(196,61,61,0.25)", text: COLORS.red },
    medium: { bg: COLORS.accentMuted, border: "rgba(198,125,21,0.25)", text: COLORS.accent },
    low: { bg: "rgba(26,109,212,0.06)", border: "rgba(26,109,212,0.2)", text: "#1A6DD4" },
    content: { bg: COLORS.greenMuted, border: "rgba(26,141,95,0.2)", text: COLORS.green },
    technical: { bg: "rgba(26,109,212,0.06)", border: "rgba(26,109,212,0.2)", text: "#1A6DD4" },
    strategic: { bg: COLORS.accentMuted, border: "rgba(198,125,21,0.2)", text: COLORS.accent },
  };
  const c = colors[type] || colors.rule;
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 100,
      fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase",
      background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontFamily: fonts,
    }}>{children}</span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
      borderRadius: 12, padding: "20px 22px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", ...style,
    }}>{children}</div>
  );
}

function ScoreCircle({ value, size = 88, label }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 60 ? COLORS.green : value >= 35 ? COLORS.accent : COLORS.red;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }} />
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
          fill={COLORS.text} fontSize={size * 0.26} fontWeight="700" fontFamily={fonts}
          style={{ transform: "rotate(90deg)", transformOrigin: "center" }}>{value}</text>
      </svg>
      {label && <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>{label}</span>}
    </div>
  );
}

function ProgressStep({ step, current, label, sublabel }) {
  const done = current > step;
  const active = current === step;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: done || active ? 1 : 0.35 }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        border: `2px solid ${done ? COLORS.green : active ? COLORS.primary : COLORS.textDim}`,
        background: done ? COLORS.greenMuted : active ? COLORS.primaryMuted : "transparent",
        color: done ? COLORS.green : active ? COLORS.primary : COLORS.textDim,
        fontSize: 13, fontWeight: 700, fontFamily: fonts, transition: "all 0.4s ease",
      }}>
        {done ? "✓" : step}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: active ? COLORS.text : done ? COLORS.green : COLORS.textDim }}>{label}</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 1 }}>{sublabel}</div>
      </div>
    </div>
  );
}

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{
      background: "#fff", border: `1px solid ${COLORS.cardBorder}`, boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
      borderRadius: 8, padding: "10px 14px", fontFamily: fonts, fontSize: 12, color: COLORS.text,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 3 }}>{d.name}</div>
      <div style={{ color: COLORS.textMuted }}>{d.mentions} mention{d.mentions !== 1 ? "s" : ""}</div>
    </div>
  );
};

// ── Main App ────────────────────────────────────────────────────────────
export default function Meridian() {
  const [phase, setPhase] = useState("setup");
  const [config, setConfig] = useState({
    hotelName: "Hotel Sacher",
    city: "Vienna",
    neighborhood: "Innere Stadt / Opera district",
    hotelType: "luxury",
    guestType: "couples and culture travelers",
    sellingPoint: "historic elegance and the famous Sachertorte",
    competitors: ["The Ritz-Carlton Vienna", "Park Hyatt Vienna", "Hotel Imperial"],
  });
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const timings = useRef({ discovery: 0, rules: 0, ai: 0 });

  const updateConfig = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateCompetitor = useCallback((idx, value) => {
    setConfig(prev => {
      const comps = [...prev.competitors];
      comps[idx] = value;
      return { ...prev, competitors: comps };
    });
  }, []);

  const analyze = useCallback(async () => {
    setPhase("analyzing");
    setProgress(1);
    setError(null);
    try {
      const disc = await runDiscovery(config);
      timings.current.discovery = disc.latency;
      setProgress(2);

      const rulesStart = Date.now();
      const rules = runRulesEngine(disc.responses, config);
      timings.current.rules = Date.now() - rulesStart;
      setProgress(3);

      const ai = await runAIAnalysis(disc.responses, rules, config);
      timings.current.ai = ai.latency;

      const aiFindings = [];
      if (ai.analysis.sentiment) {
        aiFindings.push({
          source: "ai", confidence: 0.85, cost: 0.003,
          type: ai.analysis.sentiment === "positive" ? "positive" : ai.analysis.sentiment === "negative" ? "negative" : "warning",
          title: `AI sentiment: ${ai.analysis.sentiment}`,
          detail: ai.analysis.sentimentDetail || "Analysis complete.",
        });
      }
      (ai.analysis.contentGaps || []).forEach(gap => {
        aiFindings.push({
          source: "ai", confidence: 0.78, cost: 0,
          type: "warning", title: "Content gap detected", detail: gap,
        });
      });

      const allFindings = [...rules.findings, ...aiFindings];

      const mentionScore = Math.min(rules.shareOfVoice * 1.5, 40);
      const sentimentScore = ai.analysis.sentiment === "positive" ? 35 : ai.analysis.sentiment === "neutral" ? 20 : 5;
      const firstMentionScore = ((rules.firstMentions[config.hotelName.toLowerCase()] || 0) / disc.responses.length) * 25;
      const visibilityScore = Math.min(100, Math.round(mentionScore + sentimentScore + firstMentionScore));

      setResults({
        discovery: disc.responses, rules, ai: ai.analysis, allFindings, visibilityScore,
        timings: { ...timings.current },
      });
      setPhase("results");
      setActiveTab("overview");
    } catch (err) {
      console.error(err);
      setError(err.message || "Analysis failed. Please try again.");
      setPhase("setup");
    }
  }, [config]);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: fonts }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        input::placeholder{color:${COLORS.textDim}}
        input:focus{outline:none;border-color:${COLORS.primary}!important;box-shadow:0 0 0 3px ${COLORS.primaryMuted}}
      `}</style>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "40px 24px 60px" }}>

        {/* Header */}
        <div style={{ marginBottom: phase === "setup" ? 40 : 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.primary }} />
            <span style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: COLORS.textMuted, fontWeight: 600 }}>Meridian</span>
          </div>
          <h1 style={{ fontFamily: serif, fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 700, margin: 0, lineHeight: 1.15 }}>
            Accommodation GEO Visibility<span style={{ color: COLORS.primary }}> Analyzer</span>
          </h1>
          {phase === "setup" && (
            <p style={{ fontSize: 14, color: COLORS.textMuted, marginTop: 10, maxWidth: 560, lineHeight: 1.7 }}>
              See how AI assistants recommend (or ignore) your property. Enter your property details — we'll query an LLM the way a real traveler would, then analyze the responses with a hybrid rules + AI engine.
            </p>
          )}
        </div>

        {/* ── SETUP ──────────────────────────────────────────────── */}
        {phase === "setup" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            {error && (
              <Card style={{ background: COLORS.redMuted, borderColor: "rgba(196,61,61,0.2)", marginBottom: 18, padding: "14px 18px" }}>
                <span style={{ fontSize: 13, color: COLORS.red }}>{error}</span>
              </Card>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 14 }}>
              <Card>
                <label style={LABEL_STYLE}>Your Property Name</label>
                <input value={config.hotelName} onChange={e => updateConfig("hotelName", e.target.value)}
                  placeholder="e.g. Hotel Goldener Hirsch, Alpine Chalet Zillertal" style={{ ...INPUT_STYLE, fontSize: 16, fontWeight: 500 }} />
                <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 6 }}>The exact name travelers would search for</div>
              </Card>
              <Card>
                <label style={LABEL_STYLE}>City</label>
                <input value={config.city} onChange={e => updateConfig("city", e.target.value)}
                  placeholder="e.g. Salzburg" style={{ ...INPUT_STYLE, fontSize: 16, fontWeight: 500 }} />
              </Card>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
              <Card>
                <label style={LABEL_STYLE}>Neighborhood</label>
                <input value={config.neighborhood} onChange={e => updateConfig("neighborhood", e.target.value)}
                  placeholder="e.g. Old Town" style={INPUT_STYLE} />
              </Card>
              <Card>
                <label style={LABEL_STYLE}>Property Type</label>
                <input value={config.hotelType} onChange={e => updateConfig("hotelType", e.target.value)}
                  placeholder="e.g. boutique hotel, ski lodge, hostel, B&B" style={INPUT_STYLE} />
              </Card>
              <Card>
                <label style={LABEL_STYLE}>Target Guests</label>
                <input value={config.guestType} onChange={e => updateConfig("guestType", e.target.value)}
                  placeholder="e.g. business travelers" style={INPUT_STYLE} />
              </Card>
            </div>

            <Card style={{ marginBottom: 14 }}>
              <label style={LABEL_STYLE}>Key Selling Point</label>
              <input value={config.sellingPoint} onChange={e => updateConfig("sellingPoint", e.target.value)}
                placeholder="What makes your property special? e.g. rooftop pool with city views" style={INPUT_STYLE} />
              <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 6 }}>
                We'll check if AI mentions this when recommending accommodations in your area
              </div>
            </Card>

            <Card style={{ marginBottom: 24 }}>
              <label style={LABEL_STYLE}>Local Competitors</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {config.competitors.map((c, i) => (
                  <input key={i} value={c} onChange={e => updateCompetitor(i, e.target.value)}
                    placeholder={`Nearby property ${i + 1}`} style={INPUT_STYLE} />
                ))}
              </div>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 6 }}>Other properties a guest might consider instead of yours</div>
            </Card>

            <button onClick={analyze} disabled={!config.hotelName || !config.city}
              style={{
                width: "100%", padding: "15px", borderRadius: 10, border: "none",
                background: config.hotelName && config.city ? `linear-gradient(135deg, ${COLORS.primary}, #1558A8)` : COLORS.textDim,
                color: "#fff", fontSize: 15, fontWeight: 600, fontFamily: fonts,
                cursor: config.hotelName && config.city ? "pointer" : "not-allowed", letterSpacing: 0.3,
              }}>
              Analyze My Property's AI Visibility →
            </button>

            <div style={{ display: "flex", gap: 24, justifyContent: "center", marginTop: 18, fontSize: 11, color: COLORS.textDim }}>
              <span>2 API calls</span><span>·</span><span>Hybrid rules + AI</span><span>·</span><span>~15 seconds</span>
            </div>
          </div>
        )}

        {/* ── ANALYZING ──────────────────────────────────────────── */}
        {phase === "analyzing" && (
          <Card style={{ animation: "fadeUp 0.4s ease", textAlign: "center", padding: "48px 32px" }}>
            <div style={{ marginBottom: 32, fontSize: 14, color: COLORS.textMuted }}>
              Analyzing AI visibility for <span style={{ color: COLORS.primary, fontWeight: 600 }}>{config.hotelName}</span> in {config.city}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 380, margin: "0 auto", textAlign: "left" }}>
              <ProgressStep step={1} current={progress} label="Traveler Simulation" sublabel="Asking AI what a real traveler would ask" />
              <ProgressStep step={2} current={progress} label="Rules Engine" sublabel="Counting mentions, position, share of voice" />
              <ProgressStep step={3} current={progress} label="AI Deep Analysis" sublabel="Sentiment, content gaps, recommendations" />
            </div>
            <div style={{ marginTop: 28, animation: "pulse 1.5s ease infinite", fontSize: 13, color: COLORS.textMuted }}>Processing...</div>
          </Card>
        )}

        {/* ── RESULTS ────────────────────────────────────────────── */}
        {phase === "results" && results && (
          <div style={{ animation: "fadeUp 0.5s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, flexWrap: "wrap", gap: 14 }}>
              <div>
                <span style={{ fontFamily: serif, fontSize: 20, fontWeight: 700 }}>{config.hotelName}</span>
                <span style={{ fontSize: 13, color: COLORS.textMuted }}> · {config.city}</span>
              </div>
              <button onClick={() => { setPhase("setup"); setResults(null); }}
                style={{
                  padding: "8px 18px", borderRadius: 8, border: `1px solid ${COLORS.cardBorder}`,
                  background: "#fff", color: COLORS.textMuted, fontSize: 12, fontFamily: fonts, cursor: "pointer", fontWeight: 500,
                }}>← New Analysis</button>
            </div>

            {/* Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 22 }}>
              <Card style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <ScoreCircle value={results.visibilityScore} size={68} />
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Visibility</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {results.visibilityScore >= 60 ? "Strong" : results.visibilityScore >= 35 ? "Moderate" : "Weak"}
                  </div>
                </div>
              </Card>
              <Card style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <ScoreCircle value={results.rules.shareOfVoice} size={68} />
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Share of Voice</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{results.rules.shareOfVoice}%</div>
                </div>
              </Card>
              <Card>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>AI Sentiment</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 22 }}>
                    {results.ai.sentiment === "positive" ? "👍" : results.ai.sentiment === "negative" ? "👎" : "➡️"}
                  </span>
                  <div style={{
                    fontSize: 14, fontWeight: 600, textTransform: "capitalize",
                    color: results.ai.sentiment === "positive" ? COLORS.green : results.ai.sentiment === "negative" ? COLORS.red : COLORS.accent,
                  }}>{results.ai.sentiment}</div>
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6, lineHeight: 1.5 }}>
                  {results.ai.sentimentDetail?.slice(0, 100)}{results.ai.sentimentDetail?.length > 100 ? "…" : ""}
                </div>
              </Card>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 2, marginBottom: 18, borderBottom: `1px solid ${COLORS.cardBorder}` }}>
              {[
                { id: "overview", label: "Overview" },
                { id: "queries", label: "Guest Queries" },
                { id: "actions", label: "Action Plan" },
                { id: "log", label: "Decision Log" },
              ].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  style={{
                    padding: "10px 18px", border: "none",
                    borderBottom: activeTab === t.id ? `2px solid ${COLORS.primary}` : "2px solid transparent",
                    background: "transparent", marginBottom: -1,
                    color: activeTab === t.id ? COLORS.primary : COLORS.textMuted,
                    cursor: "pointer", fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400, fontFamily: fonts,
                  }}>{t.label}</button>
              ))}
            </div>

            {/* Overview */}
            {activeTab === "overview" && (
              <div style={{ display: "grid", gap: 14 }}>
                <Card>
                  <div style={LABEL_STYLE}>Mention Count — Your Property vs Competitors</div>
                  <ResponsiveContainer width="100%" height={Math.max(120, results.rules.sovData.length * 42)}>
                    <BarChart data={results.rules.sovData} layout="vertical" barCategoryGap="28%">
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={160}
                        tick={{ fill: COLORS.text, fontSize: 12, fontFamily: fonts }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(26,109,212,0.04)" }} />
                      <Bar dataKey="mentions" radius={[0, 5, 5, 0]} maxBarSize={24}>
                        {results.rules.sovData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card>
                  <div style={LABEL_STYLE}>Key Findings</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {results.allFindings.map((f, i) => (
                      <div key={i} style={{
                        padding: "14px 16px", borderRadius: 8,
                        background: f.type === "positive" ? "rgba(26,141,95,0.04)" : f.type === "negative" ? "rgba(196,61,61,0.04)" : "rgba(198,125,21,0.04)",
                        border: `1px solid ${f.type === "positive" ? "rgba(26,141,95,0.12)" : f.type === "negative" ? "rgba(196,61,61,0.12)" : "rgba(198,125,21,0.12)"}`,
                      }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                          <Badge type={f.source}>{f.source === "rule" ? "Rules" : "AI"}</Badge>
                          <Badge type={f.type}>{f.type}</Badge>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{f.title}</span>
                        </div>
                        <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.6 }}>{f.detail}</div>
                      </div>
                    ))}
                  </div>
                </Card>

                {results.ai.positioning && (
                  <Card style={{ borderLeft: `3px solid ${COLORS.primary}` }}>
                    <div style={LABEL_STYLE}>AI Positioning Summary</div>
                    <div style={{ fontFamily: serif, fontSize: 15, fontStyle: "italic", lineHeight: 1.7 }}>
                      "{results.ai.positioning}"
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* Guest Queries */}
            {activeTab === "queries" && (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.6, marginBottom: 4 }}>
                  These are the queries we sent to the AI — simulating what a real traveler might ask when planning a trip to {config.city}.
                </div>
                {results.rules.queryResults.map((q, i) => (
                  <Card key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 200 }}>
                        <span style={{ color: COLORS.textDim, marginRight: 8 }}>Q{i + 1}</span>"{q.query}"
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        {q.hotelRecommended && <Badge type="positive">Recommended</Badge>}
                        {q.firstMention === config.hotelName.toLowerCase() && <Badge type="positive">1st Listed</Badge>}
                        {q.mentions[config.hotelName.toLowerCase()] === 0 && <Badge type="negative">Not Mentioned</Badge>}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 13, color: COLORS.textMuted, lineHeight: 1.7,
                      padding: "12px 14px", background: "#FAFAF8", borderRadius: 6,
                      borderLeft: `2px solid ${COLORS.textDim}`, marginBottom: 10,
                    }}>
                      {q.response}
                    </div>
                    <div style={{ display: "flex", gap: 14, fontSize: 11, flexWrap: "wrap" }}>
                      {Object.entries(q.mentions).map(([name, count]) => (
                        <span key={name} style={{ color: count > 0 ? COLORS.text : COLORS.textDim }}>
                          <span style={{
                            display: "inline-block", width: 7, height: 7, borderRadius: 2, marginRight: 5,
                            background: name === config.hotelName.toLowerCase() ? COLORS.primary : count > 0 ? COLORS.accent : COLORS.textDim,
                            verticalAlign: "middle",
                          }} />
                          {name}: {count}
                        </span>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Action Plan */}
            {activeTab === "actions" && (
              <div style={{ display: "grid", gap: 14 }}>
                {results.ai.contentGaps?.length > 0 && (
                  <Card>
                    <div style={LABEL_STYLE}>Content Gaps</div>
                    <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
                      Topics where AI has no information about your property — creating content here would directly improve your visibility.
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {results.ai.contentGaps.map((gap, i) => (
                        <div key={i} style={{
                          display: "flex", gap: 10, alignItems: "flex-start",
                          padding: "12px 14px", borderRadius: 8, background: "rgba(198,125,21,0.04)",
                          border: "1px solid rgba(198,125,21,0.12)",
                        }}>
                          <span style={{ color: COLORS.accent, fontSize: 14, flexShrink: 0, marginTop: 1 }}>◇</span>
                          <span style={{ fontSize: 13, lineHeight: 1.5 }}>{gap}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <Card>
                  <div style={LABEL_STYLE}>Prioritized Recommendations</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(results.ai.recommendations || [])
                      .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] || 1) - ({ high: 0, medium: 1, low: 2 }[b.priority] || 1))
                      .map((rec, i) => (
                        <div key={i} style={{
                          padding: "16px 18px", borderRadius: 10,
                          background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
                        }}>
                          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                            <Badge type={rec.priority}>{rec.priority}</Badge>
                            {rec.category && <Badge type={rec.category}>{rec.category}</Badge>}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5, lineHeight: 1.4 }}>{rec.action}</div>
                          <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.6 }}>{rec.reasoning}</div>
                        </div>
                      ))}
                  </div>
                </Card>

                {results.ai.competitorInsights?.length > 0 && (
                  <Card>
                    <div style={LABEL_STYLE}>What Competitors Do Better in AI</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {results.ai.competitorInsights.map((ci, i) => (
                        <div key={i} style={{
                          padding: "12px 14px", borderRadius: 8,
                          background: "rgba(109,40,217,0.03)", border: "1px solid rgba(109,40,217,0.1)",
                        }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{ci.name}: </span>
                          <span style={{ fontSize: 13, color: COLORS.textMuted }}>{ci.edge}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* Decision Log */}
            {activeTab === "log" && (
              <div style={{ display: "grid", gap: 14 }}>
                <Card>
                  <div style={LABEL_STYLE}>Pipeline Performance</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
                    {[
                      { label: "Discovery", ms: results.timings.discovery, color: COLORS.primary, bg: COLORS.primaryMuted },
                      { label: "Rules Engine", ms: results.timings.rules, color: COLORS.green, bg: COLORS.greenMuted },
                      { label: "AI Analysis", ms: results.timings.ai, color: "#6D28D9", bg: "rgba(109,40,217,0.06)" },
                    ].map(t => (
                      <div key={t.label} style={{
                        padding: "14px", borderRadius: 8, background: t.bg, textAlign: "center",
                        border: `1px solid ${t.color}22`,
                      }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: t.color }}>{t.ms}ms</div>
                        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{t.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{
                    padding: "14px 16px", borderRadius: 8, background: "#FAFAF8",
                    border: `1px solid ${COLORS.cardBorder}`, fontSize: 12, color: COLORS.textMuted, lineHeight: 1.8,
                  }}>
                    <strong style={{ color: COLORS.text }}>Architecture:</strong> 2 LLM calls (discovery + analysis) + 1 client-side rules engine pass.
                    Rules engine runs in {"<"}1ms at zero cost. AI layer invoked only for interpretive analysis that deterministic rules cannot handle.
                    Total cost: ~$0.006 per analysis.
                  </div>
                </Card>

                <Card>
                  <div style={LABEL_STYLE}>Full Decision Audit Trail</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr>
                          {["#", "Source", "Signal", "Finding", "Confidence", "Cost"].map(h => (
                            <th key={h} style={{
                              textAlign: "left", padding: "10px", borderBottom: `1px solid ${COLORS.cardBorder}`,
                              color: COLORS.textMuted, fontWeight: 600, fontSize: 10, letterSpacing: 1,
                              textTransform: "uppercase", whiteSpace: "nowrap",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.allFindings.map((f, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                            <td style={{ padding: "10px", color: COLORS.textDim }}>{i + 1}</td>
                            <td style={{ padding: "10px" }}><Badge type={f.source}>{f.source === "rule" ? "Rules" : "AI"}</Badge></td>
                            <td style={{ padding: "10px" }}><Badge type={f.type}>{f.type}</Badge></td>
                            <td style={{ padding: "10px", maxWidth: 380 }}>
                              <div style={{ fontWeight: 500, marginBottom: 2 }}>{f.title}</div>
                              <div style={{ color: COLORS.textMuted, lineHeight: 1.5 }}>{f.detail}</div>
                            </td>
                            <td style={{ padding: "10px", color: COLORS.textMuted, whiteSpace: "nowrap" }}>{(f.confidence * 100).toFixed(0)}%</td>
                            <td style={{ padding: "10px", color: COLORS.textMuted, whiteSpace: "nowrap" }}>{f.cost > 0 ? `$${f.cost.toFixed(4)}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
