import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Refused, Unavailable } from '../departures/model';
import { DepartureExecutionPage } from './DepartureExecutionPage';
import { createDepartureFixture } from './fixture';
import type { DepartureExecutionGateway } from './gateway';

const setup = (code: string, gateway: DepartureExecutionGateway = createDepartureFixture(), canManage = true) => {
  render(<DepartureExecutionPage gateway={gateway} code={code} canManage={canManage} onBack={vi.fn()} />);
  return gateway;
};

const panelOf = async () => (await screen.findByRole('heading', { name: 'Lo reservado y lo efectivamente prestado' })).closest('section') as HTMLElement;
const ACTION = 'Emergencia personal';
const TRAVELERS = 'Viajeros que no pueden continuar';
const DETAIL = 'Qué ocurrió';
const open = async () => {
  const panel = await panelOf();
  fireEvent.click(within(panel).getAllByRole('button', { name: ACTION })[0]);
  return panel;
};
const fill = (panel: HTMLElement, travelers: string, detail: string) => {
  fireEvent.change(within(panel).getByLabelText(TRAVELERS), { target: { value: travelers } });
  fireEvent.change(within(panel).getByLabelText(DETAIL), { target: { value: detail } });
};
const next = (panel: HTMLElement) => fireEvent.click(within(panel).getByRole('button', { name: 'Continuar' }));
const confirm = (panel: HTMLElement) => fireEvent.click(within(panel).getByRole('button', { name: 'Confirmar emergencia' }));

// Spec 014 PT14-02 (AC-PT-14.1 to -14.6): the panel "Reservas de la salida" records the personal emergency of a reservation in execution.
describe('the personal emergency in the panel of the reservations', () => {
  it('U·the_action_is_offered_only_on_a_reservation_in_execution_of_a_departure_in_execution_and_with_the_permission', async () => {
    setup('SAL-021');
    expect(within(await panelOf()).getAllByRole('button', { name: ACTION })).toHaveLength(2);
  });

  it('U·no_action_when_the_departure_is_not_in_execution_or_without_the_permission', async () => {
    setup('SAL-018');
    expect(within(await panelOf()).queryByRole('button', { name: ACTION })).toBeNull();
  });

  it('U·the_action_is_not_offered_without_the_permission', async () => {
    setup('SAL-021', createDepartureFixture(), false);
    expect(within(await panelOf()).queryByRole('button', { name: ACTION })).toBeNull();
  });

  it('U·a_reservation_cancelled_extraordinarily_is_not_offered_the_action', async () => {
    const gateway = createDepartureFixture();
    await gateway.recordExtraordinaryCancellation({ code: 'SAL-021', reservationId: 'RES-1004', justification: 'Una emergencia', key: 'cancel-key-1' });
    setup('SAL-021', gateway);
    expect(within(await panelOf()).getAllByRole('button', { name: ACTION })).toHaveLength(1);
  });

  it('U·an_empty_or_long_detail_is_refused_beside_the_field_and_nothing_is_sent', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'registerNovelty');
    const panel = await open();
    fill(panel, '1', '  ');
    next(panel);
    const error = await within(panel).findByText('Escribe qué ocurrió (1 a 1000 caracteres).');
    expect(within(panel).getByLabelText(DETAIL)).toHaveAttribute('aria-describedby', error.id);
    fill(panel, '1', 'd'.repeat(1001));
    next(panel);
    expect(await within(panel).findByText('Escribe qué ocurrió (1 a 1000 caracteres).')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('U·travelers_out_of_range_are_refused_beside_the_field_and_nothing_is_sent', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'registerNovelty');
    const panel = await open();
    for (const value of ['', '0', '5', '1.5']) {
      fill(panel, value, 'Se desmayó');
      next(panel);
      const error = await within(panel).findByText('Indica cuántos viajeros no pueden continuar (de 1 a 4).');
      expect(within(panel).getByLabelText(TRAVELERS)).toHaveAttribute('aria-describedby', error.id);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('U·the_confirmation_names_the_customer_and_the_travelers_and_says_it_cannot_be_undone_before_anything_is_sent', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'registerNovelty');
    const panel = await open();
    fill(panel, '2', 'Se lastimó una pierna');
    next(panel);
    const group = within(panel).getByRole('group');
    expect(within(group).getByText(/Cliente de prueba/)).toBeInTheDocument();
    expect(within(group).getByText(/2 viajeros/)).toBeInTheDocument();
    expect(within(group).getByText(/La reserva no se cancela/)).toBeInTheDocument();
    expect(within(group).getByText(/Esta acción no se puede deshacer\./)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(within(group).getByRole('button', { name: 'Volver' }));
    expect(within(panel).getByLabelText(DETAIL)).toHaveValue('Se lastimó una pierna');
  });

  it('U·a_recorded_emergency_shows_when_who_travelers_and_detail_and_the_reservation_stays_in_execution', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'registerNovelty');
    const panel = await open();
    fill(panel, '2', 'Se lastimó una pierna');
    next(panel);
    confirm(panel);
    const record = await within(panel).findByRole('group', { name: 'Emergencia personal de Cliente de prueba' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ code: 'SAL-021', reservationId: 'RES-1002', affected: 2, detail: 'Se lastimó una pierna', emergency: true });
    expect(within(record).getByText(/Se lastimó una pierna/)).toBeInTheDocument();
    expect(within(record).getByText(/2 viajeros/)).toBeInTheDocument();
    expect(within(record).getByText(/La reserva sigue en ejecución/)).toBeInTheDocument();
    expect(within(panel).getAllByRole('button', { name: ACTION })).toHaveLength(1);
    expect(within(panel).getAllByText('En ejecución').length).toBeGreaterThan(0);
  });

  it('U·a_retry_keeps_the_key_changed_data_gets_a_new_one_and_a_refusal_keeps_the_data', async () => {
    const gateway = createDepartureFixture();
    const keys: string[] = [];
    const errors = [new Unavailable(), new Refused('BUSINESS_RULE_VIOLATION'), new Unavailable()];
    gateway.registerNovelty = async ({ key }) => {
      keys.push(key);
      throw errors[keys.length - 1];
    };
    setup('SAL-021', gateway);
    const panel = await open();
    fill(panel, '2', 'Se lastimó una pierna');
    next(panel);
    confirm(panel);
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Tus datos siguen aquí.');
    fireEvent.click(within(panel).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);
    expect(await within(panel).findByRole('alert')).toHaveTextContent(/no aceptó/);
    fireEvent.click(within(panel).getByRole('button', { name: 'Volver' }));
    expect(within(panel).getByLabelText(DETAIL)).toHaveValue('Se lastimó una pierna');
    fill(panel, '3', 'Se lastimó una pierna');
    next(panel);
    confirm(panel);
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('U·the_confirm_button_is_disabled_while_the_send_is_pending', async () => {
    const gateway = createDepartureFixture();
    let release: () => void = () => {};
    const original = gateway.registerNovelty;
    gateway.registerNovelty = async (input) => {
      await new Promise<void>((resolve) => (release = resolve));
      return original(input);
    };
    setup('SAL-021', gateway);
    const panel = await open();
    fill(panel, '1', 'Se desmayó');
    next(panel);
    confirm(panel);
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Confirmar emergencia' })).toBeDisabled());
    release();
    await within(panel).findByRole('group', { name: 'Emergencia personal de Cliente de prueba' });
  });
});
