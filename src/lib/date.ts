import { formatInTimeZone } from "date-fns-tz";
import { differenceInCalendarDays } from "date-fns";

export const APP_TIMEZONE = "America/New_York";

/** Format a UTC date for display in America/New_York. */
export function formatDate(
  date: Date | string | null | undefined,
  fmt = "MMM d, yyyy",
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return formatInTimeZone(d, APP_TIMEZONE, fmt);
}

/** Format a UTC datetime for display in America/New_York with time. */
export function formatDateTime(
  date: Date | string | null | undefined,
  fmt = "MMM d, yyyy h:mm a",
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatInTimeZone(d, APP_TIMEZONE, fmt)} ET`;
}

/** Whole-day age of a record (now - createdAt) in days. */
export function ageInDays(from: Date | string | null | undefined): number | null {
  if (!from) return null;
  const d = typeof from === "string" ? new Date(from) : from;
  if (Number.isNaN(d.getTime())) return null;
  return differenceInCalendarDays(new Date(), d);
}

/** Days until (positive) or since (negative) a date. */
export function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return differenceInCalendarDays(d, new Date());
}

/** True when an ETA is in the past. */
export function isOverdue(eta: Date | string | null | undefined): boolean {
  const days = daysUntil(eta);
  return days !== null && days < 0;
}

/**
 * Midday on the UTC day a date falls on — how a *day* is stored here.
 *
 * A day stored at midnight UTC reads as the day before once it's shown in New
 * York time: midnight UTC is 7pm the previous evening there, so a date typed
 * as the 2nd came back out of the page as the 1st. Midday is far enough from
 * both ends of the day to survive being read anywhere this business works,
 * and still slices back to the same yyyy-mm-dd for comparisons and for date
 * inputs.
 *
 * Only for dates that mean a day — an ETA, a ship date, a deadline. A
 * timestamp (when something happened) keeps its time of day.
 */
export function asDay(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

/** Parse a yyyy-mm-dd (from a date input) into that day. */
export function parseDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a Date for an <input type="date"> value (yyyy-mm-dd). */
export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return formatInTimeZone(d, "UTC", "yyyy-MM-dd");
}
