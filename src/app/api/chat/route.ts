import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
} from "ai";
import { z } from "zod";
import { createAgentTools, INTEREST_LEVELS } from "@/lib/agent-tools";
import { MAX_HISTORY, MAX_USER_CHARS } from "@/lib/limits";
import { buildInstructions } from "@/lib/prompt";
import {
  checkRateLimit,
  getClientIp,
  isAllowedOrigin,
  sanitizeForPrompt,
  textError,
} from "@/lib/security";
import type { LeadProfile, LeadUIMessage } from "@/lib/types";

// Server-only configuration. Credentials (AI_GATEWAY_API_KEY or Vercel OIDC)
// are read by the AI Gateway provider on the server and never reach the client.
// Default chosen for: fast non-reasoning model, reliable tool calling, available on the AI Gateway free tier.
const MODEL = process.env.AI_MODEL ?? "openai/gpt-4.1-mini";

const MAX_ASSISTANT_TEXT_CHARS = 4_000;
const MAX_OUTPUT_TOKENS = 400;
const MAX_BODY_BYTES = 64_000;

const ASSISTANT_PART_TYPES = new Set([
  "text",
  "reasoning",
  "step-start",
  "tool-updateLeadProfile",
  "tool-checkAvailability",
  "tool-bookAppointment",
]);

/* ---------------------------- Request schema ---------------------------- */

const userMessageSchema = z
  .object({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z
      .array(z.object({ type: z.literal("text"), text: z.string().min(1).max(MAX_USER_CHARS) }))
      .min(1)
      .max(4),
  })
  .refine((m) => m.parts.reduce((n, p) => n + p.text.length, 0) <= MAX_USER_CHARS, {
    message: `User message exceeds ${MAX_USER_CHARS} characters`,
  });

// Assistant parts keep their extra fields (toolCallId, state, input, output…);
// tool parts are then deep-validated against the tool schemas below.
const assistantMessageSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.literal("assistant"),
  parts: z
    .array(
      z
        .looseObject({ type: z.string().max(64), text: z.string().max(MAX_ASSISTANT_TEXT_CHARS).optional() })
        .refine((p) => ASSISTANT_PART_TYPES.has(p.type), { message: "Unsupported message part" }),
    )
    .max(30),
});

const leadSchema = z
  .object({
    name: z.string().max(120),
    company: z.string().max(120),
    niche: z.string().max(120),
    needs: z.string().max(200),
    budget: z.string().max(80),
    budgetIsEstimate: z.boolean(),
    interestLevel: z.enum(INTEREST_LEVELS),
  })
  .partial();

const requestSchema = z.object({
  messages: z
    .array(z.discriminatedUnion("role", [userMessageSchema, assistantMessageSchema]))
    .min(1)
    .max(MAX_HISTORY)
    .refine((ms) => ms.at(-1)?.role === "user", { message: "Last message must come from the user" }),
  clientDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)))
    .optional(),
  timeZone: z.string().max(64).regex(/^[A-Za-z0-9_+\-/]+$/).optional(),
  bookedSlots: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/))
    .max(50)
    .optional(),
  lead: leadSchema.optional(),
});

function validTimeZone(tz: string | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function sanitizeLead(lead: z.infer<typeof leadSchema> | undefined): LeadProfile {
  if (!lead) return {};
  const clean: LeadProfile = { interestLevel: lead.interestLevel, budgetIsEstimate: lead.budgetIsEstimate };
  for (const key of ["name", "company", "niche", "needs", "budget"] as const) {
    const value = lead[key];
    if (value) clean[key] = sanitizeForPrompt(value, key === "needs" ? 200 : 120);
  }
  return clean;
}

/* -------------------------------- Errors -------------------------------- */

const ERRORS = {
  forbidden: "Origin not allowed.",
  tooLarge: "Your message is too long. The limit is 500 characters.",
  invalid: "I couldn't process that message. Please reload the page and try again.",
  internal: "Alex couldn't reply right now. Please try again.",
  quota: "The AI agent is temporarily unavailable (AI provider quota). Please try again later.",
  credentials: "The AI agent isn't configured in this environment.",
  toolInput: "Invalid tool parameters.",
} as const;

/** Maps any failure to a fixed, user-safe string. Details only go to server logs. */
function publicErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (/InvalidToolInput|NoSuchTool|ToolCallRepair/i.test(name)) return ERRORS.toolInput;
  if (/credit card|quota|insufficient|billing|rate limit/i.test(message)) return ERRORS.quota;
  if (/api key|unauthorized|authentication|oidc/i.test(message)) return ERRORS.credentials;
  return ERRORS.internal;
}

/* -------------------------------- Handler ------------------------------- */

export async function POST(req: Request) {
  try {
    // 1) Origin: only this site's own pages may call the API in production.
    if (!isAllowedOrigin(req)) return textError(403, ERRORS.forbidden);

    // 2) Rate limit per IP before doing any work.
    const limit = checkRateLimit(getClientIp(req));
    if (!limit.ok) {
      const wait =
        limit.scope === "minute"
          ? "You've sent a lot of messages in a row. Please wait a minute and try again."
          : `You've reached the hourly message limit. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} min.`;
      return textError(429, `⏳ ${wait}`, { "retry-after": String(limit.retryAfterSec) });
    }

    // 3) Bounded, strictly validated payload.
    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BODY_BYTES) return textError(413, ERRORS.tooLarge);
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return textError(413, ERRORS.tooLarge);

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return textError(400, ERRORS.invalid);
    }

    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      const tooLong = parsed.error.issues.some((i) => i.code === "too_big" && i.path.includes("text"));
      return textError(tooLong ? 413 : 400, tooLong ? ERRORS.tooLarge : ERRORS.invalid);
    }

    const { clientDate, timeZone, bookedSlots, lead } = parsed.data;
    const ctx = {
      clientDate: clientDate ?? new Date().toISOString().slice(0, 10),
      timeZone: validTimeZone(timeZone),
      bookedSlots: bookedSlots ?? [],
    };
    const tools = createAgentTools(ctx);

    // Deep-validate tool parts (inputs/outputs) against the real tool schemas.
    const validated = await safeValidateUIMessages<LeadUIMessage>({ messages: parsed.data.messages, tools });
    if (!validated.success) return textError(400, ERRORS.invalid);

    const history = validated.data;
    while (history.length > 0 && history[0].role !== "user") history.shift();

    const result = streamText({
      model: MODEL,
      instructions: buildInstructions(ctx, sanitizeLead(lead)),
      messages: await convertToModelMessages(history, { tools, ignoreIncompleteToolCalls: true }),
      tools,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      stopWhen: isStepCount(5),
      abortSignal: req.signal, // stop generating (and billing) if the visitor leaves
    });

    return createUIMessageStreamResponse({
      headers: { "cache-control": "no-store" },
      stream: toUIMessageStream({
        stream: result.stream,
        onError: (error) => {
          console.error("[api/chat] stream error:", error); // server logs only
          return publicErrorMessage(error);
        },
      }),
    });
  } catch (error) {
    console.error("[api/chat] request error:", error);
    return textError(500, ERRORS.internal);
  }
}
