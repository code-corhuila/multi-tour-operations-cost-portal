import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../contract';
import { createDeparturesFixture } from './fixture';
import { FieldError, Forbidden, Failed, Refused, Unavailable } from './model';
import { createDeparturesGateway } from './scheduling';

type Call = { path: string; init?: { method?: string; body?: unknown; headers?: Record<string, string> } };

function fakeClient(answer: (call: Call) => unknown): { client: ApiClient; calls: Call[] } {
  const calls: Call[] = [];
  const client: ApiClient = {
    request: async <T>(path: string, init?: Call['init']) => {
      const call = { path, init };
      calls.push(call);
      return answer(call) as T;
    },
  };
  return { client, calls };
}

const service = (n: number) => ({ serviceId: `id-${n}`, commercialName: `Tour ${n}`, configuredCapacity: 10 + n, transportRequired: n % 2 === 0 });
const page = (items: unknown[], p: number, totalPages: number) => ({ data: items, meta: { page: p, limit: 100, total: items.length, totalPages } });
const input = { tourId: 'id-1', start: '2026-12-01T08:00', end: '2026-12-01T14:00', vehicleIds: [], key: 'schedule:abcdefgh' };
const created = {
  code: 'SAL-004',
  status: 'SCHEDULED',
  scheduledStart: '2026-12-01T13:00:00Z',
  scheduledEnd: '2026-12-01T19:00:00Z',
  capacity: 11,
  booked: 0,
  vehicles: [],
  reservations: [],
  novelties: [],
};

const failing = (error: unknown) => createDeparturesGateway({ request: () => Promise.reject(error) } as unknown as ApiClient, createDeparturesFixture());

describe('the tours', () => {
  it('C·only_active_tours_are_asked_for_and_offered', async () => {
    const { client, calls } = fakeClient(() => page([service(1), service(2)], 1, 1));
    const tours = await createDeparturesGateway(client, createDeparturesFixture()).listTours();
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('/api/v1/commercial-reservation/catalog/services?serviceType=TOUR&catalogStatus=ACTIVE&limit=100&page=1');
    expect(tours).toEqual([
      { id: 'id-1', name: 'Tour 1', capacity: 11, needsTransport: false },
      { id: 'id-2', name: 'Tour 2', capacity: 12, needsTransport: true },
    ]);
  });

  it('A·the_tours_are_read_page_by_page_up_to_five_pages', async () => {
    const { client, calls } = fakeClient(({ path }) => page([service(Number(/page=(\d)/.exec(path)![1]))], 1, 9));
    const tours = await createDeparturesGateway(client, createDeparturesFixture()).listTours();
    expect(calls).toHaveLength(5);
    expect(tours.map((t) => t.id)).toEqual(['id-1', 'id-2', 'id-3', 'id-4', 'id-5']);
  });

  it('A·a_failed_read_of_the_tours_rejects_so_the_form_shows_its_error_state', async () => {
    await expect(failing({ status: 503, code: 'SERVICE_UNAVAILABLE' }).listTours()).rejects.toBeInstanceOf(Unavailable);
  });
});

