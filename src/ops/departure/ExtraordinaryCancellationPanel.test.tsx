import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Refused } from '../departures/model';
import { DepartureExecutionPage } from './DepartureExecutionPage';
import { createDepartureFixture } from './fixture';
import type { DepartureExecutionGateway } from './gateway';

const setup = (code: string, gateway: DepartureExecutionGateway = createDepartureFixture(), canManage = true) => {
  render(<DepartureExecutionPage gateway={gateway} code={code} canManage={canManage} onBack={vi.fn()} />);
  return gateway;
};

const panelOf = async () => (await screen.findByRole('heading', { name: 'Lo reservado y lo efectivamente prestado' })).closest('section') as HTMLElement;
const ACTION = 'Cancelación extraordinaria';
const JUSTIFICATION = 'Justificación de la cancelación extraordinaria';

// Spec 012 PT12-02 (AC-PT-12.1 to -12.6): the panel "Reservas de la salida" cancels a reservation in execution for an emergency.
describe('the extraordinary cancellation in the panel of the reservations', () => {
  it('U·the_action_is_offered_only_on_a_reservation_in_execution_of_a_departure_in_execution', async () => {
    setup('SAL-021');
    const panel = await panelOf();
    expect(within(panel).getAllByRole('button', { name: ACTION })).toHaveLength(2);
  });

  it('U·no_action_when_the_departure_is_not_in_execution', async () => {
    setup('SAL-018');
    const panel = await panelOf();
    expect(within(panel).queryByRole('button', { name: ACTION })).toBeNull();
  });

  it('U·the_action_is_not_offered_without_the_permission', async () => {
    setup('SAL-021', createDepartureFixture(), false);
    const panel = await panelOf();
    expect(within(panel).queryByRole('button', { name: ACTION })).toBeNull();
  });

  it('U·an_empty_justification_is_refused_beside_the_field_and_nothing_is_sent', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'recordExtraordinaryCancellation');
    const panel = await panelOf();
    fireEvent.click(within(panel).getAllByRole('button', { name: ACTION })[0]);
    fireEvent.click(within(panel).getByRole('button', { name: 'Continuar' }));
    const field = within(panel).getByLabelText(JUSTIFICATION);
    const error = await within(panel).findByText('Escribe la justificación de la emergencia (1 a 500 caracteres).');
    expect(field).toHaveAttribute('aria-describedby', error.id);
    expect(spy).not.toHaveBeenCalled();
  });

  it('U·a_justification_over_500_characters_is_refused', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'recordExtraordinaryCancellation');
    const panel = await panelOf();
    fireEvent.click(within(panel).getAllByRole('button', { name: ACTION })[0]);
    fireEvent.change(within(panel).getByLabelText(JUSTIFICATION), { target: { value: 'j'.repeat(501) } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Continuar' }));
    expect(await within(panel).findByText('Escribe la justificación de la emergencia (1 a 500 caracteres).')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('U·the_confirmation_names_the_customer_and_says_it_cannot_be_undone_before_anything_is_sent', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'recordExtraordinaryCancellation');
    const panel = await panelOf();
    fireEvent.click(within(panel).getAllByRole('button', { name: ACTION })[0]);
    fireEvent.change(within(panel).getByLabelText(JUSTIFICATION), { target: { value: 'Emergencia médica del viajero' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Continuar' }));
    expect(await within(panel).findByText(/Vas a cancelar la reserva de Cliente de prueba\./)).toBeInTheDocument();
    expect(within(panel).getByText(/Esta acción no se puede deshacer\./)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(within(panel).getByRole('button', { name: 'Volver' }));
    expect(within(panel).getByLabelText(JUSTIFICATION)).toHaveValue('Emergencia médica del viajero');
    expect(spy).not.toHaveBeenCalled();
  });

  it('U·a_confirmed_cancellation_shows_its_record_and_the_pending_decision_and_leaves_the_other_reservation', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'recordExtraordinaryCancellation');
    const panel = await panelOf();
    fireEvent.click(within(panel).getAllByRole('button', { name: ACTION })[0]);
    fireEvent.change(within(panel).getByLabelText(JUSTIFICATION), { target: { value: 'Emergencia médica del viajero' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Continuar' }));
    fireEvent.click(await within(panel).findByRole('button', { name: 'Confirmar cancelación' }));
    expect(await within(panel).findByText(/Cancelación extraordinaria: Emergencia médica del viajero/)).toBeInTheDocument();
    expect(within(panel).getByText('La decisión de reprogramar o reembolsar queda pendiente.')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ code: 'SAL-021', reservationId: 'RES-1002', justification: 'Emergencia médica del viajero' }));
    expect(within(panel).getAllByRole('button', { name: ACTION })).toHaveLength(1);
  });

  it('U·a_retry_keeps_the_key_and_a_changed_text_gets_a_new_one', async () => {
    const gateway = setup('SAL-021');
    const original = gateway.recordExtraordinaryCancellation.bind(gateway);
    const keys: string[] = [];
    let fail = true;
    vi.spyOn(gateway, 'recordExtraordinaryCancellation').mockImplementation(async (input) => {
      keys.push(input.key);
      if (fail) {
        fail = false;
        throw new Error('network');
      }
      return original(input);
    });
    const panel = await panelOf();
    fireEvent.click(within(panel).getAllByRole('button', { name: ACTION })[0]);
    fireEvent.change(within(panel).getByLabelText(JUSTIFICATION), { target: { value: 'Emergencia médica' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Continuar' }));
    fireEvent.click(await within(panel).findByRole('button', { name: 'Confirmar cancelación' }));
    expect(await within(panel).findByText(/No pudimos registrar la cancelación extraordinaria\. Tus datos siguen aquí\./)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Reintentar' }));
    await within(panel).findByText(/Cancelación extraordinaria: Emergencia médica/);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('U·a_changed_text_after_a_failure_is_sent_with_a_new_key', async () => {
    const gateway = setup('SAL-021');
    const keys: string[] = [];
    vi.spyOn(gateway, 'recordExtraordinaryCancellation').mockImplementation(async (input) => {
      keys.push(input.key);
      throw new Error('network');
    });
    const panel = await panelOf();
    fireEvent.click(within(panel).getAllByRole('button', { name: ACTION })[0]);
    fireEvent.change(within(panel).getByLabelText(JUSTIFICATION), { target: { value: 'Primer texto' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Continuar' }));
    fireEvent.click(await within(panel).findByRole('button', { name: 'Confirmar cancelación' }));
    await within(panel).findByText(/No pudimos registrar/);
    fireEvent.click(within(panel).getByRole('button', { name: 'Volver' }));
    fireEvent.change(within(panel).getByLabelText(JUSTIFICATION), { target: { value: 'Segundo texto' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Continuar' }));
    fireEvent.click(await within(panel).findByRole('button', { name: 'Confirmar cancelación' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('U·a_refusal_of_the_service_is_shown_beside_the_form_and_keeps_the_text', async () => {
    const gateway = setup('SAL-021');
    vi.spyOn(gateway, 'recordExtraordinaryCancellation').mockRejectedValue(new Refused('BUSINESS_RULE_VIOLATION'));
    const panel = await panelOf();
    fireEvent.click(within(panel).getAllByRole('button', { name: ACTION })[0]);
    fireEvent.change(within(panel).getByLabelText(JUSTIFICATION), { target: { value: 'Emergencia médica' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Continuar' }));
    fireEvent.click(await within(panel).findByRole('button', { name: 'Confirmar cancelación' }));
    expect(await within(panel).findByText(/la reserva ya no está en ejecución o ya fue cancelada/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Volver' }));
    expect(within(panel).getByLabelText(JUSTIFICATION)).toHaveValue('Emergencia médica');
  });

  it('U·the_confirm_button_is_disabled_while_the_send_is_pending', async () => {
    const gateway = setup('SAL-021');
    let release: () => void = () => undefined;
    vi.spyOn(gateway, 'recordExtraordinaryCancellation').mockImplementation(
      () => new Promise((resolve) => (release = () => resolve(gateway.getDeparture('SAL-021').then((d) => d!)))),
    );
    const panel = await panelOf();
    fireEvent.click(within(panel).getAllByRole('button', { name: ACTION })[0]);
    fireEvent.change(within(panel).getByLabelText(JUSTIFICATION), { target: { value: 'Emergencia médica' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Continuar' }));
    fireEvent.click(await within(panel).findByRole('button', { name: 'Confirmar cancelación' }));
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Confirmar cancelación' })).toBeDisabled());
    release();
  });
});
