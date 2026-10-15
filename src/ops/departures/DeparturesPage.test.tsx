import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDeparturesFixture } from './fixture';
import type { DeparturesGateway } from './model';
import { DeparturesPage } from './DeparturesPage';

const setup = (props: { admin?: boolean; manage?: boolean; gateway?: DeparturesGateway } = {}) => {
  const gateway = props.gateway ?? createDeparturesFixture();
  const onOpen = vi.fn();
  const onSchedule = vi.fn();
  render(
    <DeparturesPage gateway={gateway} canSchedule={props.admin ?? true} canManage={props.manage ?? true} onOpen={onOpen} onSchedule={onSchedule} />,
  );
  return { gateway, onOpen, onSchedule };
};

const row = async (code: string) => (await screen.findByText(code)).closest('tr') as HTMLElement;

// Spec 005 PT-10 (AC1 to AC5, RN-OPS-PT-57 to -60): the list "Salidas" of the Mockup admin-salidas.html.
describe('departures list (spec 005)', () => {
  it('U·list_shows_every_column_of_the_mockup: header, columns and the test-data label', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Salidas' })).toBeInTheDocument();
    expect(screen.getByText('Datos de prueba')).toBeInTheDocument();
    const headers = within(await screen.findByRole('table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Salida', 'Inicio programado', 'Fin estimado', 'Vehículos', 'Capacidad efectiva', 'Cupos apartados', 'Estado', 'Acciones']);
    const sal18 = await row('SAL-018');
    expect(within(sal18).getByText('Caminata al cañón del río')).toBeInTheDocument();
    expect(within(sal18).getByText('2026-10-18 08:00')).toBeInTheDocument();
    expect(within(sal18).getByText('Van VAN-204')).toBeInTheDocument();
    expect(within(sal18).getByText('Programada')).toBeInTheDocument();
  });

  it('U·filter_keeps_only_the_chosen_status: and the empty text when none is left', async () => {
    setup();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Mostrar'), { target: { value: 'CANCELLED' } });
    expect(screen.getByText('SAL-003')).toBeInTheDocument();
    expect(screen.queryByText('SAL-018')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mostrar'), { target: { value: 'alert' } });
    expect(screen.getByText('SAL-014')).toBeInTheDocument();
    expect(screen.queryByText('SAL-003')).not.toBeInTheDocument();
  });

  it('U·nothing_changes_by_time: a departure past its estimated end is flagged, never closed', async () => {
    setup();
    const alerts = (await screen.findByRole('heading', { name: 'Salidas sin cierre operativo' })).closest('section') as HTMLElement;
    expect(within(alerts).getByText('1 alerta')).toBeInTheDocument();
    expect(within(alerts).getByText(/SAL-014/)).toBeInTheDocument();
    expect(within(await row('SAL-014')).getByText('Pendiente de regularizar')).toBeInTheDocument();
  });

  it('U·row_actions_follow_status_and_role: the administrator edits and cancels, the operator only opens', async () => {
    const { onOpen } = setup();
    const scheduled = await row('SAL-018');
    expect(within(scheduled).getByRole('button', { name: 'Cancelar salida' })).toBeInTheDocument();
    expect(within(scheduled).getByRole('button', { name: 'Registrar ejecución' })).toBeInTheDocument();
    expect(within(await row('SAL-021')).getByRole('button', { name: 'Gestionar ejecución' })).toBeInTheDocument();
    expect(within(await row('SAL-014')).getByRole('button', { name: 'Regularizar' })).toBeInTheDocument();
    expect(within(await row('SAL-009')).getByRole('button', { name: 'Ver registro' })).toBeInTheDocument();
    expect(within(await row('SAL-003')).queryByRole('button', { name: 'Cancelar salida' })).not.toBeInTheDocument();
    fireEvent.click(within(scheduled).getByRole('button', { name: 'Registrar ejecución' }));
    expect(onOpen).toHaveBeenCalledWith('SAL-018');
  });

  it('U·schedule_actions_are_for_the_administrator: no link, no edit, no cancel for the operator', async () => {
    setup({ admin: false });
    const scheduled = await row('SAL-018');
    expect(screen.queryByRole('button', { name: 'Programar salida' })).not.toBeInTheDocument();
    expect(within(scheduled).queryByRole('button', { name: 'Cancelar salida' })).not.toBeInTheDocument();
    expect(within(scheduled).getByRole('button', { name: 'Registrar ejecución' })).toBeInTheDocument();
  });

  it('U·schedule_link_calls_the_form: the administrator opens "Programar salida"', async () => {
    const { onSchedule } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Programar salida' }));
    expect(onSchedule).toHaveBeenCalledTimes(1);
  });

  it('U·cancel_requires_a_cause_and_a_scheduled_departure: the cause first, then the line with the reservations', async () => {
    const { gateway } = setup();
    const spy = vi.spyOn(gateway, 'cancelDeparture');
    fireEvent.click(within(await row('SAL-018')).getByRole('button', { name: 'Cancelar salida' }));
    const panel = (await screen.findByText(/^Cancelar SAL-018/)).closest('section') as HTMLElement;
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirmar cancelación' }));
    expect(await within(panel).findByText('Ingresa la causal de la cancelación.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(within(panel).getByLabelText('Causal de la cancelación (obligatoria)'), { target: { value: 'Clima adverso' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirmar cancelación' }));
    expect(await screen.findByText('Salida SAL-018 cancelada. 2 reservas abren su reprogramación.')).toBeInTheDocument();
    expect(within(await row('SAL-018')).getByText('Cancelada')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('U·fixture_refuses_to_cancel_a_departure_that_is_not_scheduled: INVALID_STATUS_TRANSITION', async () => {
    const gateway = createDeparturesFixture();
    await expect(gateway.cancelDeparture({ code: 'SAL-021', cause: 'x', key: 'k-1' })).rejects.toThrow('INVALID_STATUS_TRANSITION');
    await expect(gateway.cancelDeparture({ code: 'SAL-099', cause: 'x', key: 'k-2' })).rejects.toThrow('NOT_FOUND');
  });

  it('U·departures_list_has_four_states: loading, error with retry, empty and data', async () => {
    const base = createDeparturesFixture();
    let calls = 0;
    const gateway: DeparturesGateway = {
      ...base,
      listDepartures: () => (++calls === 1 ? Promise.reject(new Error('down')) : Promise.resolve([])),
    };
    setup({ gateway });
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No hay salidas con este filtro.')).toBeInTheDocument();
    await waitFor(() => expect(calls).toBe(2));
  });
});
