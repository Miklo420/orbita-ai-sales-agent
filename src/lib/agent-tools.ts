import { tool } from "ai";
import { z } from "zod";
import { getAvailability, slotKey } from "./availability";

export type AgentContext = {
  clientDate: string; // visitor's local date, YYYY-MM-DD
  timeZone: string;
  bookedSlots: string[]; // "YYYY-MM-DDTHH:mm" already taken (from the browser's CRM state)
};

export const INTEREST_LEVELS = ["cold", "warm", "hot"] as const;
export type InterestLevel = (typeof INTEREST_LEVELS)[number];

/**
 * Tools run on the server. They don't touch a database: their validated
 * inputs/outputs stream to the browser as typed tool parts, and the CRM panel
 * derives its state from them (persisted in localStorage).
 */
export function createAgentTools(ctx: AgentContext) {
  // Slots booked during this request (multi-step) are blocked as well.
  const takenSlots = new Set(ctx.bookedSlots);

  return {
    updateLeadProfile: tool({
      description:
        "Updates the lead's CRM record in real time. Call it as soon as you learn a new detail or a detail changes. Send only new or changed fields.",
      inputSchema: z.object({
        name: z.string().optional().describe("Contact person's name"),
        company: z.string().optional().describe("Company or business name"),
        niche: z
          .string()
          .optional()
          .describe("Industry or niche, e.g. 'Dental clinic', 'Real estate'"),
        needs: z
          .string()
          .optional()
          .describe("One-sentence summary of what they need (max 120 characters)"),
        budget: z
          .string()
          .optional()
          .describe("Budget as a readable range, e.g. 'USD 3,000 – 6,000'"),
        budgetIsEstimate: z
          .boolean()
          .optional()
          .describe("true if you estimated the budget and the customer didn't state it"),
        interestLevel: z
          .enum(INTEREST_LEVELS)
          .optional()
          .describe("cold: just exploring · warm: clear need, no timeline · hot: urgent or wants to book"),
      }),
      execute: async (input) => ({
        ok: true as const,
        updatedFields: Object.keys(input).filter(
          (key) => input[key as keyof typeof input] !== undefined,
        ),
        syncedAt: new Date().toISOString(),
      }),
    }),

    checkAvailability: tool({
      description:
        "Checks open slots for a 30-minute discovery call (tomorrow and the day after tomorrow).",
      inputSchema: z.object({
        day: z
          .enum(["tomorrow", "day_after_tomorrow", "both"])
          .describe("Which day(s) to check. Use 'both' if the customer doesn't specify."),
      }),
      execute: async ({ day }) => {
        const days = getAvailability(ctx.clientDate, [...takenSlots]).filter(
          (d) =>
            day === "both" ||
            (day === "tomorrow" && d.dayLabel === "Tomorrow") ||
            (day === "day_after_tomorrow" && d.dayLabel === "Day after tomorrow"),
        );
        return { timeZone: ctx.timeZone, durationMinutes: 30, days };
      },
    }),

    bookAppointment: tool({
      description:
        "Books a confirmed appointment. Use it once the customer has picked an available slot and you know their name.",
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date in YYYY-MM-DD format"),
        time: z.string().regex(/^\d{2}:\d{2}$/).describe("Time in HH:mm format (24h)"),
        leadName: z.string().min(1).describe("Customer's name"),
        company: z.string().optional().describe("Customer's company or business"),
        projectSummary: z.string().min(1).describe("One-sentence project summary"),
      }),
      execute: async ({ date, time, leadName, company, projectSummary }) => {
        const availability = getAvailability(ctx.clientDate, [...takenSlots]);
        const day = availability.find((d) => d.date === date);

        if (!day || !day.slots.includes(time)) {
          return {
            status: "unavailable" as const,
            reason: day
              ? "That time slot is no longer available."
              : "Appointments can only be booked for tomorrow or the day after tomorrow.",
            alternatives: availability,
          };
        }

        takenSlots.add(slotKey(date, time));
        return {
          status: "confirmed" as const,
          appointment: {
            id: `APT-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
            date,
            time,
            timeZone: ctx.timeZone,
            leadName,
            company,
            projectSummary,
            createdAt: new Date().toISOString(),
          },
        };
      },
    }),
  };
}
