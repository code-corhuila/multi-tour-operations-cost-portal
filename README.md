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
3. **Where does the data come from?** Two places. Through the client the container hands over (relative `/api/v1/...` paths, never a URL) the portal reads and writes the service: the list of departures and the page of one (`src/ops/departures/scheduling.ts`, `src/ops/departure/execution.ts`), the form "Programar salida" with the vehicles chosen in it, the section "Vehículos" (list and register the vehicles of the tenant), and, on the page of a real departure, adding vehicles to a scheduled one, recording its start and its end or interruption, the reservations of the departure with what each received (the travelers served, the cause and the no-show), its operational costs, and the extraordinary cancellation of a reservation in execution: a justification of 1 to 500 characters and a confirmation that says it cannot be undone come before anything is sent, and the panel then shows the record and that the decision to reschedule or to refund stays pending. The service says which departures need attention and the portal only draws it: `startAlert` (still scheduled and its start passed) and `pendingRegularization` (past its estimated end with no closing; a mark, not a state) show as badges on the list, in the section of alerts and on the page, and a marked departure that never started offers the panel to regularize it as executed or interrupted (real hours, the reason when the start is earlier than the scheduled one, and the cause of an interruption) or as not carried out (its cause of 1 to 500 characters, sent as `NOT_CARRIED_OUT`), sent with the `Idempotency-Key` that a retry reuses. The Tenant Administrator also cancels a scheduled departure from the panel "Cancelar salida" (HU-OPS-006): a confirmation that says it cannot be undone comes before anything is sent, the request goes to the saga `cancel-departure` with the `Idempotency-Key` of the departure, and a request that has not finished says it is in course; a cancelled departure shows its record (when, by whom when the service says so, and why) and offers no action. On a reservation in execution of a departure in execution the person also records its personal emergency (HU-OPS-008) from the action "Emergencia personal": the travelers who cannot continue, from 1 up to those of the reservation, and what happened, 1 to 1000 characters, each error beside its field, and a confirmation that says the reservation is not cancelled, that the system determines the refund and that it cannot be undone; it is sent with the `Idempotency-Key` that a retry reuses, the record shows when, who, the travelers and the detail, and a reservation that has one, or was cancelled extraordinarily, is not offered the action. The area opens only to whoever holds the permission `MANAGE_DEPARTURE_EXECUTION` (`session.permissions`); scheduling and the vehicles are the Administrator's. Everything else is **test data**, labelled on the page: the edit and the cancellation of a departure (`src/ops/departures/fixture.ts`) and the operation page with its execution page (`src/ops/departure/fixture.ts`, `src/ops/fixtureGateway.ts`); over the service, the panels of the ordinary novelties and of the history of a departure are not drawn and the ordinary novelty is never sent. In a production build the test data are not bundled.
4. **How is it tested?** Vitest and Testing Library (`npm test`): `src/mount.test.tsx`, the tests next to each page under `src/ops/`, the adapter and the form of the schedule under `src/ops/departures/`, and `src/buildCheck.test.ts` (no fetch, token or gateway URL in the sources).
5. **What is missing?** Connecting to the service what is still test data: the edit of a departure, removing or replacing the vehicles of a departure (HU-OPS-002 part B), the ordinary novelties and the history of a departure (another story). The screen shows no amount and no refund of a personal emergency: `commercial-reservation` decides them and does not consume the event yet. What the saga does with the reservations of a cancelled departure is not shown (its status is not read yet), and the record of a cancellation shows the id of the account that asked for it. The record of an extraordinary cancellation shows the id of the account that made it, because the contract gives no name, and a reservation cancelled that way keeps saying that it is in execution until `commercial-reservation` consumes the event (HU-COM-012). The time zone of the tenant is a constant (`America/Bogota`) until a tenant exposes its own.
