import { describe, expect, it } from 'vitest';

// B·: the portal carries neither an HTTP client nor a gateway address (norm 5.4.1, RN-OPS-PT-06 and -43). It reads the
// sources as text because they are exactly the files that become the bundle, and a build inside a unit test is slow.
const sources = import.meta.glob(
  ['./mount.tsx', './ops/OperationsPage.tsx', './ops/fixtureGateway.ts', './ops/departure/*.ts', './ops/departure/*.tsx', '!./ops/departure/*.test.*', './ops/departures/*.ts', './ops/departures/*.tsx', '!./ops/departures/*.test.*'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

describe('portal sources (RN-OPS-PT-06 and -43)', () => {
  it('B·sources_have_no_fetch_no_token_and_no_gateway_url', () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(12);
    for (const text of Object.values(sources)) {
      expect(text).not.toMatch(/\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|https?:\/\//);
    }
  });

  // RN-OPS-PT-42: the departure fixture reaches the bundle only through a dynamic import behind the DEV flag.
  it('B·test_data_is_not_in_the_production_build: the departure fixture is imported dynamically behind DEV', () => {
    const mount = sources['./mount.tsx'];
    expect(mount).not.toMatch(/from ['"]\.\/ops\/departure\/fixture['"]/);
    expect(mount).toMatch(/import\.meta\.env\.DEV/);
    expect(mount).toMatch(/import\(['"]\.\/ops\/departure\/fixture['"]\)/);
    expect(mount).not.toMatch(/from ['"]\.\/ops\/departures\/fixture['"]/);
    expect(mount).toMatch(/import\(['"]\.\/ops\/departures\/fixture['"]\)/);
  });
});
