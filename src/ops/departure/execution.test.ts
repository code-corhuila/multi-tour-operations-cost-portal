import { describe, expect, it } from 'vitest';
import type { ApiClient } from '../../contract';
import { FieldError, Failed, Forbidden, Refused, Unavailable } from '../departures/model';
import { createExecutionGateway } from './execution';

type Call = { path: string; init?: unknown };

function fakeClient(answer: (call: Call) => unknown): { client: ApiClient; calls: Call[] } {
  const calls: Call[] = [];
  const client: ApiClient = {
    request: async <T>(path: string, init?: unknown) => {
      const call = { path, init };
      calls.push(call);
      return answer(call) as T;
    },
  };
  return { client, calls };
}

const departure = (extra: Record<string, unknown> = {}) => ({
  code: 'SAL-031',
  serviceId: 'tour-1',
  status: 'IN_EXECUTION',
  scheduledStart: '2026-12-01T13:00:00Z',
  scheduledEnd: '2026-12-01T21:00:00Z',
  capacity: 12,
  booked: 5,
  pendingRegularization: false,
  actualStart: '2026-12-01T13:07:00Z',
  interrupted: false,
  vehicles: [{ vehicleId: 'veh-1', name: 'Van', capacity: 12 }],
  ...extra,
});

const failing = (error: unknown) => createExecutionGateway({ request: () => Promise.reject(error) } as unknown as ApiClient);

