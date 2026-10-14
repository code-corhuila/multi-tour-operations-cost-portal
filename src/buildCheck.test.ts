import { describe, expect, it } from 'vitest';

// B·: the portal carries neither an HTTP client nor a gateway address (norm 5.4.1, RN-OPS-PT-06). It reads the sources
// as text because they are exactly the files that become the bundle, and a build inside a unit test is slow.
const sources = import.meta.glob(['./mount.tsx', './ops/OperationsPage.tsx', './ops/fixtureGateway.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('portal sources (RN-OPS-PT-06)', () => {
  it('B·sources_have_no_fetch_no_token_and_no_gateway_url', () => {
    expect(Object.keys(sources)).toHaveLength(3);
    for (const text of Object.values(sources)) {
      expect(text).not.toMatch(/\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|https?:\/\//);
    }
  });
});
