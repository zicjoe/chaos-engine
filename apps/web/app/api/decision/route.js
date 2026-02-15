let store = globalThis.__decisionStore;
if (!store) {
  store = new Map();
  globalThis.__decisionStore = store;
}

export async function POST(req) {
  const body = await req.json();
  const { metadataHash, decision } = body || {};
  if (!metadataHash || !decision) {
    return new Response(JSON.stringify({ ok: false, error: "missing fields" }), { status: 400 });
  }
  store.set(metadataHash.toLowerCase(), { decision, at: Date.now() });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

export async function GET(req) {
  const url = new URL(req.url);
  const key = (url.searchParams.get("hash") || "").toLowerCase();
  if (!key) return new Response(JSON.stringify({ ok: false, error: "missing hash" }), { status: 400 });

  const value = store.get(key);
  if (!value) return new Response(JSON.stringify({ ok: false, error: "not found" }), { status: 404 });

  return new Response(JSON.stringify({ ok: true, ...value }), { status: 200 });
}
