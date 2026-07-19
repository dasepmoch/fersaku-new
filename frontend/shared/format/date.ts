const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Formats ISO timestamps without depending on runtime timezone. */
export function formatLedgerDate(iso: string) {
  const match = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return iso;
  const day = Number(match[3]);
  const month = MONTHS_SHORT[Number(match[2]) - 1] || match[2];
  return `${day} ${month}, ${match[4]}:${match[5]}`;
}
