import { getModelCandidates } from "@/lib/ai/models";
import { REIA_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";

export const runtime = "edge";

type SafeMessage = { role: "user" | "assistant"; content: string };
type RateEntry = { count: number; resetAt: number };

const rateWindow = new Map<string, RateEntry>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;

function clientId(request: Request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
}

function isRateLimited(id: string) {
  const now = Date.now();
  const current = rateWindow.get(id);
  if (!current || current.resetAt < now) {
    rateWindow.set(id, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS;
}

function validateMessages(input: unknown): SafeMessage[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > 24) return null;
  const messages: SafeMessage[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    if ((candidate.role !== "user" && candidate.role !== "assistant") || typeof candidate.content !== "string") return null;
    const content = candidate.content.trim();
    if (!content || content.length > 4000) return null;
    messages.push({ role: candidate.role, content });
  }
  return messages.slice(-16);
}

function friendlyError(status = 503) {
  return Response.json({ error: "Robotnya lagi susah nyambung. Coba sekali lagi ya." }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (isRateLimited(clientId(request))) {
    return Response.json({ error: "Bentar ya, pesannya datang terlalu cepat. Coba lagi sebentar." }, { status: 429 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return friendlyError();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return friendlyError(400);
  }

  const messages = validateMessages((body as { messages?: unknown })?.messages);
  if (!messages) return friendlyError(400);

  const models = getModelCandidates();
  let upstream: Response | null = null;
  let upstreamAbort: AbortController | null = null;
  let upstreamTimeout: ReturnType<typeof setTimeout> | null = null;
  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://reihan.online",
          "X-Title": "Reihan.online — REIA",
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [{ role: "system", content: REIA_SYSTEM_PROMPT }, ...messages],
          temperature: 0.72,
          max_tokens: 900,
        }),
        signal: controller.signal,
      });
      if (response.ok && response.body) {
        upstream = response;
        upstreamAbort = controller;
        upstreamTimeout = timeout;
        break;
      }
      clearTimeout(timeout);
    } catch {
      clearTimeout(timeout);
    }
  }

  if (!upstream?.body) return friendlyError();

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (upstreamTimeout) clearTimeout(upstreamTimeout);
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:") || trimmed === "data: [DONE]") continue;
          try {
            const payload = JSON.parse(trimmed.slice(5).trim()) as {
              choices?: Array<{ delta?: { content?: string } }>;
              error?: { message?: string };
            };
            const text = payload.choices?.[0]?.delta?.content;
            if (text) controller.enqueue(encoder.encode(text));
          } catch {
            // Ignore incomplete/non-data SSE lines.
          }
        }
      } catch {
        controller.error(new Error("stream_failed"));
      }
    },
    cancel() {
      if (upstreamTimeout) clearTimeout(upstreamTimeout);
      upstreamAbort?.abort();
      reader.cancel().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