describe('scheduling', () => {
  it('A·scheduling_posts_instants_the_zone_and_the_key', async () => {
    const { client, calls } = fakeClient(() => created);
    const row = await createDeparturesGateway(client, createDeparturesFixture()).scheduleDeparture(input);
    expect(calls).toEqual([
      {
        path: '/api/v1/operations-cost/departures',
        init: {
          method: 'POST',
          headers: { 'Idempotency-Key': 'schedule:abcdefgh' },
          body: { serviceId: 'id-1', scheduledStart: '2026-12-01T13:00:00Z', scheduledEnd: '2026-12-01T19:00:00Z', timeZone: 'America/Bogota' },
        },
      },
    ]);
    expect(row).toMatchObject({ code: 'SAL-004', tourId: 'id-1', start: input.start, end: input.end, vehicleIds: [], status: 'SCHEDULED' });
  });

  it('A·the_adapter_uses_only_the_client_it_receives_and_relative_paths', async () => {
    const { client, calls } = fakeClient(({ path }) => (path.includes('catalog') ? page([], 1, 1) : created));
    const gateway = createDeparturesGateway(client, createDeparturesFixture());
    await gateway.listTours();
    await gateway.scheduleDeparture(input);
    for (const { path, init } of calls) {
      expect(path).toMatch(/^\/api\/v1\/[a-z-]+\//);
      expect(JSON.stringify(init ?? {})).not.toMatch(/authorization|x-correlation-id|http/i);
    }
  });

  it('A·the_edit_and_the_cancellation_stay_on_the_test_adapter', async () => {
    const { client, calls } = fakeClient(() => created);
    const gateway = createDeparturesGateway(client, createDeparturesFixture());
    await expect(gateway.cancelDeparture({ code: 'SAL-018', cause: 'x', key: 'k' })).resolves.toBeDefined();
    expect(calls).toHaveLength(0);
  });
});

describe('the errors', () => {
  it('C·a_400_names_the_field', async () => {
    const error = { status: 400, code: 'VALIDATION_ERROR', message: 'x', traceId: 't1', details: [{ field: 'scheduledEnd', message: 'before start' }] };
    const caught = await failing(error)
      .scheduleDeparture(input)
      .catch((e) => e);
    expect(caught).toBeInstanceOf(FieldError);
    expect(caught.fields).toEqual([{ field: 'scheduledEnd', message: 'before start' }]);
  });

  it('C·each_status_has_its_message', async () => {
    const as = (error: unknown) =>
      failing(error)
        .scheduleDeparture(input)
        .catch((e) => e);
    expect(await as({ status: 422, code: 'BUSINESS_RULE_VIOLATION' })).toMatchObject({ name: 'Refused', code: 'BUSINESS_RULE_VIOLATION' });
    expect(await as({ status: 422, code: 'INVALID_STATUS_TRANSITION' })).toBeInstanceOf(Refused);
    expect(await as({ status: 400, code: 'VALIDATION_ERROR' })).toMatchObject({ name: 'FieldError', fields: [] });
    expect(await as({ status: 401, code: 'UNAUTHORIZED' })).toBeInstanceOf(Failed);
    expect(await as({ status: 429, code: 'RATE_LIMITED' })).toBeInstanceOf(Failed);
    expect(await as({ status: 403, code: 'FORBIDDEN' })).toBeInstanceOf(Forbidden);
    expect(await as({ status: 404, code: 'NOT_FOUND' })).toBeInstanceOf(Failed);
    expect(await as({ status: 500, code: 'INTERNAL_ERROR' })).toBeInstanceOf(Failed);
    expect(await as({ status: 503, code: 'SERVICE_UNAVAILABLE' })).toBeInstanceOf(Unavailable);
    expect(await as({ code: 'TIMEOUT' })).toBeInstanceOf(Unavailable);
    expect(await as({ code: 'NETWORK_ERROR' })).toBeInstanceOf(Unavailable);
    expect(await as({ code: 'ABORTED' })).toBeInstanceOf(Failed);
    for (const odd of [new Error('boom'), null, 'text', 42]) expect(await as(odd)).toBeInstanceOf(Failed);
  });

  it('A·a_400_keeps_only_the_details_that_name_a_field', async () => {
    const caught = await failing({ status: 400, code: 'VALIDATION_ERROR', details: [{ field: 'timeZone', message: 'unknown' }, { message: 'no field' }] })
      .scheduleDeparture(input)
      .catch((e) => e);
    expect(caught.fields).toEqual([{ field: 'timeZone', message: 'unknown' }]);
  });

  it('A·a_wall_clock_that_cannot_be_converted_fails_without_calling_the_service', async () => {
    const { client, calls } = fakeClient(() => created);
    const caught = await createDeparturesGateway(client, createDeparturesFixture())
      .scheduleDeparture({ ...input, start: 'tomorrow' })
      .catch((e) => e);
    expect(caught).toBeInstanceOf(Failed);
    expect(calls).toHaveLength(0);
  });

  it('A·the_global_fetch_is_never_used', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const { client } = fakeClient(({ path }) => (path.includes('catalog') ? page([], 1, 1) : created));
    const gateway = createDeparturesGateway(client, createDeparturesFixture());
    await gateway.listTours();
    await gateway.scheduleDeparture(input);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('A·the_body_and_the_trace_are_never_in_the_message_but_the_trace_goes_to_the_console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const caught = await failing({ status: 500, code: 'INTERNAL_ERROR', message: 'stack at db.Host', traceId: 'trace-77' })
      .scheduleDeparture(input)
      .catch((e) => e);
    expect(caught.message).not.toMatch(/stack|db\.Host|trace-77/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('trace-77'));
    warn.mockRestore();
  });
});

const row = (n: number, extra: Record<string, unknown> = {}) => ({
  code: `SAL-0${n}`,
  serviceId: `id-${n}`,
  status: 'SCHEDULED',
  scheduledStart: '2026-12-01T13:00:00Z',
  scheduledEnd: '2026-12-01T21:00:00Z',
  capacity: 12,
  booked: 4,
  pendingRegularization: false,
  startAlert: false,
  interrupted: false,
  vehicles: [{ vehicleId: 'veh-1', name: 'Van', capacity: 12 }],
  ...extra,
});

describe('the list of departures (spec 008 PT8-01)', () => {
  it('C·the_departures_are_read_from_the_service_and_mapped_to_the_wall_clock_of_the_tenant', async () => {
    const { client, calls } = fakeClient(() => page([row(21), row(22, { status: 'IN_EXECUTION', vehicles: [] })], 1, 1));
    const gateway = createDeparturesGateway(client, createDeparturesFixture());
    const rows = await gateway.listDepartures();
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('/api/v1/operations-cost/departures?limit=100&page=1');
    expect(rows).toEqual([
      { code: 'SAL-021', tourId: 'id-21', start: '2026-12-01T08:00', end: '2026-12-01T16:00', vehicleIds: ['veh-1'], booked: 4, reservations: 0, status: 'SCHEDULED', pendingRegularization: false, startAlert: false, capacity: 12 },
      { code: 'SAL-022', tourId: 'id-22', start: '2026-12-01T08:00', end: '2026-12-01T16:00', vehicleIds: [], booked: 4, reservations: 0, status: 'IN_EXECUTION', pendingRegularization: false, startAlert: false, capacity: 12 },
    ]);
  });

  it('A·the_departures_are_read_page_by_page_up_to_five_pages', async () => {
    const { client, calls } = fakeClient((call) => page([row(Number(call.path.split('page=')[1]))], Number(call.path.split('page=')[1]), 9));
    const rows = await createDeparturesGateway(client, createDeparturesFixture()).listDepartures();
    expect(calls).toHaveLength(5);
    expect(rows).toHaveLength(5);
  });

  it('A·the_list_stops_at_the_last_page', async () => {
    const { client, calls } = fakeClient((call) => page([row(Number(call.path.split('page=')[1]))], Number(call.path.split('page=')[1]), 2));
    expect(await createDeparturesGateway(client, createDeparturesFixture()).listDepartures()).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  it('C·a_refusal_is_translated_and_never_shows_the_body', async () => {
    await expect(failing({ status: 403 }).listDepartures()).rejects.toBeInstanceOf(Forbidden);
    await expect(failing({ status: 503 }).listDepartures()).rejects.toBeInstanceOf(Unavailable);
    await expect(failing({ status: 500 }).listDepartures()).rejects.toBeInstanceOf(Failed);
  });

  it('U·the_gateway_that_talks_to_the_service_says_so', () => {
    expect(createDeparturesGateway(fakeClient(() => page([], 1, 1)).client, createDeparturesFixture()).connected).toBe(true);
  });
});
