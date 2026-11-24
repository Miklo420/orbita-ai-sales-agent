import type { Appointment, LeadProfile, LeadUIMessage, SyncEvent, ToolName } from "./types";

export type SessionState = {
  lead: LeadProfile;
  appointments: Appointment[];
  events: SyncEvent[];
  /** Tool currently being executed by the model (input streaming / running). */
  pendingTool: ToolName | null;
};

/**
 * The CRM state is a pure projection of the chat's tool parts:
 * every completed `updateLeadProfile` merges into the lead, every confirmed
 * `bookAppointment` adds a row. No effects, no duplicated state.
 */
export function deriveSession(messages: LeadUIMessage[]): SessionState {
  let lead: LeadProfile = {};
  const appointments: Appointment[] = [];
  const events: SyncEvent[] = [];
  let pendingTool: ToolName | null = null;

  for (const message of messages) {
    if (message.role !== "assistant") continue;

    for (const part of message.parts) {
      switch (part.type) {
        case "tool-updateLeadProfile": {
          if (part.state === "output-available") {
            const fields = Object.entries(part.input).filter(([, v]) => v !== undefined);
            lead = { ...lead, ...Object.fromEntries(fields), updatedAt: part.output.syncedAt };
            events.push({ id: part.toolCallId, tool: "updateLeadProfile", fields: fields.map(([k]) => k) });
          } else if (part.state === "input-streaming" || part.state === "input-available") {
            pendingTool = "updateLeadProfile";
          }
          break;
        }
        case "tool-checkAvailability": {
          if (part.state === "output-available") {
            events.push({ id: part.toolCallId, tool: "checkAvailability", fields: [] });
          } else if (part.state === "input-streaming" || part.state === "input-available") {
            pendingTool = "checkAvailability";
          }
          break;
        }
        case "tool-bookAppointment": {
          if (part.state === "output-available") {
            if (part.output.status === "confirmed") {
              const appt = part.output.appointment;
              appointments.push(appt);
              // Business rule: a lead with a booked call is hot, regardless of what the model sent.
              lead = {
                ...lead,
                name: lead.name ?? appt.leadName,
                company: lead.company ?? appt.company,
                interestLevel: "hot",
              };
              events.push({ id: part.toolCallId, tool: "bookAppointment", fields: [] });
            }
          } else if (part.state === "input-streaming" || part.state === "input-available") {
            pendingTool = "bookAppointment";
          }
          break;
        }
      }
    }
  }

  return { lead, appointments, events, pendingTool };
}

export function hasLeadData(lead: LeadProfile): boolean {
  return Boolean(lead.name || lead.company || lead.niche || lead.needs || lead.budget);
}

export function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
