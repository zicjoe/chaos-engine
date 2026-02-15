import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return Response.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 400 });
    }

    const body = await req.json();

    const client = new Anthropic({ apiKey: key });

    const prompt = `
You are an onchain risk assistant.
Return ONLY valid JSON with keys: action, tradeBps, confidence, explain.

Rules:
- action must be one of: HOLD, SWAP_WBNB_TO_USD, SWAP_USD_TO_WBNB
- tradeBps is an integer 0-6000
- confidence is integer 0-100
- explain is one short sentence.

Input:
strategy: ${body.strategy}
scenario: ${body.scenario}
shockPct: ${body.shockPct}
balances.wbnb: ${body.balances?.wbnb}
balances.usd: ${body.balances?.usd}
priceUsdPerWbnb: ${body.priceUsdPerWbnb}
`;

    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }]
    });

    const text = msg.content?.[0]?.type === "text" ? msg.content[0].text : "";
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      // fallback if model returns extra text
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      parsed = JSON.parse(text.slice(start, end + 1));
    }

    return Response.json({
      action: parsed.action,
      tradeBps: Number(parsed.tradeBps || 0),
      confidence: Number(parsed.confidence || 0),
      explain: String(parsed.explain || "")
    });
  } catch (e) {
    return Response.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
