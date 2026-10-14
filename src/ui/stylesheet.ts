const ATTRIBUTE = 'data-multi-tour-portal';
// Copied next to the module by the Dockerfile; a constant, not a literal in `new URL`, so Vite does not treat it as an asset.
const FILE = 'operations-cost-portal.css';

// The library build emits its CSS as a separate file and nothing else loads it, so the module links it itself, once.
export function ensureStylesheet(): void {
  if (typeof document === 'undefined' || !document.head) return;
  if (document.head.querySelector(`link[${ATTRIBUTE}="operations-cost"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL(FILE, import.meta.url).href;
  link.setAttribute(ATTRIBUTE, 'operations-cost');
  document.head.appendChild(link);
}
