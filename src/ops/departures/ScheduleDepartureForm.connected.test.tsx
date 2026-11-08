import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../contract';
import { createDeparturesFixture } from './fixture';
import { ScheduleDepartureForm } from './ScheduleDepartureForm';
import { createDeparturesGateway } from './scheduling';

// Spec 006 PT6-03: the form over the mixed gateway (tours and scheduling from the service, the rest on test data).
const catalog = (services: object[]) => ({ data: services, meta: { page: 1, limit: 100, total: services.length, totalPages: 1 } });
const tour = (id: string, name: string, capacity: number, transport: boolean) => ({ serviceId: id, commercialName: name, configuredCapacity: capacity, transportRequired: transport });
const created = { code: 'SAL-004', status: 'SCHEDULED', scheduledStart: '2026-12-01T13:00:00Z', scheduledEnd: '2026-12-01T19:00:00Z', capacity: 12, booked: 0, vehicles: [], reservations: [], novelties: [] };

function setup(handler: (path: string, init?: { headers?: Record<string, string> }) => unknown | Promise<unknown>) {
  const request = vi.fn(async (path: string, init?: { headers?: Record<string, string> }) => handler(path, init));
  const gateway = createDeparturesGateway({ request } as unknown as ApiClient, createDeparturesFixture());
  const onSaved = vi.fn();
  const onBack = vi.fn();
  render(<ScheduleDepartureForm gateway={gateway} onBack={onBack} onSaved={onSaved} />);
  const posts = () => request.mock.calls.filter(([path]) => path.includes('operations-cost'));
  return { request, posts, onSaved };
}

const tours = [tour('t-1', 'Cañón del río', 12, false), tour('t-2', 'Bote por la ciénaga', 10, true)];
const ok = (path: string) => (path.includes('catalog') ? catalog(tours) : created);
const fill = async (tourId = 't-1', end = '14:00') => {
  fireEvent.change(await screen.findByLabelText('Tour'), { target: { value: tourId } });
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-12-01' } });
  fireEvent.change(screen.getByLabelText('Hora de inicio programada'), { target: { value: '08:00' } });
  fireEvent.change(screen.getByLabelText('Hora de finalización estimada'), { target: { value: end } });
};
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar salida' }));
const reject = (error: object) => (path: string) => (path.includes('catalog') ? catalog(tours) : Promise.reject(error));

