"use client";

import {
  Briefcase,
  Building,
  CalendarCheck,
  CalendarX2,
  CircleCheck,
  Flame,
  LoaderCircle,
  Snowflake,
  Sparkles,
  Target,
  Thermometer,
  Timer,
  User,
  Users,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import type { InterestLevel } from "@/lib/agent-tools";
import { formatDateLabel } from "@/lib/availability";
import { initials } from "@/lib/crm";
import type { Appointment, LeadProfile, SyncEvent, ToolName } from "@/lib/types";

type Props = {
  lead: LeadProfile;
  appointments: Appointment[];
  activeLeads: number;
  avgLatencyMs: number | null;
  lastLatencyMs: number | null;
  freshEvent: SyncEvent | null;
  pendingTool: ToolName | null;
};

const PENDING_LABEL: Record<ToolName, string> = {
  updateLeadProfile: "AI writing to the CRM…",
  checkAvailability: "AI checking the calendar…",
  bookAppointment: "AI booking the appointment…",
};

export function CrmPanel({
  lead,
  appointments,
  activeLeads,
  avgLatencyMs,
  lastLatencyMs,
  freshEvent,
  pendingTool,
}: Props) {
  const leadSync = freshEvent?.tool === "updateLeadProfile" ? freshEvent : null;
  const bookingSync = freshEvent?.tool === "bookAppointment" ? freshEvent : null;
  const hotLeads = lead.interestLevel === "hot" ? 1 : 0;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {/* Panel title */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Live CRM &amp; Dashboard</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Updates automatically while Alex chats.</p>
        </div>
        <div className="flex h-7 items-center">
          {pendingTool ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              {PENDING_LABEL[pendingTool]}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
        <MetricCard
          icon={<Users className="size-4" />}
          label="Active leads"
          value={String(activeLeads)}
          hint={hotLeads ? `${hotLeads} hot right now` : "this session"}
        />
        <MetricCard
          icon={<CalendarCheck className="size-4" />}
          label="Booked calls"
          value={String(appointments.length)}
          hint="30-min discovery calls"
          flashKey={bookingSync?.id}
        />
        <MetricCard
          icon={<Timer className="size-4" />}
          label="Response time"
          value={avgLatencyMs === null ? "<2s" : `${(avgLatencyMs / 1000).toFixed(1)}s`}
          hint={
            lastLatencyMs === null
              ? "target < 2s"
              : `last ${(lastLatencyMs / 1000).toFixed(1)}s · target < 2s`
          }
          good={avgLatencyMs === null || avgLatencyMs < 2000}
        />
      </div>

      {/* Lead profile */}
      <Card
        title="Lead Profile"
        subtitle={lead.updatedAt ? `Updated ${timeAgo(lead.updatedAt)}` : "Waiting for conversation data"}
        icon={<User className="size-4" />}
        syncKey={leadSync?.id}
      >
        <div className="flex items-center gap-4">
          <div
            className={`grid size-14 shrink-0 place-items-center rounded-2xl text-lg font-semibold ${
              lead.name
                ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white"
                : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
            }`}
          >
            {initials(lead.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">
              {lead.name ?? <span className="text-zinc-400 dark:text-zinc-500">Anonymous lead</span>}
            </p>
            <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
              {[lead.company, lead.niche].filter(Boolean).join(" · ") || "Company and industry unknown yet"}
            </p>
          </div>
        </div>

        <InterestMeter
          level={lead.interestLevel}
          flashKey={leadSync?.fields.includes("interestLevel") ? leadSync.id : undefined}
        />

        <dl className="grid gap-2 sm:grid-cols-2">
          <Field
            icon={<User className="size-3.5" />}
            label="Name"
            value={lead.name}
            flashKey={flashFor(leadSync, "name")}
          />
          <Field
            icon={<Building className="size-3.5" />}
            label="Company / Industry"
            value={[lead.company, lead.niche].filter(Boolean).join(" · ") || undefined}
            flashKey={flashFor(leadSync, "company") ?? flashFor(leadSync, "niche")}
          />
          <Field
            icon={<Wallet className="size-3.5" />}
            label="Estimated budget"
            value={lead.budget}
            badge={lead.budget && lead.budgetIsEstimate ? "AI estimate" : undefined}
            flashKey={flashFor(leadSync, "budget")}
          />
          <Field
            icon={<Target className="size-3.5" />}
            label="Need"
            value={lead.needs}
            flashKey={flashFor(leadSync, "needs")}
          />
        </dl>
      </Card>

      {/* Appointments */}
      <Card
        title="Booked Appointments"
        subtitle={`${appointments.length} ${appointments.length === 1 ? "confirmed appointment" : "confirmed appointments"}`}
        icon={<CalendarCheck className="size-4" />}
        syncKey={bookingSync?.id}
      >
        {appointments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center dark:border-zinc-800">
            <CalendarX2 className="size-6 text-zinc-300 dark:text-zinc-600" aria-hidden />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No appointments booked yet.</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Ask for available times in the chat and pick one for Alex to book.
            </p>
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-2 font-medium sm:px-5">Date</th>
                  <th className="px-2 py-2 font-medium">Time</th>
                  <th className="px-2 py-2 font-medium">Client</th>
                  <th className="px-2 py-2 font-medium">Project</th>
                  <th className="px-4 py-2 text-right font-medium sm:px-5">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...appointments].reverse().map((appt, i) => (
                  <tr
                    key={appt.id}
                    className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800/70 ${
                      i === 0 && bookingSync ? "animate-row-in" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 first-letter:uppercase sm:px-5">
                      {formatDateLabel(appt.date, { weekday: "short", month: "short" })}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 font-mono text-[13px]">{appt.time}</td>
                    <td className="px-2 py-3">
                      <p className="font-medium">{appt.leadName}</p>
                      {appt.company && <p className="text-xs text-zinc-500 dark:text-zinc-400">{appt.company}</p>}
                    </td>
                    <td className="max-w-[220px] px-2 py-3 text-zinc-600 dark:text-zinc-300">
                      <p className="line-clamp-2">{appt.projectSummary}</p>
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                        <CircleCheck className="size-3" aria-hidden />
                        Confirmed
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="flex items-center gap-1.5 pb-2 text-xs text-zinc-400 dark:text-zinc-500">
        <Briefcase className="size-3.5" aria-hidden />
        Data is stored only in this browser (localStorage). No external database.
      </p>
    </div>
  );
}

function flashFor(event: SyncEvent | null, field: string): string | undefined {
  return event?.fields.includes(field) ? `${event.id}-${field}` : undefined;
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(iso).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
}

function Card({
  title,
  subtitle,
  icon,
  syncKey,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  syncKey?: string;
  children: ReactNode;
}) {
  return (
    <section className="relative rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
      {/* Remounted on every new tool call → replays the glow + badge animation */}
      {syncKey && (
        <>
          <div key={`ring-${syncKey}`} className="pointer-events-none absolute inset-0 animate-ring-flash rounded-2xl" />
          <span
            key={`badge-${syncKey}`}
            className="absolute right-4 top-4 z-10 inline-flex animate-sync-pop items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg shadow-emerald-600/25 sm:right-5 sm:top-5"
            role="status"
          >
            <Sparkles className="size-3" aria-hidden />
            Synced by AI
          </span>
        </>
      )}
      <header className="mb-4 flex items-center gap-2.5">
        <div className="grid size-8 place-items-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        </div>
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  good,
  flashKey,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  good?: boolean;
  flashKey?: string;
}) {
  return (
    <div className="relative min-w-0 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4 dark:border-zinc-800 dark:bg-zinc-950">
      {flashKey && (
        <div key={flashKey} className="pointer-events-none absolute inset-0 animate-ring-flash rounded-2xl" />
      )}
      <div className="flex items-start justify-between gap-2 text-zinc-500 dark:text-zinc-400">
        <span className="text-[11px] font-medium leading-tight sm:text-xs">{label}</span>
        <span className="hidden size-7 shrink-0 place-items-center rounded-lg bg-zinc-100 sm:grid dark:bg-zinc-800">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">{value}</p>
      <p
        className={`mt-0.5 text-[11px] leading-tight sm:text-xs ${
          good ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"
        }`}
      >
        {hint}
      </p>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  badge,
  flashKey,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  badge?: string;
  flashKey?: string;
}) {
  return (
    <div
      key={flashKey ?? label}
      className={`rounded-xl border border-zinc-100 px-3 py-2.5 dark:border-zinc-800/80 ${flashKey ? "animate-field-flash" : ""}`}
    >
      <dt className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        {icon}
        {label}
        {badge && (
          <span className="ml-auto rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {badge}
          </span>
        )}
      </dt>
      <dd className="mt-1 text-sm font-medium">
        {value ?? <span className="font-normal text-zinc-300 dark:text-zinc-600">— pending</span>}
      </dd>
    </div>
  );
}

const INTEREST: Record<InterestLevel, { label: string; icon: ReactNode; active: string }> = {
  cold: {
    label: "Cold",
    icon: <Snowflake className="size-3.5" />,
    active: "bg-sky-500 text-white border-sky-500",
  },
  warm: {
    label: "Warm",
    icon: <Thermometer className="size-3.5" />,
    active: "bg-amber-500 text-white border-amber-500",
  },
  hot: {
    label: "Hot",
    icon: <Flame className="size-3.5" />,
    active: "bg-red-500 text-white border-red-500",
  },
};

function InterestMeter({ level, flashKey }: { level?: InterestLevel; flashKey?: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-zinc-500 dark:text-zinc-400">Interest level</p>
      <div key={flashKey} className={`grid grid-cols-3 gap-1.5 rounded-xl ${flashKey ? "animate-field-flash" : ""}`}>
        {(Object.keys(INTEREST) as InterestLevel[]).map((key) => {
          const item = INTEREST[key];
          const isActive = level === key;
          return (
            <div
              key={key}
              className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-colors duration-500 ${
                isActive
                  ? item.active
                  : "border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-500"
              }`}
            >
              {item.icon}
              {item.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
