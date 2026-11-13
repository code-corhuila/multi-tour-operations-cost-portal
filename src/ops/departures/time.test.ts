import { describe, expect, it } from 'vitest';
import { TENANT_TIME_ZONE, toInstant } from './time';

describe('toInstant', () => {
  it('A·wall_clock_to_utc_in_bogota', () => {
    expect(TENANT_TIME_ZONE).toBe('America/Bogota');
    expect(toInstant('2026-12-01T08:00', TENANT_TIME_ZONE)).toBe('2026-12-01T13:00:00Z');
    expect(toInstant('2026-12-01T23:30', TENANT_TIME_ZONE)).toBe('2026-12-02T04:30:00Z');
  });

  it('A·wall_clock_to_utc_across_a_change_of_offset', () => {
    // Madrid moves its clocks on 2026-03-29 at 01:00 UTC (+01:00 before, +02:00 after).
    expect(toInstant('2026-03-28T08:00', 'Europe/Madrid')).toBe('2026-03-28T07:00:00Z');
    expect(toInstant('2026-03-29T01:30', 'Europe/Madrid')).toBe('2026-03-29T00:30:00Z');
    expect(toInstant('2026-03-29T08:00', 'Europe/Madrid')).toBe('2026-03-29T06:00:00Z');
    // ...and back on 2026-10-25 at 01:00 UTC.
    expect(toInstant('2026-10-24T08:00', 'Europe/Madrid')).toBe('2026-10-24T06:00:00Z');
    expect(toInstant('2026-10-25T08:00', 'Europe/Madrid')).toBe('2026-10-25T07:00:00Z');
  });

  it('A·an_hour_that_does_not_exist_or_repeats_resolves_the_same_way_every_time', () => {
    // Gap: 02:30 on 2026-03-29 never happened in Madrid; it moves forward (03:30 local = 01:30Z).
    expect(toInstant('2026-03-29T02:30', 'Europe/Madrid')).toBe('2026-03-29T01:30:00Z');
    // Overlap: 02:30 on 2026-10-25 happened twice; the second one (01:30Z) is taken.
    expect(toInstant('2026-10-25T02:30', 'Europe/Madrid')).toBe('2026-10-25T01:30:00Z');
    expect(toInstant('2026-10-25T03:00', 'Europe/Madrid')).toBe('2026-10-25T02:00:00Z');
  });

  it('A·midnight_and_leap_days', () => {
    expect(toInstant('2026-12-01T00:00', TENANT_TIME_ZONE)).toBe('2026-12-01T05:00:00Z');
    expect(toInstant('2028-02-29T10:00', TENANT_TIME_ZONE)).toBe('2028-02-29T15:00:00Z');
  });

  it('A·a_wall_clock_that_is_not_a_date_is_refused', () => {
    for (const bad of ['tomorrow', '2026-13-01T08:00', '2026-02-30T08:00', '2026-02-29T08:00', '2026-04-31T08:00',
      '2026-12-01T24:00', '2026-12-01T23:60', '0050-01-01T00:00', '2026-12-01T08:00:00']) {
      expect(() => toInstant(bad, TENANT_TIME_ZONE), bad).toThrow();
    }
  });
});
