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
    source_conflicts: { type: "array", items: { type: "string" }, maxItems: 5 }
  },
  required: [
    "stance","confidence","summary","what_changed","bull_case","bear_case",
    "score_cautions","thesis_break_watch","next_evidence","quant_ai_agreement",
    "qualitative_read","source_conflicts"
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
    if (JSON.stringify(packet).length > 60000) return res.status(413).json({ error: "Research packet is too large" });

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
evidence and deterministic metrics. Do not treat absence of qualitative evidence as negative evidence.`;

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

    const j = await r.json();
    if (!r.ok) {
      console.error("OpenAI API error", j);
      return res.status(502).json({ error: "AI research request failed", detail: j?.error?.message || "Unknown upstream error" });
    }
    const raw = outputText(j);
    if (!raw) return res.status(502).json({ error: "AI response contained no structured output" });
    const assessment = JSON.parse(raw);
    return res.status(200).json({
      assessment,
      model: MODEL,
      model_version: "ai-research-v9.1",
      response_id: j.id || null,
      generated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "AI research failed" });
  }
}
