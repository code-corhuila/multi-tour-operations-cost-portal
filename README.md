# multi-tour-operations-cost-portal

> operations-cost bounded context: web UI (remote)

Part of the **LMS Library** distributed system — team `lms-library`, Grupo 2.
Governance and documentation live in [`library-docs`](https://github.com/code-corhuila/library-docs).

## Branching

Three permanent branches. **None of them accepts a direct commit** — you enter through a child
branch and leave through a Pull Request.

```
develop  <--PR--  feat/... fix/... chore/...
qa       <--PR--  qa/...
main     <--PR--  release/...  hotfix/...
```

Promotion happens **by re-application** (`git cherry-pick -x`), never by merging one permanent
branch into another: `merge develop -> qa` and `merge qa -> main` do not exist in this model.

`main` requires **1 approval from `ariel5253`**. On `develop` and `qa` the team sets its own review
rule.

Full policy: `00-governance/branching-policy.md` in `library-docs`.

## What it is, how to run it, what is test data

1. **What is it?** The web portal of the operations-cost domain: the page "Operación y costos" of the Mockup, mounted by `multi-tour-front` with `mount(element, props)`. It has no HTTP client or session of its own.
2. **How is it built and run?** `npm ci`, `npm run build` (emits `dist/portal.js` and `dist/portal.css`) and `npm test`. As a container: `docker compose -f deploy/compose.yml up -d --build` on the external network `platform`; only the gateway publishes a port.
3. **Where does the data come from?** From `src/ops/fixtureGateway.ts`: **test data**, labelled on the page. The service has no consumer for this portal yet (declared); the HTTP adapter comes with the contract.
4. **How is it tested?** Vitest and Testing Library: `src/mount.test.tsx`, `src/ops/*.test.tsx`, and `src/buildCheck.test.ts` (no fetch, token or gateway URL in the sources).
5. **What is missing?** The register-execution form, the cost panel and the light Playwright checks (specs 002 and 003).