// Spec 008 PT8-02 (AC-PT-08.2, -08.8): the page of one departure reads the service.
describe('the connected execution gateway', () => {
  it('C·a_departure_is_read_from_the_service_and_its_times_are_the_wall_clock_of_the_tenant', async () => {
    const { client, calls } = fakeClient(() => departure());
    const read = await createExecutionGateway(client).getDeparture('SAL-031');
    expect(calls.map((c) => c.path)).toEqual(['/api/v1/operations-cost/departures/SAL-031']);
    expect(read).toMatchObject({
      code: 'SAL-031',
      status: 'IN_EXECUTION',
      vehicles: ['Van'],
      capacity: 12,
      booked: 5,
      scheduledStart: '2026-12-01T08:00',
      scheduledEnd: '2026-12-01T16:00',
      actualStart: '2026-12-01T08:07',
      reservations: [],
      novelties: [],
      history: [],
    });
    expect(read?.actualEnd).toBeUndefined();
  });

  it('C·an_interruption_is_shown_with_its_cause', async () => {
    const { client } = fakeClient(() =>
      departure({ status: 'FINISHED', actualEnd: '2026-12-01T19:00:00Z', interrupted: true, interruptionCause: 'Heavy rain closed the trail' }),
    );
    const read = await createExecutionGateway(client).getDeparture('SAL-031');
    expect(read).toMatchObject({ status: 'FINISHED', actualEnd: '2026-12-01T14:00', mark: 'Interrumpida', interruptionCause: 'Heavy rain closed the trail' });
  });

  it('C·a_code_is_encoded_in_the_path_so_it_cannot_change_the_url', async () => {
    const { client, calls } = fakeClient(() => departure());
    await createExecutionGateway(client).getDeparture('SAL-031/../vehicles?x=1#y');
    expect(calls[0].path).toBe('/api/v1/operations-cost/departures/SAL-031%2F..%2Fvehicles%3Fx%3D1%23y');
  });

  it('C·a_failure_with_no_status_is_a_failure_and_not_a_missing_departure', async () => {
    await expect(failing(new Error('boom')).getDeparture('SAL-031')).rejects.toBeInstanceOf(Failed);
    await expect(failing({ code: 'TIMEOUT' }).getDeparture('SAL-031')).rejects.toBeInstanceOf(Unavailable);
  });

  it('C·the_start_is_sent_as_an_instant_with_its_key_and_the_answer_is_the_departure', async () => {
    const { client, calls } = fakeClient(() => departure({ status: 'IN_EXECUTION', actualStart: '2026-12-01T13:10:00Z' }));
    const read = await createExecutionGateway(client).registerStart({ code: 'SAL-031', startedAt: '2026-12-01T08:10', key: 'start-key-0001' });
    expect(calls).toEqual([
      {
        path: '/api/v1/operations-cost/departures/SAL-031/executions',
        init: { method: 'POST', headers: { 'Idempotency-Key': 'start-key-0001' }, body: { startedAt: '2026-12-01T13:10:00Z' } },
      },
    ]);
    expect(read).toMatchObject({ status: 'IN_EXECUTION', actualStart: '2026-12-01T08:10' });
  });

  it('C·the_end_carries_its_result_and_only_an_interruption_carries_its_cause', async () => {
    const { client, calls } = fakeClient(() => departure({ status: 'FINISHED', actualEnd: '2026-12-01T19:00:00Z' }));
    const gateway = createExecutionGateway(client);
    await gateway.registerFinish({ code: 'SAL-031', finishedAt: '2026-12-01T14:00', result: 'FINISHED', cause: '', key: 'finish-key-001' });
    await gateway.registerFinish({ code: 'SAL-031', finishedAt: '2026-12-01T14:00', result: 'INTERRUPTED', cause: 'Heavy rain', key: 'finish-key-002' });
    expect(calls.map((c) => c.path)).toEqual(Array(2).fill('/api/v1/operations-cost/departures/SAL-031/finish'));
    expect(calls[0].init).toEqual({
      method: 'POST',
      headers: { 'Idempotency-Key': 'finish-key-001' },
      body: { finishedAt: '2026-12-01T19:00:00Z', result: 'FINISHED' },
    });
    expect(calls[1].init).toMatchObject({ body: { result: 'INTERRUPTED', cause: 'Heavy rain' } });
  });

  it('C·a_refused_recording_is_translated_by_its_status', async () => {
    const start = { code: 'SAL-031', startedAt: '2026-12-01T08:10', key: 'start-key-0001' };
    await expect(failing({ status: 422, code: 'BUSINESS_RULE_VIOLATION' }).registerStart(start)).rejects.toBeInstanceOf(Refused);
    await expect(failing({ status: 422, code: 'INVALID_STATUS_TRANSITION' }).registerStart(start)).rejects.toBeInstanceOf(Refused);
    await expect(failing({ status: 403 }).registerStart(start)).rejects.toBeInstanceOf(Forbidden);
    await expect(failing({ status: 503 }).registerStart(start)).rejects.toBeInstanceOf(Unavailable);
    await expect(failing({ status: 400 }).registerStart(start)).rejects.toBeInstanceOf(FieldError);
  });

  it('C·a_wall_clock_that_cannot_be_converted_is_refused_before_anything_is_sent', async () => {
    const { client, calls } = fakeClient(() => departure());
    const gateway = createExecutionGateway(client);
    await expect(gateway.registerStart({ code: 'SAL-031', startedAt: '12026-12-01T08:10', key: 'start-key-0001' })).rejects.toBeInstanceOf(Failed);
    await expect(gateway.registerFinish({ code: 'SAL-031', finishedAt: 'x', result: 'FINISHED', cause: '', key: 'finish-key-001' })).rejects.toBeInstanceOf(Failed);
    expect(calls).toHaveLength(0);
  });

  it('C·the_vehicles_of_the_tenant_are_read_page_by_page_and_the_departure_says_which_it_has_and_whether_its_tour_needs_transport', async () => {
    const { client, calls } = fakeClient((call) =>
      call.path.includes('/vehicles')
        ? { data: [{ vehicleId: 'veh-1', name: 'Van', capacity: 12 }, { vehicleId: 'veh-2', name: 'Bus', capacity: 30 }], meta: { totalPages: 1 } }
        : departure({ transportRequired: true }),
    );
    const gateway = createExecutionGateway(client);
    expect(await gateway.listVehicles!()).toEqual([
      { id: 'veh-1', name: 'Van', capacity: 12 },
      { id: 'veh-2', name: 'Bus', capacity: 30 },
    ]);
    expect(calls[0].path).toBe('/api/v1/operations-cost/vehicles?limit=100&page=1');
    expect(await gateway.getDeparture('SAL-031')).toMatchObject({ transportRequired: true, vehicleIds: ['veh-1'] });
  });

  it('C·adding_vehicles_posts_the_ids_to_the_departure_and_answers_the_departure', async () => {
    const { client, calls } = fakeClient(() => departure({ capacity: 18, vehicles: [{ vehicleId: 'veh-1', name: 'Van', capacity: 12 }, { vehicleId: 'veh-2', name: 'Bus', capacity: 30 }] }));
    const read = await createExecutionGateway(client).addVehicles!({ code: 'SAL-031', vehicleIds: ['veh-2'], key: 'vehicles-key-1' });
    expect(calls).toEqual([
      {
        path: '/api/v1/operations-cost/departures/SAL-031/vehicles',
        init: { method: 'POST', headers: { 'Idempotency-Key': 'vehicles-key-1' }, body: { vehicleIds: ['veh-2'] } },
      },
    ]);
    expect(read).toMatchObject({ capacity: 18, vehicles: ['Van', 'Bus'], vehicleIds: ['veh-1', 'veh-2'] });
  });

  it('C·a_refused_addition_is_translated_by_its_status', async () => {
    const add = { code: 'SAL-031', vehicleIds: ['veh-2'], key: 'vehicles-key-1' };
    await expect(failing({ status: 422, code: 'BUSINESS_RULE_VIOLATION' }).addVehicles!(add)).rejects.toBeInstanceOf(Refused);
    await expect(failing({ status: 403 }).addVehicles!(add)).rejects.toBeInstanceOf(Forbidden);
    await expect(failing({ status: 503 }).addVehicles!(add)).rejects.toBeInstanceOf(Unavailable);
    await expect(failing({ status: 400 }).addVehicles!(add)).rejects.toBeInstanceOf(FieldError);
  });

  it('C·a_departure_that_is_not_there_resolves_undefined', async () => {
    expect(await failing({ status: 404, code: 'NOT_FOUND' }).getDeparture('SAL-404')).toBeUndefined();
  });

  it('C·a_refusal_is_translated_and_never_shows_the_body', async () => {
    await expect(failing({ status: 403 }).getDeparture('SAL-031')).rejects.toBeInstanceOf(Forbidden);
    await expect(failing({ status: 503 }).getDeparture('SAL-031')).rejects.toBeInstanceOf(Unavailable);
    await expect(failing({ status: 500 }).getDeparture('SAL-031')).rejects.toBeInstanceOf(Failed);
  });

  it('U·it_says_it_talks_to_the_service_and_offers_the_departure_the_start_and_the_finish', () => {
    const gateway = createExecutionGateway(fakeClient(() => departure()).client);
    expect(gateway.connected).toBe(true);
    expect(gateway.panels).toEqual(['departure', 'vehicles', 'start', 'finish']);
  });

  it('U·what_the_service_does_not_offer_yet_is_refused_and_never_sent', async () => {
    const { client, calls } = fakeClient(() => departure());
    const gateway = createExecutionGateway(client);
    await expect(gateway.registerNovelty({ code: 'SAL-031', reservationId: 'r', detail: 'd', emergency: false, key: 'k' })).rejects.toThrow('NOT_AVAILABLE');
    await expect(gateway.registerServices({ code: 'SAL-031', entries: [], key: 'k' })).rejects.toThrow('NOT_AVAILABLE');
    await expect(gateway.registerRegularization({ code: 'SAL-031', result: 'EXECUTED', startedAt: '', finishedAt: '', earlyStartMotive: '', interruption: '', notDoneCause: '', key: 'k' })).rejects.toThrow('NOT_AVAILABLE');
    expect(calls).toHaveLength(0);
  });
});
