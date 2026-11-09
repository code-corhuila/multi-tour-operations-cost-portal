import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDepartureFixture } from './fixture';
import { DepartureExecutionPage } from './DepartureExecutionPage';
import type { ApiClient } from '../../contract';
import { createExecutionGateway } from './execution';
import type { DepartureExecutionGateway } from './gateway';
import { panelsFor } from './panels';

const setup = (code = 'SAL-018', canManage = true, gateway: DepartureExecutionGateway = createDepartureFixture()) => {
  const onBack = vi.fn();
  render(<DepartureExecutionPage gateway={gateway} code={code} canManage={canManage} onBack={onBack} />);
  return { gateway, onBack };
};

const typeStart = (value: string) => fireEvent.change(screen.getByLabelText('Hora de inicio real'), { target: { value } });
const clickStart = () => fireEvent.click(screen.getByRole('button', { name: 'Registrar inicio real' }));

// Spec 004 PT-07 (RN-OPS-PT-30, -31, -32, -33, -39, -40, -41, -42): the page of the Mockup admin-registrar-ejecucion.html
// over the test data of the departure gateway.
describe('panels of a departure (RN-OPS-PT-31)', () => {
  it('U·panels_follow_the_status_of_the_departure: each status shows only its panels', () => {
    expect(panelsFor('SCHEDULED')).toEqual(['departure', 'start', 'reservations', 'history']);
    expect(panelsFor('IN_EXECUTION')).toEqual(['departure', 'reservations', 'novelties', 'finish', 'history']);
    expect(panelsFor('PENDING_REGULARIZATION')).toEqual(['departure', 'regularize', 'reservations', 'history']);
    expect(panelsFor('FINISHED')).toEqual(['departure', 'reservations', 'novelties', 'history']);
    expect(panelsFor('CANCELLED')).toEqual(['departure', 'reservations', 'history']);
  });
});

