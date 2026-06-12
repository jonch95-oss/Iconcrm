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

/** Parse a yyyy-mm-dd (from a date input) into a UTC Date at midnight. */
export function parseDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a Date for an <input type="date"> value (yyyy-mm-dd). */
export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return formatInTimeZone(d, "UTC", "yyyy-MM-dd");
}
