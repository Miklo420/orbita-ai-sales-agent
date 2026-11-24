"use client";

import type { ChatStatus } from "ai";
import {
  CalendarCheck,
  CalendarClock,
  CheckCheck,
  CircleExclamationPoint,
  LoaderCircle,
  Send,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { formatDateLabel } from "@/lib/availability";
import { MAX_USER_CHARS } from "@/lib/limits";
import { AGENCY_NAME } from "@/lib/prompt";
import type { LeadUIMessage } from "@/lib/types";

const QUICK_PROMPTS = [
  "I want to automate my dental clinic",
  "I need an AI-powered website for my real estate agency",
  "What times are available tomorrow?",
];

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  company: "company",
  niche: "industry",
  needs: "need",
  budget: "budget",
  budgetIsEstimate: "budget",
  interestLevel: "interest",
};

type Props = {
  messages: LeadUIMessage[];
  status: ChatStatus;
  error: Error | undefined;
  onSend: (text: string) => void;
  onRetry: () => void;
  onStop: () => void;
};

export function ChatPanel({ messages, status, error, onSend, onRetry, onStop }: Props) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isBusy = status === "submitted" || status === "streaming";
  const last = messages.at(-1);
  const showTyping =
    status === "submitted" ||
    (status === "streaming" && last?.role === "assistant" && !last.parts.some((p) => p.type === "text"));

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const submit = (text: string) => {
    if (!text.trim() || isBusy) return;
    onSend(text);
    setInput("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white dark:bg-[#1f2c34]">
        <div className="relative">
          <div className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-teal-500 text-sm font-bold text-emerald-950">
            A
          </div>
          <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-[#075e54] bg-emerald-400 dark:border-[#1f2c34]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Alex · {AGENCY_NAME}</p>
          <p className="truncate text-xs text-emerald-100/90 dark:text-zinc-400">
            {isBusy ? "typing…" : "online · AI agent"}
          </p>
        </div>
        <span className="hidden items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium sm:inline-flex">
          <Sparkles className="size-3" aria-hidden />
          AI Sales Agent
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="chat-wallpaper min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="mx-auto mb-2 w-fit rounded-lg bg-white/80 px-3 py-1 text-[11px] text-zinc-500 shadow-sm dark:bg-zinc-800/80 dark:text-zinc-400">
          Messages are handled by an AI agent
        </div>

        <Bubble role="assistant">
          Hi there! 👋 I&apos;m Alex from {AGENCY_NAME}. We help businesses automate customer service and sales with AI.
          What would you like to improve in your business?
        </Bubble>

        {messages.map((message) => (
          <Fragment key={message.id}>
            {message.parts.map((part, i) => {
              const key = `${message.id}-${i}`;
              switch (part.type) {
                case "text":
                  return part.text.trim() ? (
                    <Bubble key={key} role={message.role === "user" ? "user" : "assistant"}>
                      <RichText text={part.text} />
                    </Bubble>
                  ) : null;

                case "tool-updateLeadProfile": {
                  if (part.state === "output-available") {
                    const fields = [
                      ...new Set(part.output.updatedFields.map((f) => FIELD_LABELS[f] ?? f)),
                    ];
                    return (
                      <ToolChip key={key} icon={<Sparkles className="size-3.5" />}>
                        CRM updated{fields.length > 0 && <> · {fields.join(", ")}</>}
                      </ToolChip>
                    );
                  }
                  if (part.state === "output-error") return <ToolChip key={key} error>Couldn&apos;t update the lead profile</ToolChip>;
                  return <ToolChip key={key} loading>Updating lead profile…</ToolChip>;
                }

                case "tool-checkAvailability": {
                  if (part.state === "output-available") {
                    const total = part.output.days.reduce((n, d) => n + d.slots.length, 0);
                    return (
                      <ToolChip key={key} icon={<CalendarClock className="size-3.5" />}>
                        Calendar checked · {total} open slots
                      </ToolChip>
                    );
                  }
                  if (part.state === "output-error") return <ToolChip key={key} error>Couldn&apos;t check the calendar</ToolChip>;
                  return <ToolChip key={key} loading>Checking calendar…</ToolChip>;
                }

                case "tool-bookAppointment": {
                  if (part.state === "output-available") {
                    if (part.output.status === "confirmed") {
                      const { date, time } = part.output.appointment;
                      return (
                        <ToolChip key={key} icon={<CalendarCheck className="size-3.5" />} success>
                          Appointment confirmed · {formatDateLabel(date, { weekday: "short", month: "short" })}, {time}
                        </ToolChip>
                      );
                    }
                    return <ToolChip key={key} error>Time slot unavailable</ToolChip>;
                  }
                  if (part.state === "output-error") return <ToolChip key={key} error>Couldn&apos;t book the appointment</ToolChip>;
                  return <ToolChip key={key} loading>Booking appointment…</ToolChip>;
                }

                default:
                  return null;
              }
            })}
          </Fragment>
        ))}

        {showTyping && (
          <div className="flex animate-msg-in justify-start">
            <div className="flex gap-1 rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm dark:bg-[#202c33]">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="size-1.5 animate-typing rounded-full bg-zinc-400"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mx-auto flex max-w-sm animate-msg-in items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-300">
            <CircleExclamationPoint className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p>{error.message || "Something went wrong."}</p>
              <button type="button" onClick={onRetry} className="mt-1 font-medium underline underline-offset-2">
                Try again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick prompts + input */}
      <div className="border-t border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="mb-2.5 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isBusy}
              onClick={() => submit(prompt)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/70 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
            >
              <Zap className="size-3" aria-hidden />
              {prompt}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message as if you were a customer…"
            aria-label="Message"
            maxLength={MAX_USER_CHARS}
            className="h-11 min-w-0 flex-1 rounded-full border border-zinc-200 bg-white px-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-700 dark:bg-zinc-950 dark:placeholder:text-zinc-500"
          />
          {input.length > MAX_USER_CHARS - 100 && (
            <span
              className={`shrink-0 text-xs tabular-nums ${input.length >= MAX_USER_CHARS ? "text-red-500" : "text-zinc-400"}`}
              aria-live="polite"
            >
              {input.length}/{MAX_USER_CHARS}
            </span>
          )}
          {isBusy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop response"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-zinc-800 text-white transition hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900"
            >
              <Square className="size-4 fill-current" aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-40"
            >
              <Send className="size-4" aria-hidden />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`flex animate-msg-in ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed shadow-sm ${
          isUser
            ? "rounded-tr-sm bg-[#d9fdd3] text-zinc-900 dark:bg-[#005c4b] dark:text-zinc-50"
            : "rounded-tl-sm bg-white text-zinc-900 dark:bg-[#202c33] dark:text-zinc-100"
        }`}
      >
        {children}
        {isUser && <CheckCheck className="ml-1.5 inline size-3.5 align-[-2px] text-sky-500" aria-label="Read" />}
      </div>
    </div>
  );
}

function ToolChip({
  children,
  icon,
  loading,
  success,
  error,
}: {
  children: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  success?: boolean;
  error?: boolean;
}) {
  const tone = error
    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
    : success
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
      : "border-zinc-200 bg-white/90 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-300";

  return (
    <div className="flex animate-msg-in justify-center">
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm ${tone}`}>
        {loading ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        ) : error ? (
          <CircleExclamationPoint className="size-3.5" aria-hidden />
        ) : (
          icon
        )}
        {children}
      </span>
    </div>
  );
}

/** Renders **bold** segments; everything else stays plain text. */
function RichText({ text }: { text: string }) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {segments.map((segment, i) =>
        segment.startsWith("**") && segment.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {segment.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{segment}</Fragment>
        ),
      )}
    </>
  );
}
