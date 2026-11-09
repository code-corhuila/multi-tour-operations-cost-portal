// shortcut: one zone for every tenant of the course (spec 006 G-1); drop it when a tenant exposes its own zone.
export const TENANT_TIME_ZONE = 'America/Bogota';

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** The offset (ms) that `zone` has from UTC at the given instant. */
const offsetAt = (instant: number, zone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(instant / 1000) * 1000;
};

/** The wall clock of `zone` (`2026-12-01T08:00`) at an RFC 3339 instant; seconds and below are dropped. */
export function fromInstant(instant: string, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

/** Turns a wall clock of `zone` (`2026-12-01T08:00`) into an RFC 3339 instant in UTC (`2026-12-01T13:00:00Z`). */
export function toInstant(wallClock: string, zone: string): string {
  const m = WALL_CLOCK.exec(wallClock);
  if (!m) throw new Error(`Not a wall clock: ${wallClock}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(asUtc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59)
    throw new Error(`Not a wall clock: ${wallClock}`);
  // The offset is read at a first guess and again at the result, which settles the days the offset changes.
  const guess = asUtc - offsetAt(asUtc, zone);
  const instant = asUtc - offsetAt(guess, zone);
  return new Date(instant).toISOString().replace('.000Z', 'Z');
}
