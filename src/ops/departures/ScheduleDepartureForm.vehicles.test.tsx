import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../contract';
import { createDeparturesFixture } from './fixture';
import { ScheduleDepartureForm } from './ScheduleDepartureForm';
import { createDeparturesGateway } from './scheduling';
import type { DepartureRow } from './model';
import { TENANT_TIME_ZONE, toInstant } from './time';

// Portal spec 007, task PT7-02 (AC-PT-07.3 to -07.5, -07.7): the connected form assigns real vehicles to a tour that requires transport.
const page = (items: object[]) => ({ data: items, meta: { page: 1, limit: 100, total: items.length, totalPages: 1 } });
const tour = (id: string, name: string, capacity: number, transport: boolean) => ({
  serviceId: id,
  commercialName: name,
  configuredCapacity: capacity,
  transportRequired: transport,
});
const tours = [tour('t-1', 'Cañón del río', 12, false), tour('t-2', 'Bote por la ciénaga', 10, true)];
const vehicles = [
  { vehicleId: 'v-1', name: 'Van VAN-204', capacity: 12 },
  { vehicleId: 'v-2', name: 'Bus Andino 01', capacity: 30 },
];
const created = {
  code: 'SAL-004',
  status: 'SCHEDULED',
  scheduledStart: '2026-12-01T13:00:00Z',
  scheduledEnd: '2026-12-01T19:00:00Z',
  capacity: 10,
  booked: 0,
  tourCapacity: 10,
  vehicleCapacity: 12,
  transportRequired: true,
  vehicles: [{ vehicleId: 'v-1', name: 'Van VAN-204', capacity: 12 }],
  reservations: [],
  novelties: [],
};
const asService = (row: DepartureRow) => ({
  code: row.code,
  serviceId: row.tourId,
  status: row.status,
  scheduledStart: toInstant(row.start, TENANT_TIME_ZONE),
  scheduledEnd: toInstant(row.end, TENANT_TIME_ZONE),
  capacity: 0,
  booked: row.booked,
  vehicles: row.vehicleIds.map((vehicleId) => ({ vehicleId })),
});
type Init = { method?: string; headers?: Record<string, string>; body?: Record<string, unknown> };

function setup(onSchedule: () => unknown = () => created, rest = createDeparturesFixture()) {
  const request = vi.fn(async (path: string, _init?: Init) => {
    if (path.includes('catalog')) return page(tours);
    if (path.includes('/vehicles')) return page(vehicles);
    // the departures the form judges conflicts against come from the service; the test data stand in for them
    if (path.startsWith('/api/v1/operations-cost/departures?')) return page((await rest.listDepartures()).map(asService));
    return onSchedule();
  });
  const gateway = createDeparturesGateway({ request } as unknown as ApiClient, rest);
  const onSaved = vi.fn();
  render(<ScheduleDepartureForm gateway={gateway} onBack={vi.fn()} onSaved={onSaved} />);
  const posts = () => request.mock.calls.filter(([path, init]) => path.includes('/departures') && init?.method === 'POST');
  return { posts, onSaved };
}

const fill = async (tourId: string) => {
  fireEvent.change(await screen.findByLabelText('Tour'), { target: { value: tourId } });
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-12-01' } });
  fireEvent.change(screen.getByLabelText('Hora de inicio programada'), { target: { value: '08:00' } });
  fireEvent.change(screen.getByLabelText('Hora de finalización estimada'), { target: { value: '14:00' } });
};
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar salida' }));

