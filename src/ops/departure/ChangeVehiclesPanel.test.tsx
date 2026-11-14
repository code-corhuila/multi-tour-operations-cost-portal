import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../contract';
import { DepartureExecutionPage } from './DepartureExecutionPage';
import { createExecutionGateway } from './execution';

afterEach(cleanup);

const SAGA = '/api/v1/sagas/change-departure-vehicles';
const VAN = { vehicleId: 'veh-1', name: 'Van', capacity: 12 };
const BUS = { vehicleId: 'veh-2', name: 'Bus', capacity: 30 };
const MOTO = { vehicleId: 'veh-3', name: 'Moto', capacity: 4 };

const departure = (vehicles: object[], capacity: number, status = 'SCHEDULED') => ({
  code: 'SAL-031',
  serviceId: 'tour-1',
  status,
  scheduledStart: '2026-12-01T13:00:00Z',
  scheduledEnd: '2026-12-01T21:00:00Z',
  timeZone: 'America/Bogota',
  capacity,
  booked: 3,
  tourCapacity: 20,
  transportRequired: true,
  pendingRegularization: false,
  startAlert: false,
  interrupted: false,
  vehicles,
  reservations: [],
});
const saga = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 's-1',
  status,
  departureCode: 'SAL-031',
  completedSteps: [],
  createdAt: '2026-11-14T10:00:00Z',
  updatedAt: '2026-11-14T10:00:01Z',
  ...extra,
});

type Init = { method?: string; body?: Record<string, unknown>; headers?: Record<string, string> };

// The page over the connected adapter with a fake client of the container (the same shape as the tests of spec 008).
function service(
  opts: { status?: string; canSchedule?: boolean; vehicles?: () => Promise<object[]>; onSaga?: (body: Record<string, unknown>) => unknown; onRead?: () => unknown } = {},
) {
  let current = departure([VAN], 12, opts.status);
  const request = vi.fn(async (path: string, init?: Init) => {
    if (path.includes('/vehicles?')) {
      const data = await (opts.vehicles ?? (async () => [VAN, BUS, MOTO]))();
      return { data, meta: { page: 1, limit: 100, total: data.length, totalPages: 1 } };
    }
    if (path.endsWith('/costs')) return { data: [], totalCents: 0, travelersServed: 0 };
    if (path === SAGA && init?.method === 'POST') {
      const answer = await (opts.onSaga ?? (() => saga('COMPLETED')))(init.body ?? {});
      if ((answer as { status?: string }).status === 'COMPLETED') current = departure([BUS], 20);
      return answer;
    }
    if (path === `${SAGA}/s-1`) {
      const answer = await (opts.onRead ?? (() => saga('COMPLETED')))();
      if ((answer as { status?: string }).status === 'COMPLETED') current = departure([BUS], 20);
      return answer;
    }
    return current;
  });
  render(
    <DepartureExecutionPage
      gateway={createExecutionGateway({ request } as unknown as ApiClient)}
      code="SAL-031"
      canManage
      canSchedule={opts.canSchedule ?? true}
      onBack={vi.fn()}
    />,
  );
  return request;
}

const panel = async () => (await screen.findByRole('heading', { name: 'Cambiar vehículos' })).closest('section') as HTMLElement;
const box = (p: HTMLElement, name: RegExp) => within(p).getByLabelText(name);
const confirm = (p: HTMLElement) => fireEvent.click(within(p).getByRole('button', { name: 'Confirmar cambio' }));
const posts = (request: ReturnType<typeof service>) =>
  request.mock.calls.filter(([path, init]) => path === SAGA && (init as Init | undefined)?.method === 'POST').map(([, init]) => init as Init);

