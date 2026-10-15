import { describe, expect, it } from 'vitest';
import { effectiveCapacity, overlaps } from './capacity';

// Spec 005 PT-10 (RN-OPS-PT-52 and -53): the pure rules behind the list and the form.
describe('departure capacity rules', () => {
  it('U·effective_capacity_is_the_lower_value: the lower of the tour capacity and the vehicles', () => {
    expect(effectiveCapacity(12, [30], true)).toBe(12);
    expect(effectiveCapacity(30, [12, 10], true)).toBe(22);
    expect(effectiveCapacity(10, [12], true)).toBe(10);
  });

  it('U·effective_capacity_without_vehicles: a tour with transport has none, a tour without it keeps its own', () => {
    expect(effectiveCapacity(10, [], true)).toBe(0);
    expect(effectiveCapacity(8, [], false)).toBe(8);
  });

  it('U·overlapping_intervals_are_detected: touching intervals do not overlap', () => {
    const a = { start: '2026-10-18T08:00', end: '2026-10-18T14:00' };
    expect(overlaps(a, { start: '2026-10-18T13:59', end: '2026-10-18T16:00' })).toBe(true);
    expect(overlaps(a, { start: '2026-10-18T14:00', end: '2026-10-18T16:00' })).toBe(false);
    expect(overlaps(a, { start: '2026-10-17T08:00', end: '2026-10-17T14:00' })).toBe(false);
  });
});
