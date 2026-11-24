# Orbita AI Sales Agent

**Alex** is an AI sales agent that chats with prospects through a messaging-style widget, **qualifies** them, keeps a **live CRM** up to date and **books appointments**, all through function calling. No database required: state lives in memory and `localStorage`.

**Live:** https://orbita-ai-sales-agent.vercel.app

**Stack:** Next.js 16 (App Router) · Tailwind CSS v4 · Vercel AI SDK 7 (`ai`, `@ai-sdk/react`) · Zod 4 · Lucide Icons · Vercel AI Gateway

## How it works

```
Chat (useChat) ──POST /api/chat──▶ streamText + 3 tools (Zod)
     ▲                                   │
     └──── UI message stream ◀───────────┘  (tool parts: tool-updateLeadProfile, …)
                │
                ▼
   deriveSession(messages) → Lead Profile · Appointments · Metrics   (+ "Synced by AI" animation)
```

| Tool | What it does |
| --- | --- |
| `updateLeadProfile` | Extracts name, company, industry, need, budget (stated or estimated) and interest level (cold / warm / hot). |
| `checkAvailability` | Returns simulated, deterministic slots for tomorrow and the day after, based on the visitor's local date. |
| `bookAppointment` | Checks the slot is still free and books the call with date, time and a project summary. |

- The CRM panel is a **pure projection** of the chat's tool parts (`src/lib/crm.ts`): no effects, no duplicated state.
- Every request carries the browser's date, time zone and already-booked slots, so the server never offers a taken slot.
- Conversation, archived leads and metrics are stored in `localStorage`. "New lead" archives the current one; ↺ resets the workspace.
- "Response time" is measured client-side (send → first token or tool call).

## Security

- **Rate limiting** per IP on `/api/chat`: 15 messages/minute and 40/hour (HTTP 429 + `Retry-After`).
- **Strict Zod validation**: max 12 messages per request, 500 characters per user message, 64 KB body, allow-listed message parts and deep validation of tool parts.
- `maxOutputTokens: 400`; generation is aborted if the visitor disconnects.
- **Origin check** in production plus `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` headers.
- **Sanitized errors**: the client only gets fixed messages; details stay in server logs.
- Credentials are read server-side only (no `NEXT_PUBLIC_` variables).

## Local development

```bash
npm install
cp .env.example .env.local   # add your AI_GATEWAY_API_KEY
npm run dev
```

Get an API key from the Vercel dashboard → AI Gateway. Optional: set `AI_MODEL` to switch models (default `openai/gpt-4.1-mini`, chosen for latency and free-tier availability).

## Deploying to Vercel

1. Import the repo in Vercel (or run `vercel` in this folder).
2. On Vercel, AI Gateway authenticates **automatically via OIDC**; no key needed. Optionally add `AI_GATEWAY_API_KEY` under *Settings → Environment Variables*.
3. Deploy. No database or other services required.

## Project structure

```
src/
  app/api/chat/route.ts   streamText + tools, validation, rate limiting, safe errors
  app/layout.tsx          fonts, metadata, flash-free theme
  components/
    workspace.tsx         useChat, persistence, metrics, split-screen / mobile tabs
    chat-panel.tsx        chat widget, quick prompts, tool-call chips
    crm-panel.tsx         metrics, Lead Profile card, appointments table, sync animations
  lib/
    agent-tools.ts        the 3 tools defined with Zod
    availability.ts       deterministic simulated calendar
    crm.ts                derives CRM state from the messages
    prompt.ts             Alex's instructions
    security.ts           rate limiter, origin check, safe responses
    limits.ts             limits shared by client and server
    types.ts              LeadUIMessage typed with InferUITools
```
