// @vitest-environment node
// Norm 5.4.1 and Annex H: the portal never creates its own HTTP client, session or token, and holds no gateway address.
// The bundle is built in memory and read as text (spec 017, RN-OPS-PT-06 and -74).
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

// Hosts that React and the SVG namespace write as plain text; they are not an API address.
const HARMLESS_HOSTS = ['www.w3.org', 'react.dev', 'reactjs.org'];

const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['its own fetch call', /\bfetch\s*\(/],
  ['its own XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['an Authorization header', /\bAuthorization\b/i],
  ['a bearer token', /\bBearer\s/],
  ['a stored token', /(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem)\s*\(\s*['"`][^'"`]*(?:token|session)/i],
  ['a local address', /\blocalhost\b|127\.0\.0\.1/],
];

// Every finding of the bundle that breaks the rule, as readable text; an empty list is a clean bundle.
export function clientViolations(code: string): string[] {
  const found = FORBIDDEN.filter(([, pattern]) => pattern.test(code)).map(([name]) => name);
  for (const [url] of code.matchAll(/https?:\/\/[^\s"'`)\\]+/g)) {
    const host = new URL(url).host;
    if (!HARMLESS_HOSTS.includes(host)) found.push(`an absolute address (${host})`);
  }
  return [...new Set(found)];
}

describe('bundle without its own client (norm 5.4.1)', () => {
  it('B·detector_flags_a_client_a_token_and_an_address', () => {
    const bad = `fetch("/api/v1/x"); h.Authorization = "Bearer " + t; localStorage.setItem("accessToken", t); u = "http://gateway.example:8080/api"`;
    expect(clientViolations(bad)).toEqual([
      'its own fetch call',
      'an Authorization header',
      'a bearer token',
      'a stored token',
      'an absolute address (gateway.example:8080)',
    ]);
  });

  it('B·detector_accepts_relative_paths_and_the_svg_namespace', () => {
    const ok = `path = "/api/v1/operations-cost/departures/" + code + "/vehicles"; ns = "http://www.w3.org/2000/svg"`;
    expect(clientViolations(ok)).toEqual([]);
  });

  it('B·built_files_have_no_client_token_or_gateway_url', async () => {
    const result = await build({ logLevel: 'silent', build: { write: false } });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ('output' in r ? r.output : []));
    const code = outputs.map((o) => ('code' in o ? o.code : '')).join('\n');
    expect(code.length).toBeGreaterThan(0);
    expect(clientViolations(code)).toEqual([]);
  }, 120_000);
});