// Spec 016 (HU-OPS-002 AC4): the Administrator starts the saga that changes the whole set of vehicles of a scheduled departure.
describe('the panel Cambiar vehículos (spec 016)', () => {
  it('U·the_preview_is_the_lower_of_the_tour_and_the_chosen_vehicles', async () => {
    const request = service();
    const p = await panel();
    await within(p).findByLabelText(/Bus/);
    expect(box(p, /Van/)).toBeChecked();
    expect(within(p).getByText('Capacidad hoy: 12')).toBeInTheDocument();
    expect(within(p).getByText('Capacidad con el nuevo conjunto: 12')).toBeInTheDocument();
    fireEvent.click(box(p, /Bus/));
    expect(within(p).getByText('Capacidad con el nuevo conjunto: 20')).toBeInTheDocument();
    fireEvent.click(box(p, /Van/));
    fireEvent.click(box(p, /Bus/));
    fireEvent.click(box(p, /Moto/));
    expect(within(p).getByText('Capacidad con el nuevo conjunto: 4')).toBeInTheDocument();
    expect(posts(request)).toHaveLength(0);
  });

  it('U·the_change_goes_to_the_saga_with_the_set_and_a_key_and_the_departure_is_read_again', async () => {
    const request = service();
    const p = await panel();
    fireEvent.click(await within(p).findByLabelText(/Bus/));
    fireEvent.click(box(p, /Van/));
    confirm(p);
    expect(await within(p).findByText(/Vehículos cambiados\. Capacidad efectiva: 20\./)).toBeInTheDocument();
    const [post] = posts(request);
    expect(post.body).toEqual({ departureCode: 'SAL-031', vehicleIds: ['veh-2'] });
    expect(post.headers?.['Idempotency-Key']).toBeTruthy();
    const order = request.mock.calls.map(([path]) => path);
    expect(order.slice(order.indexOf(SAGA))).toContain('/api/v1/operations-cost/departures/SAL-031');
    expect(screen.getByText('20 cupos · 3 reservados')).toBeInTheDocument();
  });

  it('U·each_answer_of_the_saga_is_told_and_a_change_in_course_is_read_again_when_asked', async () => {
    const told: [object, RegExp][] = [
      [saga('COMPENSATED', { reason: 'SEATS_HELD', failedStep: 'LOWER_CEILING' }), /más cupos reservados que la nueva capacidad.*No se cambió nada/],
      [saga('COMPENSATED', { reason: 'VEHICLES_REFUSED', failedStep: 'APPLY_VEHICLES' }), /rechazó los vehículos.*No se cambió nada/],
      [saga('FAILED', { reason: 'COMPENSATION_FAILED', failedStep: 'APPLY_VEHICLES' }), /una persona debe revisarlo.*s-1/],
    ];
    for (const [answer, text] of told) {
      service({ onSaga: () => answer });
      const p = await panel();
      fireEvent.click(await within(p).findByLabelText(/Bus/));
      confirm(p);
      expect(await within(p).findByText(text)).toBeInTheDocument();
      cleanup();
    }
    const request = service({ onSaga: () => saga('RUNNING', { completedSteps: ['LOWER_CEILING'] }) });
    const p = await panel();
    fireEvent.click(await within(p).findByLabelText(/Bus/));
    confirm(p);
    expect(await within(p).findByText(/El cambio está en curso/)).toBeInTheDocument();
    fireEvent.click(within(p).getByRole('button', { name: 'Volver a consultar' }));
    expect(await within(p).findByText(/Vehículos cambiados/)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(`${SAGA}/s-1`);
    expect(posts(request)).toHaveLength(1);
  });

  it('U·the_change_is_not_offered_to_a_collaborator_or_on_a_departure_that_is_not_scheduled', async () => {
    for (const opts of [{ canSchedule: false }, { status: 'IN_EXECUTION' }, { status: 'FINISHED' }]) {
      service(opts);
      await screen.findByRole('heading', { name: 'SAL-031' });
      expect(screen.queryByRole('heading', { name: 'Cambiar vehículos' })).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('U·loading_an_error_with_retry_an_empty_list_and_the_data_are_each_drawn', async () => {
    let fail = true;
    let release: () => void = () => {};
    service({
      vehicles: () =>
        new Promise((resolve, reject) => {
          release = () => (fail ? reject(new Error('down')) : resolve([VAN, BUS]));
        }),
    });
    let p = await panel();
    expect(within(p).getByRole('status')).toHaveTextContent('Cargando…');
    release();
    expect(await within(p).findByText('No pudimos cargar los vehículos.')).toBeInTheDocument();
    fail = false;
    fireEvent.click(within(p).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(within(p).getByRole('status')).toHaveTextContent('Cargando…'));
    release();
    expect(await within(p).findByLabelText(/Bus/)).toBeInTheDocument();
    cleanup();
    service({ vehicles: async () => [] });
    p = await panel();
    expect(await within(p).findByText('No hay vehículos para elegir.')).toBeInTheDocument();
  });

  it('U·a_retry_keeps_the_key_and_a_new_set_changes_it_and_the_button_is_disabled_while_pending', async () => {
    let release: () => void = () => {};
    const request = service({
      onSaga: () =>
        new Promise((_, reject) => {
          release = () => reject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
        }),
    });
    const keys = () => posts(request).map((init) => init.headers?.['Idempotency-Key']);
    const p = await panel();
    fireEvent.click(await within(p).findByLabelText(/Bus/));
    confirm(p);
    await waitFor(() => expect(within(p).getByRole('button', { name: 'Confirmar cambio' })).toBeDisabled());
    release();
    fireEvent.click(await within(p).findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(keys()).toHaveLength(2));
    release();
    await within(p).findByRole('button', { name: 'Reintentar' });
    expect(keys()[1]).toBe(keys()[0]);
    fireEvent.click(box(p, /Moto/));
    confirm(p);
    await waitFor(() => expect(keys()).toHaveLength(3));
    expect(keys()[2]).not.toBe(keys()[0]);
  });

  it('U·an_empty_set_is_told_next_to_the_group_and_nothing_is_sent', async () => {
    const request = service();
    const p = await panel();
    fireEvent.click(await within(p).findByLabelText(/Van/));
    confirm(p);
    expect(await within(p).findByText('Elige al menos un vehículo.')).toHaveAttribute('id', 'change-vehicles-error');
    expect(within(p).getByRole('group', { name: 'Vehículos de la salida' })).toHaveAttribute('aria-describedby', 'change-vehicles-error');
    expect(posts(request)).toHaveLength(0);
  });
});
