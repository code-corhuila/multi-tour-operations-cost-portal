// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// B·: the portal carries neither an HTTP client nor a gateway address (norm 5.4.1, RN-OPS-PT-06). It reads the sources
// because a build would be slow and these are exactly the files that become the bundle.
describe('portal sources (RN-OPS-PT-06)', () => {
  const sources = ['src/mount.tsx', 'src/ops/OperationsPage.tsx', 'src/ops/fixtureGateway.ts'];

  it('B·sources_have_no_fetch_no_token_and_no_gateway_url', () => {
    for (const file of sources) {
      expect(existsSync(file)).toBe(true);
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|https?:\/\//);
    }
  });
});
