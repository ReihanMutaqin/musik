export async function GET() {
  return Response.json({ ok: true, aiConfigured: Boolean(process.env.OPENROUTER_API_KEY) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
