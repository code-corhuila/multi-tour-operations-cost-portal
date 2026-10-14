import { describe, expect, it } from 'vitest';
import { parseMoney } from './money';

describe('parseMoney (RN-OPS-PT-20 to -26)', () => {
  it.each([
    ['1000', 100000],
    ['1.234,50', 123450],
    ['0,07', 7],
    ['12', 1200],
  ])('converts "%s" to %i minor units without floats', (text, cents) => {
    expect(parseMoney(text)).toBe(cents);
  });
  it.each(['', '0', '-5', 'abc', '1,234'])('rejects "%s"', (text) => {
    expect(parseMoney(text)).toBeUndefined();
  });
});
