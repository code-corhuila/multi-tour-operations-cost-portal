// Converts the text the person typed into minor units without a float (0.07 * 100 is not 7). Colombian format:
// dots group thousands and the comma separates at most two decimals. Returns undefined for anything else or zero.
export function parseMoney(text: string): number | undefined {
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(text.trim());
  if (!match) return undefined;
  const units = Number(match[1].replace(/\./g, ''));
  const decimals = Number((match[2] ?? '').padEnd(2, '0'));
  const total = units * 100 + decimals;
  return total > 0 ? total : undefined;
}
