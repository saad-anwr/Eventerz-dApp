/**
 * Formatting helpers — ported from the web app's `lib/format.ts` so dates and
 * addresses read identically on both platforms. Dependency-free by design.
 */

/** Stable unique id. Hermes lacks `crypto.randomUUID`, hence the fallback. */
export function uid(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  const id = `${rand}${time}`;
  return prefix ? `${prefix}_${id}` : id;
}

/** "just now" · "4m" · "2h" · "3d" · "12 Aug" — compact relative time. */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(ts).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
}

/** Clock time — "6:42 PM". */
export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Full timestamp — "14 Aug 2026, 6:42 PM". */
export function fullTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Timeline separator — "Today" · "Yesterday" · "Thu, 14 Aug". */
export function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Event date — "Thu, Aug 14 · 6:00 PM". */
export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

/** Long event date — "Thursday, 14 August 2026". */
export function formatEventDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Time window — "6:00 PM – 9:30 PM" (start only when there is no end). */
export function formatEventTimeRange(startIso: string, endIso?: string): string {
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const start = fmt(new Date(startIso));
  if (!endIso) return start;
  return `${start} – ${fmt(new Date(endIso))}`;
}

/** Calendar-tile parts — `{ month: "AUG", day: "14" }`. */
export function eventDateParts(iso: string): { month: string; day: string } {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
  };
}

/** Countdown to an event — "in 3 days" · "in 4h" · "Live now" · "Ended". */
export function countdownLabel(startIso: string, endIso?: string): string {
  const now = Date.now();
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : start + 3 * 60 * 60 * 1000;
  if (now >= start && now <= end) return 'Live now';
  if (now > end) return 'Ended';
  const diff = start - now;
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'in 1 day' : `in ${days} days`;
}

export function isUpcoming(iso: string): boolean {
  return new Date(iso).getTime() > Date.now();
}

/** Truncate a wallet address — "9xQe…4dRt". */
export function shortenAddress(address?: string | null, chars = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/** Compact counts — 1200 → "1.2K", 480000 → "480K". */
export function compactNumber(value: number): string {
  if (Math.abs(value) < 1000) return String(value);
  if (Math.abs(value) < 1_000_000) {
    const n = value / 1000;
    return `${n % 1 === 0 ? n : n.toFixed(1)}K`;
  }
  const n = value / 1_000_000;
  return `${n % 1 === 0 ? n : n.toFixed(1)}M`;
}

/** SOL amount with the ◎ glyph — "◎ 1.84". */
export function formatSol(amount: number, fractionDigits = 2): string {
  return `◎ ${amount.toFixed(fractionDigits)}`;
}

/** "Free" stays "Free"; anything else keeps its unit. */
export function isFree(price: string): boolean {
  return price.trim().toLowerCase() === 'free';
}

/** Percentage of an event's capacity that is filled, clamped to 0–100. */
export function fillPercent(attendees: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.round((attendees / capacity) * 100));
}

/** Pluralise without a dependency — `plural(1, "spot")` → "1 spot". */
export function plural(count: number, singular: string, suffix = 's'): string {
  return `${count} ${singular}${count === 1 ? '' : suffix}`;
}
