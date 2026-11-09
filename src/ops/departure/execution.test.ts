import { describe, expect, it } from 'vitest';
import type { ApiClient } from '../../contract';
import { Failed, Forbidden, Unavailable } from '../departures/model';
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

  it('C·a_departure_that_is_not_there_resolves_undefined', async () => {
    expect(await failing({ status: 404, code: 'NOT_FOUND' }).getDeparture('SAL-404')).toBeUndefined();
  });

  it('C·a_refusal_is_translated_and_never_shows_the_body', async () => {
    await expect(failing({ status: 403 }).getDeparture('SAL-031')).rejects.toBeInstanceOf(Forbidden);
    await expect(failing({ status: 503 }).getDeparture('SAL-031')).rejects.toBeInstanceOf(Unavailable);
    await expect(failing({ status: 500 }).getDeparture('SAL-031')).rejects.toBeInstanceOf(Failed);
  });

  it('U·it_says_it_talks_to_the_service_and_offers_only_the_departure_panel_for_now', () => {
    const gateway = createExecutionGateway(fakeClient(() => departure()).client);
    expect(gateway.connected).toBe(true);
    expect(gateway.panels).toEqual(['departure']);
  });

  it('U·what_the_service_does_not_offer_yet_is_refused_and_never_sent', async () => {
    const { client, calls } = fakeClient(() => departure());
    const gateway = createExecutionGateway(client);
    await expect(gateway.registerServices({ code: 'SAL-031', entries: [], key: 'k' })).rejects.toThrow('NOT_AVAILABLE');
    await expect(gateway.registerRegularization({ code: 'SAL-031', result: 'EXECUTED', startedAt: '', finishedAt: '', earlyStartMotive: '', interruption: '', notDoneCause: '', key: 'k' })).rejects.toThrow('NOT_AVAILABLE');
    expect(calls).toHaveLength(0);
  });
});
