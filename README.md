# multi-tour-operations-cost-portal

> operations-cost bounded context: web UI (remote)

Part of the **Multi Tour** distributed system — team `multi-tour`, Grupo 2.
Governance and documentation live in [`multi-tour-docs`](https://github.com/code-corhuila/multi-tour-docs).

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

Full policy: `00-governance/branching-policy.md` in `multi-tour-docs`.

## What it is, how to run it, what is test data

1. **What is it?** The web portal of the operations-cost domain: the page "Operación y costos" of the Mockup, mounted by `multi-tour-front` with `mount(element, props)`. It has no HTTP client or session of its own.
2. **How is it built and run?** `npm ci`, `npm run build` (emits `dist/portal.js` and `dist/portal.css`) and `npm test`. As a container: `docker compose -f deploy/compose.yml up -d --build` on the external network `platform`; only the gateway publishes a port.
3. **Where does the data come from?** Two places. The form "Programar salida" reads the active tours of the catalog and schedules a departure through the client the container hands over (`src/ops/departures/scheduling.ts`, with relative `/api/v1/...` paths): that part is real. Everything else is **test data**, labelled on the page: the list of departures, the edit and the cancellation (`src/ops/departures/fixture.ts`), and the execution page and the operation page (`src/ops/departure/fixture.ts`, `src/ops/fixtureGateway.ts`). In a production build the test data are not bundled, so the list is empty.
4. **How is it tested?** Vitest and Testing Library (`npm test`): `src/mount.test.tsx`, the tests next to each page under `src/ops/`, the adapter and the form of the schedule under `src/ops/departures/`, and `src/buildCheck.test.ts` (no fetch, token or gateway URL in the sources).
5. **What is missing?** Connecting to the service what is still test data: the list, the edit and the cancellation of a departure (HU-OPS-003, HU-OPS-006), the vehicles of a departure (HU-OPS-002), and the execution and the cost panel. The time zone of the tenant is a constant (`America/Bogota`) until a tenant exposes its own.
