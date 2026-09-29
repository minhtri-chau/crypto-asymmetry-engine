const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-sol";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    stance: { type: "string", enum: ["CONSTRUCTIVE","MIXED","CAUTIOUS","INSUFFICIENT_EVIDENCE"] },
    confidence: { type: "string", enum: ["LOW","MODERATE","HIGH"] },
    summary: { type: "string" },
    what_changed: { type: "array", items: { type: "string" }, maxItems: 5 },
    bull_case: { type: "array", items: { type: "string" }, maxItems: 5 },
    bear_case: { type: "array", items: { type: "string" }, maxItems: 5 },
    score_cautions: { type: "array", items: { type: "string" }, maxItems: 5 },
    thesis_break_watch: { type: "array", items: { type: "string" }, maxItems: 5 },
    next_evidence: { type: "array", items: { type: "string" }, maxItems: 5 },
    quant_ai_agreement: { type: "string", enum: ["AGREES","PARTIAL","DISAGREES","NOT_ENOUGH_DATA"] },
    qualitative_read: { type: "string" },
    source_conflicts: { type: "array", items: { type: "string" }, maxItems: 5 },
    historical_evidence_read: { type: "string" },
    historical_evidence_state: {
      type: "string",
      enum: ["SUPPORTIVE","MIXED","CAUTIONARY","INSUFFICIENT_EVIDENCE"]
    },
    historical_conflicts: { type: "array", items: { type: "string" }, maxItems: 5 },
    live_validation_read: { type: "string" },
    live_validation_state: { type: "string", enum: ["SUPPORTIVE","MIXED","CAUTIONARY","INSUFFICIENT_EVIDENCE"] },
    live_validation_conflicts: { type: "array", items: { type: "string" }, maxItems: 5 }
  },
  required: [
    "stance","confidence","summary","what_changed","bull_case","bear_case",
    "score_cautions","thesis_break_watch","next_evidence","quant_ai_agreement",
    "qualitative_read","source_conflicts",
    "historical_evidence_read","historical_evidence_state","historical_conflicts",
    "live_validation_read","live_validation_state","live_validation_conflicts"
  ]
};

async function verifyUser(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase server env is missing");
  const r = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: key }
  });
  if (!r.ok) return null;
  return await r.json();
}