describe('the connected form with vehicles (spec 007)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('C·a_tour_with_transport_offers_the_vehicles_of_the_tenant_and_the_effective_capacity_line', async () => {
    setup();
    await fill('t-2');
    expect(await screen.findByRole('checkbox', { name: /Van VAN-204/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Bus Andino 01/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Van VAN-204/ }));
    expect(
      screen.getByText(/Capacidad efectiva de la salida: 10 viajeros = menor entre el cupo del tour \(10\) y la capacidad acumulada de los vehículos \(12\)/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Van VAN-204/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Bus Andino 01/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Van VAN-204/ }));
    expect(screen.getByText(/\(42\)/)).toBeInTheDocument();
  });

  it('C·the_form_does_not_say_it_is_test_data_when_it_is_connected', async () => {
    setup();
    await fill('t-2');
    expect(screen.queryByText('Datos de prueba')).not.toBeInTheDocument();
    expect(screen.queryByText('Los vehículos se asignan después.')).not.toBeInTheDocument();
  });

  it('C·a_tour_without_transport_offers_no_vehicles_and_keeps_its_capacity', async () => {
    setup();
    await fill('t-1');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Este tour no usa transporte: no necesita vehículos.')).toBeInTheDocument();
    expect(screen.getByText('Capacidad de la salida: 12 viajeros (la del tour).')).toBeInTheDocument();
  });

  it('C·a_tour_with_transport_needs_a_vehicle_before_anything_is_sent', async () => {
    const { posts } = setup();
    await fill('t-2');
    await screen.findByRole('checkbox', { name: /Van VAN-204/ });
    save();
    expect(await screen.findByText('El tour con transporte asociado requiere al menos un vehículo.')).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('C·the_departure_is_scheduled_with_the_ticked_vehicles_and_says_the_effective_capacity', async () => {
    const { posts, onSaved } = setup();
    await fill('t-2');
    fireEvent.click(await screen.findByRole('checkbox', { name: /Van VAN-204/ }));
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(posts()[0][1]?.body).toMatchObject({ serviceId: 't-2', vehicleIds: ['v-1'] });
    expect(onSaved.mock.calls[0][0]).toContain('Salida SAL-004 programada (Bote por la ciénaga, 2026-12-01 08:00). Capacidad efectiva: 10.');
    expect(onSaved.mock.calls[0][0]).not.toMatch(/datos de prueba/i);
  });

  it('C·vehicles_ticked_for_a_tour_that_was_changed_to_one_without_transport_are_not_sent', async () => {
    const { posts, onSaved } = setup(() => ({ ...created, capacity: 12, vehicles: [], vehicleCapacity: 0, transportRequired: false }));
    await fill('t-2');
    fireEvent.click(await screen.findByRole('checkbox', { name: /Van VAN-204/ }));
    fireEvent.change(screen.getByLabelText('Tour'), { target: { value: 't-1' } });
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(posts()[0][1]?.body).not.toHaveProperty('vehicleIds');
  });

  it('C·a_vehicle_that_the_service_finds_busy_is_a_refusal_the_person_can_read', async () => {
    const { onSaved } = setup(() => Promise.reject({ status: 422, code: 'BUSINESS_RULE_VIOLATION' }));
    await fill('t-2');
    fireEvent.click(await screen.findByRole('checkbox', { name: /Van VAN-204/ }));
    save();
    expect(await screen.findByText(/un vehículo ya está en otra salida a esa hora/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /Van VAN-204/ })).toBeChecked();
  });

  it('C·a_vehicle_ticked_before_the_tour_changed_to_one_without_transport_does_not_block_the_save', async () => {
    const busy = {
      code: 'SAL-009',
      tourId: 't-2',
      start: '2026-12-01T09:00',
      end: '2026-12-01T12:00',
      vehicleIds: ['v-1'],
      booked: 0,
      reservations: 0,
      status: 'SCHEDULED' as const,
    };
    const { posts, onSaved } = setup(() => ({ ...created, capacity: 12, vehicles: [], vehicleCapacity: 0, transportRequired: false }), {
      ...createDeparturesFixture(),
      listDepartures: async () => [busy],
    });
    await fill('t-2');
    fireEvent.click(await screen.findByRole('checkbox', { name: /Van VAN-204/ }));
    fireEvent.change(screen.getByLabelText('Tour'), { target: { value: 't-1' } });
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/ya está asignado a SAL-009/)).not.toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });
});
