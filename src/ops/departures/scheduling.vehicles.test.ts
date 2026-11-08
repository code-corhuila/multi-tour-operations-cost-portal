import { describe, expect, it } from 'vitest';
import type { ApiClient } from '../../contract';
import { createDeparturesFixture } from './fixture';
import { FieldError, Refused, Unavailable } from './model';
import { createDeparturesGateway } from './scheduling';

// Portal spec 007, task PT7-01 (AC-PT-07.1, -07.2, -07.7): the vehicles of the tenant go through the client of the container.

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

const vehicle = (n: number) => ({ vehicleId: `v-${n}`, name: `Vehicle ${n}`, capacity: 10 + n });
const page = (items: unknown[], p: number, totalPages: number) => ({ data: items, meta: { page: p, limit: 100, total: items.length, totalPages } });
const failing = (error: unknown) => createDeparturesGateway({ request: () => Promise.reject(error) } as unknown as ApiClient, createDeparturesFixture());

describe('the vehicles of the tenant', () => {
  it('C·the_vehicles_are_read_page_by_page_with_relative_paths', async () => {
    const { client, calls } = fakeClient(({ path }) => page([vehicle(Number(/page=(\d)/.exec(path)![1]))], 1, 2));
    const vehicles = await createDeparturesGateway(client, createDeparturesFixture()).listVehicles();
    expect(calls.map((c) => c.path)).toEqual(['/api/v1/operations-cost/vehicles?limit=100&page=1', '/api/v1/operations-cost/vehicles?limit=100&page=2']);
    expect(vehicles).toEqual([
      { id: 'v-1', name: 'Vehicle 1', capacity: 11 },
      { id: 'v-2', name: 'Vehicle 2', capacity: 12 },
    ]);
  });

  it('A·a_failed_read_of_the_vehicles_rejects_so_the_view_shows_its_error_state', async () => {
    await expect(failing({ status: 503, code: 'SERVICE_UNAVAILABLE' }).listVehicles()).rejects.toBeInstanceOf(Unavailable);
  });

  it('C·a_vehicle_is_registered_with_its_key_and_nothing_else_in_the_body', async () => {
    const { client, calls } = fakeClient(() => vehicle(3));
    const created = await createDeparturesGateway(client, createDeparturesFixture()).createVehicle!({ name: 'Van 3', capacity: 13, key: 'vehicle:abcdefgh' });
    expect(created).toEqual({ id: 'v-3', name: 'Vehicle 3', capacity: 13 });
    expect(calls).toEqual([
      {
        path: '/api/v1/operations-cost/vehicles',
        init: { method: 'POST', headers: { 'Idempotency-Key': 'vehicle:abcdefgh' }, body: { name: 'Van 3', capacity: 13 } },
      },
    ]);
  });

  it('A·a_400_names_its_fields_and_a_422_is_a_refusal_with_its_code', async () => {
    const input = { name: 'Van', capacity: 12, key: 'vehicle:abcdefgh' };
    await expect(failing({ status: 400, details: [{ field: 'name', message: 'x' }] }).createVehicle!(input)).rejects.toBeInstanceOf(FieldError);
    await expect(failing({ status: 422, code: 'BUSINESS_RULE_VIOLATION' }).createVehicle!(input)).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
    await expect(failing({ status: 422, code: 'BUSINESS_RULE_VIOLATION' }).createVehicle!(input)).rejects.toBeInstanceOf(Refused);
  });

  it('C·the_connected_adapter_says_it_is_connected_and_the_test_one_does_not', () => {
    const { client } = fakeClient(() => page([], 1, 1));
    expect(createDeparturesGateway(client, createDeparturesFixture()).connected).toBe(true);
    expect(createDeparturesFixture().connected).toBeUndefined();
    expect(createDeparturesFixture().createVehicle).toBeUndefined();
  });
});
