const MST_TIMEZONE = "America/Phoenix";

export function formatMST(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    timeZone: MST_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " MST";
}

export function formatMSTDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    timeZone: MST_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + " MST";
}

export function parseDateEndOfDayMST(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const endOfDayMST = new Date(`${y}-${m}-${d}T23:59:59-07:00`);
  if (isNaN(endOfDayMST.getTime())) return null;
  return endOfDayMST;
}
