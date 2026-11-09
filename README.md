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
3. **Where does the data come from?** Two places. Through the client the container hands over (relative `/api/v1/...` paths, never a URL) the portal reads and writes the service: the list of departures and the page of one (`src/ops/departures/scheduling.ts`, `src/ops/departure/execution.ts`), the form "Programar salida" with the vehicles chosen in it, the section "Vehículos" (list and register the vehicles of the tenant), and, on the page of a real departure, adding vehicles to a scheduled one and recording its start and its end or interruption. The area opens only to whoever holds the permission `MANAGE_DEPARTURE_EXECUTION` (`session.permissions`); scheduling and the vehicles are the Administrator's. Everything else is **test data**, labelled on the page: the edit and the cancellation of a departure (`src/ops/departures/fixture.ts`) and the operation page with its execution page (`src/ops/departure/fixture.ts`, `src/ops/fixtureGateway.ts`). In a production build the test data are not bundled.
4. **How is it tested?** Vitest and Testing Library (`npm test`): `src/mount.test.tsx`, the tests next to each page under `src/ops/`, the adapter and the form of the schedule under `src/ops/departures/`, and `src/buildCheck.test.ts` (no fetch, token or gateway URL in the sources).
5. **What is missing?** Connecting to the service what is still test data: the edit and the cancellation of a departure (HU-OPS-006), removing or replacing the vehicles of a departure (HU-OPS-002 part B), the alert and the regularization of a departure that did not start or end (HU-OPS-003 part B), the reservations, the services delivered and the novelties of a departure (HU-OPS-004), and the cost panel (HU-OPS-007). The time zone of the tenant is a constant (`America/Bogota`) until a tenant exposes its own.
