import { describe, expect, it } from 'vitest';

// RN-OPS-PT-42 reads mount.tsx as text; the bundle check of RN-OPS-PT-06 lives in bundleHasNoClient.test.ts (spec 017 D-02).
const sources = import.meta.glob('./mount.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('portal sources (RN-OPS-PT-42)', () => {
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
