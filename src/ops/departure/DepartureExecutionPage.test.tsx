import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDepartureFixture } from './fixture';
import { DepartureExecutionPage } from './DepartureExecutionPage';
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
});