describe('departure execution page', () => {
  it('U·page_is_labelled_test_data: the header, the link back and the label', async () => {
    const { onBack } = setup();
    expect(await screen.findByRole('heading', { name: 'Registrar ejecución de salida' })).toBeInTheDocument();
    expect(screen.getByText('RF-007 · RN-EJE-001')).toBeInTheDocument();
    expect(screen.getByText('Datos de prueba')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a salidas' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('U·departure_panel_shows_the_code_status_and_its_list: the data of the departure', async () => {
    setup();
    const panel = (await screen.findByRole('heading', { name: 'SAL-018' })).closest('section') as HTMLElement;
    expect(within(panel).getByText('Programada')).toBeInTheDocument();
    for (const label of ['Vehículos asignados', 'Capacidad y cupos', 'Inicio real', 'Finalización real', 'Marca']) {
      expect(within(panel).getByText(label)).toBeInTheDocument();
    }
  });

  it('U·only_the_panels_of_the_status_are_drawn: a scheduled departure has the start, an executing one does not', async () => {
    setup('SAL-018');
    expect(await screen.findByRole('heading', { name: 'Registrar el inicio real' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Historial de la salida' })).toBeInTheDocument();
  });

  it('U·start_is_refused_unless_the_departure_is_scheduled: an executing departure cannot be started again', async () => {
    const gateway = createDepartureFixture();
    await expect(gateway.registerStart({ code: 'SAL-021', startedAt: '2026-10-14T09:00', key: 'k-refused' })).rejects.toThrow('INVALID_STATUS_TRANSITION');
    await expect(gateway.registerStart({ code: 'SAL-018', startedAt: '2026-10-18T08:30', key: 'k-ok' })).resolves.toMatchObject({ status: 'IN_EXECUTION' });
  });

  it('U·forms_are_disabled_without_the_permission: the note shows and the start cannot be sent', async () => {
    const { gateway } = setup('SAL-018', false);
    const spy = vi.spyOn(gateway, 'registerStart');
    expect(await screen.findByText(/no tiene el permiso Gestionar ejecución de salidas/)).toBeInTheDocument();
    expect(screen.getByLabelText('Hora de inicio real')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Registrar inicio real' })).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('U·start_is_required_and_not_before_the_scheduled_time: the error is beside the field and nothing is sent', async () => {
    const { gateway } = setup();
    const spy = vi.spyOn(gateway, 'registerStart');
    await screen.findByLabelText('Hora de inicio real');
    clickStart();
    expect(await screen.findByText('Ingresa la hora de inicio real.')).toBeInTheDocument();
    typeStart('2026-10-18T07:00');
    clickStart();
    expect(await screen.findByText('El inicio real no puede ser anterior a la hora programada.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('U·fields_have_label_and_error: the error is tied to the field', async () => {
    setup();
    const field = await screen.findByLabelText('Hora de inicio real');
    clickStart();
    const message = await screen.findByText('Ingresa la hora de inicio real.');
    expect(field).toHaveAttribute('aria-describedby', message.id);
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('U·start_moves_the_departure_to_execution_and_logs_it: status, start time and one history row', async () => {
    setup();
    await screen.findByLabelText('Hora de inicio real');
    typeStart('2026-10-18T08:10');
    clickStart();
    const panel = (await screen.findByText('En ejecución')).closest('section') as HTMLElement;
    expect(within(panel).getByText(/2026-10-18 08:10/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Registrar el inicio real' })).not.toBeInTheDocument();
    const history = screen.getByRole('heading', { name: 'Historial de la salida' }).closest('section') as HTMLElement;
    expect(within(history).getByText('Inicio de la salida')).toBeInTheDocument();
    expect(within(history).getAllByText('Operador demo')).toHaveLength(2);
  });

  it('U·submit_is_disabled_while_sending: one call and the button is blocked until it answers', async () => {
    const gateway = createDepartureFixture();
    let release: () => void = () => undefined;
    const original = gateway.registerStart.bind(gateway);
    gateway.registerStart = (input) => new Promise((resolve) => (release = () => resolve(original(input))));
    setup('SAL-018', true, gateway);
    await screen.findByLabelText('Hora de inicio real');
    typeStart('2026-10-18T08:10');
    clickStart();
    expect(await screen.findByRole('button', { name: 'Registrar inicio real' })).toBeDisabled();
    release();
    expect(await screen.findByText('En ejecución')).toBeInTheDocument();
  });

  it('U·failure_keeps_the_data_and_offers_retry: the message, the typed value and a retry', async () => {
    const gateway = createDepartureFixture();
    const original = gateway.registerStart.bind(gateway);
    gateway.registerStart = vi.fn().mockRejectedValueOnce(new Error('x')).mockImplementation(original);
    setup('SAL-018', true, gateway);
    await screen.findByLabelText('Hora de inicio real');
    typeStart('2026-10-18T08:10');
    clickStart();
    expect(await screen.findByText('No pudimos registrar el inicio. Tus datos siguen aquí.')).toBeInTheDocument();
    expect(screen.getByLabelText('Hora de inicio real')).toHaveValue('2026-10-18T08:10');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('En ejecución')).toBeInTheDocument();
  });

  it('U·retry_with_the_same_data_reuses_the_key: both sends carry the same key', async () => {
    const gateway = createDepartureFixture();
    const original = gateway.registerStart.bind(gateway);
    const keys: string[] = [];
    gateway.registerStart = vi.fn(async (input) => {
      keys.push(input.key);
      if (keys.length === 1) throw new Error('x');
      return original(input);
    });
    setup('SAL-018', true, gateway);
    await screen.findByLabelText('Hora de inicio real');
    typeStart('2026-10-18T08:10');
    clickStart();
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await screen.findByText('En ejecución');
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0].length).toBeGreaterThanOrEqual(8);
  });

  it('U·changed_data_gets_a_new_key: another time after a failure is another request', async () => {
    const gateway = createDepartureFixture();
    const original = gateway.registerStart.bind(gateway);
    const keys: string[] = [];
    gateway.registerStart = vi.fn(async (input) => {
      keys.push(input.key);
      if (keys.length === 1) throw new Error('x');
      return original(input);
    });
    setup('SAL-018', true, gateway);
    await screen.findByLabelText('Hora de inicio real');
    typeStart('2026-10-18T08:10');
    clickStart();
    await screen.findByRole('button', { name: 'Reintentar' });
    typeStart('2026-10-18T08:20');
    clickStart();
    await screen.findByText('En ejecución');
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('U·departure_has_four_states: loading, error with retry, not found and data', async () => {
    const gateway = createDepartureFixture();
    const read = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
    render(<DepartureExecutionPage gateway={{ ...gateway, getDeparture: read }} code="SAL-018" canManage onBack={vi.fn()} />);
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('Cargando');
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No encontramos esta salida.')).toBeInTheDocument();
  });
  it('U·every_scheduled_departure_of_the_list_can_be_opened: SAL-025 exists in the execution fixture', async () => {
    const gateway = createDepartureFixture();
    await expect(gateway.getDeparture('SAL-025')).resolves.toMatchObject({ code: 'SAL-025', status: 'SCHEDULED' });
  });
});

// Spec 008 PT8-02 (AC-PT-08.2, -08.8): over the gateway that talks to the service the page shows only real data and the panels it offers.
describe('departure execution page over the service (spec 008)', () => {
  const real = (extra: object = {}): DepartureExecutionGateway => ({
    ...createDepartureFixture(),
    connected: true,
    panels: ['departure'],
    getDeparture: async () => ({
      code: 'SAL-031',
      status: 'FINISHED',
      vehicles: ['Van'],
      capacity: 12,
      booked: 5,
      scheduledStart: '2026-12-01T08:00',
      scheduledEnd: '2026-12-01T16:00',
      actualStart: '2026-12-01T08:07',
      actualEnd: '2026-12-01T14:00',
      mark: 'Interrumpida',
      interruptionCause: 'Heavy rain closed the trail',
      reservations: [],
      novelties: [],
      history: [],
      ...extra,
    }),
  });

  it('U·no_test_data_label_and_only_the_panels_the_service_offers', async () => {
    setup('SAL-031', true, real());
    expect(await screen.findByRole('heading', { name: 'SAL-031' })).toBeInTheDocument();
    expect(screen.queryByText('Datos de prueba')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Historial de la salida' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Reservas/ })).not.toBeInTheDocument();
  });

  it('U·the_real_times_the_vehicles_and_the_interruption_are_shown', async () => {
    setup('SAL-031', true, real());
    const panel = (await screen.findByRole('heading', { name: 'SAL-031' })).closest('section') as HTMLElement;
    expect(within(panel).getByText('Van')).toBeInTheDocument();
    expect(within(panel).getByText('12 cupos · 5 reservados')).toBeInTheDocument();
    expect(within(panel).getByText('2026-12-01 08:07')).toBeInTheDocument();
    expect(within(panel).getByText('2026-12-01 14:00')).toBeInTheDocument();
    expect(within(panel).getByText('Heavy rain closed the trail')).toBeInTheDocument();
  });

  it('U·without_an_interruption_there_is_no_cause_row_and_a_missing_end_shows_a_dash', async () => {
    setup('SAL-031', true, real({ status: 'IN_EXECUTION', mark: '', interruptionCause: undefined, actualEnd: undefined }));
    const panel = (await screen.findByRole('heading', { name: 'SAL-031' })).closest('section') as HTMLElement;
    expect(within(panel).queryByText('Causa de la interrupción')).not.toBeInTheDocument();
    expect(within(panel).getByText('Finalización real').closest('li')).toHaveTextContent('—');
  });

  it('U·a_departure_the_service_does_not_have_says_so', async () => {
    setup('SAL-404', true, { ...real(), getDeparture: async () => undefined });
    expect(await screen.findByText('No encontramos esta salida.')).toBeInTheDocument();
  });
});

// Spec 008 PT8-03 (AC-PT-08.3, -08.4, -08.6): start and end over the adapter of the service, with a fake client that plays the service.
describe('start and end over the service (spec 008)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-12-02T12:00:00') }));
  afterEach(() => vi.useRealTimers());

  const answer = (status: string, extra: object = {}) => ({
    code: 'SAL-031',
    serviceId: 'tour-1',
    status,
    scheduledStart: '2026-12-01T13:00:00Z',
    scheduledEnd: '2026-12-01T21:00:00Z',
    capacity: 12,
    booked: 0,
    pendingRegularization: false,
    interrupted: false,
    vehicles: [],
    ...extra,
  });

  function service(initial: string, onPost: (path: string, body: Record<string, unknown>) => unknown) {
    const request = vi.fn(async (path: string, init?: { method?: string; body?: Record<string, unknown> }) =>
      init?.method === 'POST' ? onPost(path, init.body ?? {}) : answer(initial),
    );
    render(
      <DepartureExecutionPage gateway={createExecutionGateway({ request } as unknown as ApiClient)} code="SAL-031" canManage onBack={vi.fn()} />,
    );
    return request;
  }

  it('U·a_start_goes_to_the_service_and_the_page_shows_the_departure_in_execution_with_the_finish_panel', async () => {
    const request = service('SCHEDULED', () => answer('IN_EXECUTION', { actualStart: '2026-12-01T13:10:00Z' }));
    await screen.findByRole('heading', { name: 'SAL-031' });
    typeStart('2026-12-01T08:10');
    clickStart();
    expect(await screen.findByRole('heading', { name: 'Registrar la finalización o la interrupción' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Registrar el inicio real' })).not.toBeInTheDocument();
    expect(screen.getByText('2026-12-01 08:10')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(
      '/api/v1/operations-cost/departures/SAL-031/executions',
      expect.objectContaining({ method: 'POST', body: { startedAt: '2026-12-01T13:10:00Z' } }),
    );
  });

  it('U·an_early_start_is_refused_beside_the_field_and_nothing_is_sent', async () => {
    const request = service('SCHEDULED', () => answer('IN_EXECUTION'));
    await screen.findByRole('heading', { name: 'SAL-031' });
    typeStart('2026-12-01T07:00');
    clickStart();
    expect(await screen.findByText('El inicio real no puede ser anterior a la hora programada.')).toBeInTheDocument();
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('U·a_refusal_of_the_service_is_said_and_the_data_stay', async () => {
    service('SCHEDULED', () => Promise.reject({ status: 422, code: 'BUSINESS_RULE_VIOLATION', traceId: 't-1' }));
    await screen.findByRole('heading', { name: 'SAL-031' });
    typeStart('2026-12-01T08:10');
    clickStart();
    expect(await screen.findByText(/El servicio no aceptó el inicio/)).toBeInTheDocument();
    expect(screen.getByLabelText('Hora de inicio real')).toHaveValue('2026-12-01T08:10');
    expect(screen.queryByText(/t-1/)).not.toBeInTheDocument();
  });

  it('U·a_retry_after_the_network_failed_reuses_the_key', async () => {
    let calls = 0;
    const request = service('SCHEDULED', () => (++calls === 1 ? Promise.reject({ status: 503, code: 'SERVICE_UNAVAILABLE' }) : answer('IN_EXECUTION', { actualStart: '2026-12-01T13:10:00Z' })));
    await screen.findByRole('heading', { name: 'SAL-031' });
    typeStart('2026-12-01T08:10');
    clickStart();
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('heading', { name: 'Registrar la finalización o la interrupción' });
    const keys = request.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => (init as { headers: Record<string, string> }).headers['Idempotency-Key']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('U·an_interruption_with_its_cause_ends_the_departure_and_shows_it', async () => {
    service('IN_EXECUTION', (_path, body) =>
      answer('FINISHED', { actualStart: '2026-12-01T13:10:00Z', actualEnd: '2026-12-01T19:00:00Z', interrupted: body.result === 'INTERRUPTED', interruptionCause: body.cause }),
    );
    await screen.findByRole('heading', { name: 'SAL-031' });
    fireEvent.change(await screen.findByLabelText('Hora de finalización real'), { target: { value: '2026-12-01T14:00' } });
    fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: 'INTERRUPTED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar finalización' }));
    expect(await screen.findByText('Ingresa la causa y la evidencia de la interrupción.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Interrupción (causa y evidencia)'), { target: { value: 'Heavy rain closed the trail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar finalización' }));
    await screen.findByText('Causa de la interrupción');
    expect(await screen.findByText('Heavy rain closed the trail')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Registrar la finalización o la interrupción' })).not.toBeInTheDocument();
  });

  it('U·a_start_in_the_future_is_refused_beside_the_field_and_nothing_is_sent', async () => {
    const request = service('SCHEDULED', () => answer('IN_EXECUTION'));
    await screen.findByRole('heading', { name: 'SAL-031' });
    typeStart('2026-12-03T08:10');
    clickStart();
    expect(await screen.findByText('El inicio real no puede ser posterior a este momento.')).toBeInTheDocument();
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('U·the_end_is_refused_before_the_real_start_and_in_the_future_and_nothing_is_sent', async () => {
    const request = service('IN_EXECUTION', () => answer('FINISHED'));
    await screen.findByRole('heading', { name: 'SAL-031' });
    fireEvent.change(await screen.findByLabelText('Hora de finalización real'), { target: { value: '2026-12-01T07:59' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar finalización' }));
    expect(await screen.findByText('La finalización real no puede ser anterior al inicio real ni a la hora programada.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hora de finalización real'), { target: { value: '2026-12-03T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar finalización' }));
    expect(await screen.findByText('La finalización real no puede ser posterior a este momento.')).toBeInTheDocument();
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('U·each_refusal_of_the_service_is_told_by_its_code', async () => {
    service('SCHEDULED', () => Promise.reject({ status: 422, code: 'INVALID_STATUS_TRANSITION' }));
    await screen.findByRole('heading', { name: 'SAL-031' });
    typeStart('2026-12-01T08:10');
    clickStart();
    expect(await screen.findByText(/ya no está en el estado que esperaba este registro/)).toBeInTheDocument();
  });

  it('U·the_cause_is_limited_to_1000_characters_and_a_cause_typed_for_an_interruption_does_not_change_the_key_of_a_normal_end', async () => {
    let calls = 0;
    const request = service('IN_EXECUTION', () => (++calls === 1 ? Promise.reject({ status: 503, code: 'SERVICE_UNAVAILABLE' }) : answer('FINISHED', { actualEnd: '2026-12-01T19:00:00Z' })));
    await screen.findByRole('heading', { name: 'SAL-031' });
    fireEvent.change(await screen.findByLabelText('Hora de finalización real'), { target: { value: '2026-12-01T14:00' } });
    fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: 'INTERRUPTED' } });
    const cause = screen.getByLabelText('Interrupción (causa y evidencia)');
    expect(cause).toHaveAttribute('maxlength', '1000');
    fireEvent.change(cause, { target: { value: 'typed and then dropped' } });
    fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: 'FINISHED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar finalización' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2));
    const posts = request.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => init as { headers: Record<string, string>; body: Record<string, unknown> });
    expect(posts[0].body).not.toHaveProperty('cause');
    expect(posts[1].headers['Idempotency-Key']).toBe(posts[0].headers['Idempotency-Key']);
  });
});
