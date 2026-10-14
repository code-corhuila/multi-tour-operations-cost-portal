import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DepartureExecutionPage } from './DepartureExecutionPage';
import { createDepartureFixture } from './fixture';
import type { DepartureExecutionGateway } from './gateway';

const setup = (code: string, gateway: DepartureExecutionGateway = createDepartureFixture()) => {
  render(<DepartureExecutionPage gateway={gateway} code={code} canManage onBack={vi.fn()} />);
  return gateway;
};

const section = async (name: string) => (await screen.findByRole('heading', { name })).closest('section') as HTMLElement;

// Spec 004 PT-08 (RN-OPS-PT-34 to -37, -40, -41): services, novelties and the finish of an executing departure.
describe('services of the reservations (RN-OPS-PT-34, -35)', () => {
  it('U·causal_required_for_each_undelivered_service: nothing is saved without it', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'registerServices');
    const panel = await section('Lo reservado y lo efectivamente prestado');
    fireEvent.change(within(panel).getAllByLabelText('Resultado')[0], { target: { value: 'NOT_DELIVERED' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar servicios' }));
    expect(await within(panel).findByText('La causal es obligatoria para un servicio no prestado.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(within(panel).getAllByLabelText('Causal si no se prestó')[0], { target: { value: 'Clima adverso' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar servicios' }));
    expect(await within(panel).findByText(/Servicios guardados/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('U·reserved_stays_next_to_delivered: the reserved numbers do not change after recording', async () => {
    setup('SAL-021');
    const panel = await section('Lo reservado y lo efectivamente prestado');
    expect(within(panel).getByText(/#RES-1002 · Cliente de prueba · 4 viajeros/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar servicios' }));
    expect(await within(panel).findByText(/Servicios guardados/)).toBeInTheDocument();
    expect(within(panel).getByText(/#RES-1002 · Cliente de prueba · 4 viajeros/)).toBeInTheDocument();
    expect(within(panel).getByText('Reservado: 4 · Ejecutado: 4')).toBeInTheDocument();
  });

  it('U·finished_departure_shows_reserved_and_executed: read only', async () => {
    setup('SAL-009');
    const panel = await section('Lo reservado y lo efectivamente prestado');
    expect(within(panel).getByText('Reservado: 7 · Ejecutado: 7')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Guardar servicios' })).not.toBeInTheDocument();
  });
});

describe('novelties (RN-OPS-PT-36)', () => {
  it('U·novelty_requires_text_and_emergency_has_affected_travelers: the text, then the integer from 1 to the reserved', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'registerNovelty');
    const panel = await section('Novedades y emergencia personal del cliente');
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar novedad' }));
    expect(await within(panel).findByText('Ingresa la novedad.')).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText('Novedad'), { target: { value: 'Pinchazo de llanta' } });
    expect(within(panel).queryByLabelText('Viajeros afectados')).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByLabelText(/Emergencia personal del cliente/));
    fireEvent.change(within(panel).getByLabelText('Viajeros afectados'), { target: { value: '9' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar novedad' }));
    expect(await within(panel).findByText('Ingresa un número entero de 1 a 4.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(within(panel).getByLabelText('Viajeros afectados'), { target: { value: '2' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar novedad' }));
    expect(await within(panel).findByText('Emergencia personal')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('finish of the departure (RN-OPS-PT-37)', () => {
  it('U·finish_requires_time_and_interruption_cause: time first, then the cause for an interruption', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'registerFinish');
    const panel = await section('Registrar la finalización o la interrupción');
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar finalización' }));
    expect(await within(panel).findByText('Ingresa la hora de finalización real.')).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText('Hora de finalización real'), { target: { value: '2026-10-14T12:30' } });
    fireEvent.change(within(panel).getByLabelText('Resultado'), { target: { value: 'INTERRUPTED' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar finalización' }));
    expect(await within(panel).findByText('Ingresa la causa y la evidencia de la interrupción.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(within(panel).getByLabelText('Interrupción (causa y evidencia)'), { target: { value: 'Tormenta, foto adjunta' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar finalización' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Registrar la finalización o la interrupción' })).not.toBeInTheDocument());
    expect(within(await section('SAL-021')).getByText('Finalizada')).toBeInTheDocument();
    const history = (await screen.findByRole('heading', { name: 'Historial de la salida' })).closest('section') as HTMLElement;
    expect(within(history).getByText('Finalización')).toBeInTheDocument();
  });

  it('U·finish_keeps_the_key_rules: a failure keeps the data and the same key is reused', async () => {
    const gateway = createDepartureFixture();
    const original = gateway.registerFinish.bind(gateway);
    const keys: string[] = [];
    gateway.registerFinish = vi.fn(async (input) => {
      keys.push(input.key);
      if (keys.length === 1) throw new Error('x');
      return original(input);
    });
    setup('SAL-021', gateway);
    const panel = await section('Registrar la finalización o la interrupción');
    fireEvent.change(within(panel).getByLabelText('Hora de finalización real'), { target: { value: '2026-10-14T12:30' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar finalización' }));
    fireEvent.click(await within(panel).findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Registrar la finalización o la interrupción' })).not.toBeInTheDocument());
    expect(within(await section('SAL-021')).getByText('Finalizada')).toBeInTheDocument();
    expect(keys[0]).toBe(keys[1]);
  });
});
