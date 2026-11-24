"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, LayoutDashboard, MessageCircle, RotateCcw, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { slotKey } from "@/lib/availability";
import { deriveSession, hasLeadData } from "@/lib/crm";
import { MAX_HISTORY } from "@/lib/limits";
import type { Appointment, LeadProfile, LeadUIMessage } from "@/lib/types";
import { ChatPanel } from "./chat-panel";
import { CrmPanel } from "./crm-panel";
import { ThemeToggle } from "./theme-toggle";

const STORAGE = {
  messages: "oas:messages:v1",
  archive: "oas:archive:v1",
  latencies: "oas:latencies:v1",
} as const;

type Archive = {
  leads: (LeadProfile & { archivedAt: string })[];
  appointments: Appointment[];
};

const EMPTY_ARCHIVE: Archive = { leads: [], appointments: [] };

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the app keeps working in memory.
  }
}

/** Only the latest messages go to the API (the lead card carries older context). */
function trimHistory(messages: LeadUIMessage[]): LeadUIMessage[] {
  const recent = messages.slice(-MAX_HISTORY);
  while (recent.length > 0 && recent[0].role !== "user") recent.shift();
  return recent;
}

const transport = new DefaultChatTransport<LeadUIMessage>({
  prepareSendMessagesRequest: ({ messages, body }) => ({
    body: { ...body, messages: trimHistory(messages) },
  }),
});