describe('the connected form (spec 006)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('C·the_four_states_of_the_tours: loading, error with retry, empty and tours', async () => {
    let fail = true;
    setup(() => (fail ? Promise.reject({ status: 503, code: 'SERVICE_UNAVAILABLE' }) : catalog(tours)));
    expect(screen.getByRole('status')).toHaveTextContent('Cargando');
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los datos de la salida.');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Tour')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cañón del río' })).toBeInTheDocument();
  });

  it('C·no_tour_offered_is_said', async () => {
    setup(() => catalog([]));
    expect(await screen.findByText('El catálogo no tiene tours activos para programar.')).toBeInTheDocument();
  });

  it('C·only_active_tours_are_asked_for_and_offered', async () => {
    const { request } = setup(ok);
    await screen.findByLabelText('Tour');
    expect(request.mock.calls[0][0]).toContain('serviceType=TOUR&catalogStatus=ACTIVE');
  });

  it('C·no_vehicles_are_offered_and_the_capacity_is_the_tour_one', async () => {
    setup(ok);
    fireEvent.change(await screen.findByLabelText('Tour'), { target: { value: 't-1' } });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/Los vehículos se asignan después \(HU-OPS-002\)/)).toBeInTheDocument();
    expect(screen.getByText('Capacidad de la salida: 12 viajeros (la del tour).')).toBeInTheDocument();
    expect(screen.queryByText('Datos de prueba')).not.toBeInTheDocument();
  });

  it('C·a_tour_with_mandatory_transport_schedules_with_a_notice', async () => {
    const { posts } = setup(ok);
    await fill('t-2');
    expect(screen.getByText(/su capacidad es la del tour hasta que se asignen los vehículos/)).toBeInTheDocument();
    expect(screen.getByText('Capacidad de la salida: 10 viajeros (la del tour).')).toBeInTheDocument();
    save();
    await waitFor(() => expect(posts()).toHaveLength(1));
  });

  it('C·scheduling_shows_the_real_code_and_says_the_list_is_test_data', async () => {
    const { onSaved, posts } = setup(ok);
    await fill();
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved.mock.calls[0][0]).toContain('Salida SAL-004 programada (Cañón del río, 2026-12-01 08:00). Capacidad: 12.');
    expect(onSaved.mock.calls[0][0]).toContain('La lista muestra datos de prueba');
    expect(posts()[0][1]).toMatchObject({ method: 'POST', body: { serviceId: 't-1', scheduledStart: '2026-12-01T13:00:00Z', scheduledEnd: '2026-12-01T19:00:00Z' } });
  });

  it('C·the_button_is_disabled_while_saving', async () => {
    let release!: (value: unknown) => void;
    const { posts } = setup((path) => (path.includes('catalog') ? catalog(tours) : new Promise((resolve) => (release = resolve))));
    await fill();
    save();
    const button = await screen.findByRole('button', { name: 'Guardar salida' });
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);
    expect(posts()).toHaveLength(1);
    release(created);
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('C·a_retry_reuses_the_key_and_another_save_does_not', async () => {
    let calls = 0;
    const { posts } = setup((path) => (path.includes('catalog') ? catalog(tours) : ++calls === 1 ? Promise.reject({ status: 503, code: 'SERVICE_UNAVAILABLE' }) : created));
    await fill();
    save();
    expect(await screen.findByText(/El servicio no responde/)).toBeInTheDocument();
    save();
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1][1]?.headers?.['Idempotency-Key']).toBe(posts()[0][1]?.headers?.['Idempotency-Key']);
  });

  it('C·other_data_gets_another_key', async () => {
    const { posts } = setup((path) => (path.includes('catalog') ? catalog(tours) : Promise.reject({ status: 503, code: 'SERVICE_UNAVAILABLE' })));
    await fill();
    save();
    await screen.findByText(/El servicio no responde/);
    fireEvent.change(screen.getByLabelText('Hora de finalización estimada'), { target: { value: '15:00' } });
    save();
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1][1]?.headers?.['Idempotency-Key']).not.toBe(posts()[0][1]?.headers?.['Idempotency-Key']);
  });

  it('C·a_400_names_the_field: the message sits next to it and the data stays', async () => {
    setup(reject({ status: 400, code: 'VALIDATION_ERROR', details: [{ field: 'scheduledEnd', message: 'before the start' }] }));
    await fill();
    save();
    const end = screen.getByLabelText('Hora de finalización estimada');
    await waitFor(() => expect(end).toHaveAccessibleDescription(/finalización/));
    expect(end).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(end).toHaveValue('14:00');
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-12-01');
  });

  it('C·the_other_named_fields_and_an_unmapped_one', async () => {
    setup(reject({ status: 400, code: 'VALIDATION_ERROR', details: [{ field: 'serviceId', message: 'x' }, { field: 'scheduledStart', message: 'y' }] }));
    await fill();
    save();
    await waitFor(() => expect(screen.getByLabelText('Tour')).toHaveAccessibleDescription('El tour no es válido.'));
    expect(screen.getByLabelText('Hora de inicio programada')).toHaveAccessibleDescription('La hora de inicio no es válida.');
    cleanup();
    setup(reject({ status: 400, code: 'VALIDATION_ERROR', details: [{ field: 'timeZone', message: 'z' }] }));
    await fill();
    save();
    expect(await screen.findByText('Revisa los datos de la salida.')).toBeInTheDocument();
  });

  it('C·after_a_saved_departure_the_next_save_gets_a_new_key', async () => {
    const { posts, onSaved } = setup(ok);
    await fill();
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    save();
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1][1]?.headers?.['Idempotency-Key']).not.toBe(posts()[0][1]?.headers?.['Idempotency-Key']);
  });

  it('C·a_400_without_a_field_says_to_review_the_data', async () => {
    setup(reject({ status: 400, code: 'VALIDATION_ERROR' }));
    await fill();
    save();
    expect(await screen.findByText('Revisa los datos de la salida.')).toBeInTheDocument();
  });

  it('C·each_status_has_its_message: 422, 403 and the unknown, with no internal detail, and the form stays editable', async () => {
    const cases: [object, RegExp][] = [
      [{ status: 422, code: 'BUSINESS_RULE_VIOLATION', message: 'secret internal', traceId: 'trace-9' }, /no aceptó la salida/],
      [{ status: 403, code: 'FORBIDDEN' }, /No tienes permiso/],
      [{ status: 500, code: 'INTERNAL_ERROR', message: 'stack at db.Host', traceId: 'trace-9' }, /No pudimos guardar la salida/],
    ];
    for (const [error, text] of cases) {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      setup(reject(error));
      await fill();
      save();
      const alert = await screen.findByText(text);
      expect(alert.closest('[role="alert"]')).not.toHaveTextContent(/secret|stack|db\.Host|trace-9/);
      expect(screen.getByLabelText('Fecha')).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Guardar salida' })).toBeEnabled();
      cleanup();
    }
  });
});