function outputText(j) {
  if (typeof j.output_text === "string") return j.output_text;
  for (const item of j.output || []) {
    for (const c of item.content || []) {
      if (c.type === "output_text" && typeof c.text === "string") return c.text;
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const user = await verifyUser(req);
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
    // Sign-up is open, so "any signed-in user" is anyone. Only allow-listed accounts may spend the OpenAI key.
    const allowed = (process.env.AI_ALLOWED_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!allowed.length) return res.status(403).json({ error: "AI research is disabled until AI_ALLOWED_EMAILS is configured" });
    if (!allowed.includes(String(user.email || "").toLowerCase())) return res.status(403).json({ error: "This account is not allowed to run AI research" });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "OPENAI_API_KEY is not configured" });

    const packet = req.body?.packet;
    if (!packet?.asset?.symbol || !packet?.asset?.name) {
      return res.status(400).json({ error: "Missing research packet" });
    }
    // The packet is client-supplied; cap its size so one request cannot send an arbitrarily large prompt.
    // v9.4 adds ~20k characters of calibration evidence; a fully researched asset is ~60k, so allow 100k.
    if (JSON.stringify(packet).length > 100000) return res.status(413).json({ error: "Research packet is too large" });

    const instructions = `You are the AI Research Engine inside Crypto Asymmetry Engine.
Your job is to analyze the supplied structured evidence, not to issue trading instructions.
Keep deterministic scores separate from your qualitative judgment.
Never invent missing metrics, catalysts, token mechanics, or historical facts.
Treat missing evidence as uncertainty, not bearish evidence.
Look specifically for: hidden weaknesses in a high quant score, improving fundamentals not reflected in setup,
dilution/value-capture problems, regime dependence, and disagreement between current conditions and longer-lived thesis.
Historical outcomes are descriptive samples, not guaranteed probabilities.
Return concise research language. No BUY/SELL commands and no price targets.
"quant_ai_agreement" means whether the supplied deterministic thesis/setup/decision signal is directionally consistent
with your evidence-based assessment.
When packet.qualitative_intelligence exists, use it as sourced evidence. Preserve uncertainty,
distinguish protocol revenue from token-holder accrual, and flag conflicts between qualitative
evidence and deterministic metrics. Do not treat absence of qualitative evidence as negative evidence.
When packet.historical_evidence exists, treat it as empirical context, not a forecast.
Separate asset-specific evidence from cross-asset evidence.
A larger sample count does not make overlapping weekly observations independent.
Never convert historical frequencies or medians into a probability that the current asset will rise or fall.
Never claim causality from a cohort.
Do not cherry-pick only the best historical cohort. Discuss conflicting cohorts when material.
Confidence labels describe evidence quantity/breadth, not certainty of return.
Use the 7D, 30D and 90D horizons separately; do not blend them into one expected return.
Current fundamentals, qualitative evidence, token mechanics, catalysts and regime can make today's state materially different from historical analogs.
If historical evidence and current qualitative/fundamental evidence disagree, explicitly surface the disagreement.
INSUFFICIENT historical evidence must remain uncertainty, never positive or negative evidence.
Historical evidence does not authorize changing deterministic Setup, Thesis, Entry or Position thresholds.
packet.live_validation measures what actually happened after judgments this engine really recorded (Entry/Position signals and prior AI assessments). It is separate from historical replay; do not merge the two.
Small live samples are weak evidence. Positive rate is descriptive, never a probability.
Keep horizons separate, and keep Entry, Position and AI cohorts separate.
If live validation conflicts with historical or current evidence, surface the conflict explicitly.
Live validation never authorizes auto-tuning any threshold.
When packet.decision_context exists, critique the current practical posture against deterministic, qualitative, historical and live-validation evidence.
Hard predefined risk/profit rules and deterministic coverage gates have precedence over AI interpretation.
Do not issue an order, position size, price target, or probability of profit.
If you disagree with the posture, explain the evidence conflict and what observation would resolve it.
Historical q25/median/q75 values are scenario references, not forecasts.
Never average asset-specific and cross-asset cohorts into a fake precision estimate.
When packet.similarity_evidence exists, treat it as separate empirical context built only from point-in-time price/BTC replay features; it does not match historical fundamentals, catalysts, regime, qualitative evidence or AI state.
Similarity q25/median/q75 are historical neighbor outcomes, not forecast intervals. Walk-forward directional agreement is a diagnostic, not a probability.
Give similarity less weight when n is small, median distance is large, or walk-forward validation is weak. Never average similarity with cohort or live evidence; surface conflicts between them.`;

    const input = `Analyze this research packet. Compare current evidence with prior evaluations and matured signal outcomes when present.\n\n${JSON.stringify(packet)}`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        reasoning: { effort: "medium" },
        max_output_tokens: 8000,
        instructions,
        input,
        text: {
          format: {
            type: "json_schema",
            name: "ai_research_assessment",
            strict: true,
            schema
          }
        }
      })
    });

    // Read as text first: upstream errors are not always JSON (same failure mode fixed in v9.1.1 qualitative research).
    const bodyText = await r.text();
    let j = null;
    try { j = JSON.parse(bodyText); } catch {}
    if (!r.ok) {
      console.error("OpenAI API error", r.status, bodyText.slice(0, 1000));
      return res.status(502).json({ error: "AI research request failed", detail: j?.error?.message || `OpenAI returned HTTP ${r.status}` });
    }
    if (!j) return res.status(502).json({ error: "OpenAI returned an unexpected response" });
    const raw = outputText(j);
    if (!raw) return res.status(502).json({ error: "AI response contained no structured output" });
    let assessment;
    try { assessment = JSON.parse(raw); } catch { return res.status(502).json({ error: "AI returned invalid structured output" }); }
    return res.status(200).json({
      assessment,
      model: MODEL,
      model_version: "ai-research-v9.7",
      response_id: j.id || null,
      generated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "AI research failed" });
  }
}