function clientContext() {
  return {
    clientDate: new Date().toLocaleDateString("en-CA"), // YYYY-MM-DD in local time
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export default function Workspace() {
  const [initialMessages] = useState(() => readStorage<LeadUIMessage[]>(STORAGE.messages, []));
  const [archive, setArchive] = useState<Archive>(() => readStorage(STORAGE.archive, EMPTY_ARCHIVE));
  const [latencies, setLatencies] = useState<number[]>(() => readStorage(STORAGE.latencies, []));
  // Tool calls restored from storage shouldn't replay the "synced" animation.
  const [restoredEventIds] = useState(
    () => new Set(deriveSession(initialMessages).events.map((e) => e.id)),
  );
  const [mobileTab, setMobileTab] = useState<"chat" | "crm">("chat");
  const [seenEventId, setSeenEventId] = useState<string | null>(null);
  const sentAtRef = useRef<number | null>(null);

  const { messages, sendMessage, status, error, setMessages, stop, regenerate, clearError } =
    useChat<LeadUIMessage>({ messages: initialMessages, transport });

  const session = useMemo(() => deriveSession(messages), [messages]);
  const appointments = useMemo(
    () => [...archive.appointments, ...session.appointments],
    [archive.appointments, session.appointments],
  );

  const latestEvent = session.events.at(-1) ?? null;
  const freshEvent = latestEvent && !restoredEventIds.has(latestEvent.id) ? latestEvent : null;
  const isBusy = status === "submitted" || status === "streaming";

  // Persist the conversation once a response settles (not on every token).
  useEffect(() => {
    if (!isBusy) writeStorage(STORAGE.messages, messages);
  }, [messages, isBusy]);

  useEffect(() => writeStorage(STORAGE.archive, archive), [archive]);
  useEffect(() => writeStorage(STORAGE.latencies, latencies), [latencies]);

  // Response time = send → first streamed content (text or tool call) from Alex.
  useEffect(() => {
    if (sentAtRef.current === null) return;
    const last = messages.at(-1);
    if (last?.role !== "assistant") return;
    const hasContent = last.parts.some(
      (p) => (p.type === "text" && p.text.length > 0) || p.type.startsWith("tool-"),
    );
    if (!hasContent) return;
    const elapsed = performance.now() - sentAtRef.current;
    sentAtRef.current = null;
    setLatencies((prev) => [...prev.slice(-19), Math.round(elapsed)]);
  }, [messages]);

  const requestBody = useCallback(() => {
    return {
      ...clientContext(),
      bookedSlots: appointments.map((a) => slotKey(a.date, a.time)),
      lead: { ...session.lead, updatedAt: undefined }, // server schema doesn't need the timestamp
    };
  }, [appointments, session.lead]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isBusy) return;
      clearError();
      sentAtRef.current = performance.now();
      void sendMessage({ text: trimmed }, { body: requestBody() });
    },
    [clearError, isBusy, requestBody, sendMessage],
  );

  const retry = useCallback(() => {
    clearError();
    sentAtRef.current = performance.now();
    void regenerate({ body: requestBody() });
  }, [clearError, regenerate, requestBody]);

  const newLead = useCallback(() => {
    stop();
    setArchive((prev) => ({
      leads: hasLeadData(session.lead)
        ? [...prev.leads, { ...session.lead, archivedAt: new Date().toISOString() }]
        : prev.leads,
      appointments: [...prev.appointments, ...session.appointments],
    }));
    setMessages([]);
    setMobileTab("chat");
  }, [session.lead, session.appointments, setMessages, stop]);

  const resetAll = useCallback(() => {
    stop();
    setArchive(EMPTY_ARCHIVE);
    setLatencies([]);
    setMessages([]);
    setMobileTab("chat");
  }, [setMessages, stop]);

  const activeLeads = archive.leads.length + (hasLeadData(session.lead) ? 1 : 0);
  const avgLatency =
    latencies.length > 0 ? latencies.reduce((sum, ms) => sum + ms, 0) / latencies.length : null;
  const hasUnseenSync = freshEvent !== null && freshEvent.id !== seenEventId && mobileTab === "chat";

  const openTab = (tab: "chat" | "crm") => {
    setMobileTab(tab);
    if (tab === "crm" && latestEvent) setSeenEventId(latestEvent.id);
  };

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-950/80">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/30">
            <Bot className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
              Orbita <span className="text-emerald-600 dark:text-emerald-400">AI Sales Agent</span>
            </h1>
            <p className="hidden truncate text-xs text-zinc-500 sm:block dark:text-zinc-400">
              AI lead qualification & appointment setting · Real-time CRM sync
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={newLead}
              disabled={messages.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-40 sm:px-3 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              title="Save the current lead and start a new conversation"
            >
              <UserPlus className="size-4" aria-hidden />
              <span className="hidden sm:inline">New lead</span>
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              title="Reset workspace (clears chat, leads and appointments)"
              aria-label="Reset workspace"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
            <ThemeToggle />
          </div>
        </div>

        {/* Mobile tab switcher */}
        <div className="flex gap-1 px-4 pb-3 lg:hidden" role="tablist">
          {(
            [
              { id: "chat", label: "Chat", Icon: MessageCircle },
              { id: "crm", label: "Live CRM", Icon: LayoutDashboard },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mobileTab === id}
              onClick={() => openTab(id)}
              className={`relative flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
                mobileTab === id
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
              }`}
            >
              <Icon className="size-4" aria-hidden />
              {label}
              {id === "crm" && hasUnseenSync && (
                <span className="absolute right-3 top-2 size-2 animate-pulse rounded-full bg-emerald-500" />
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="grid flex-1 gap-4 p-4 lg:min-h-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6 lg:p-6">
        <section
          className={`${mobileTab === "chat" ? "flex" : "hidden"} min-w-0 h-[calc(100dvh-8.5rem)] min-h-[480px] flex-col lg:flex lg:h-auto lg:min-h-0`}
          aria-label="Chat"
        >
          <ChatPanel
            messages={messages}
            status={status}
            error={error}
            onSend={send}
            onRetry={retry}
            onStop={stop}
          />
        </section>

        <section
          className={`${mobileTab === "crm" ? "flex" : "hidden"} min-w-0 flex-col lg:flex lg:min-h-0 lg:overflow-y-auto`}
          aria-label="Live CRM"
        >
          <CrmPanel
            lead={session.lead}
            appointments={appointments}
            activeLeads={activeLeads}
            avgLatencyMs={avgLatency}
            lastLatencyMs={latencies.at(-1) ?? null}
            freshEvent={freshEvent}
            pendingTool={isBusy ? session.pendingTool : null}
          />
        </section>
      </main>
    </div>
  );
}
