import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Forbidden, Refused, Unavailable } from '../departures/model';
import { DepartureExecutionPage } from './DepartureExecutionPage';
import { createDepartureFixture } from './fixture';
import type { Departure, DepartureExecutionGateway } from './gateway';

afterEach(cleanup);

const open = (code: string, gateway: DepartureExecutionGateway = createDepartureFixture(), canSchedule = true) => {
  render(<DepartureExecutionPage gateway={gateway} code={code} canManage canSchedule={canSchedule} onBack={vi.fn()} />);
  return gateway;
};
const cancelButton = () => screen.queryByRole('button', { name: 'Cancelar salida' });
const panel = async () => (await screen.findByRole('heading', { name: 'Cancelar salida' })).closest('section') as HTMLElement;
const choose = async () => fireEvent.click(within(await panel()).getByRole('button', { name: 'Cancelar salida' }));
const confirm = (p: HTMLElement) => fireEvent.click(within(p).getByRole('button', { name: 'Confirmar cancelación' }));

// Spec 013 PT13-03 (AC-PT-13.1 to -13.3, -13.5, -13.6): the Administrator asks for the cancellation of a scheduled departure, with a
// confirmation that says it cannot be undone, and a cancelled departure shows its record and offers no action.
describe('the panel Cancelar salida', () => {
  it('U·a_collaborator_is_not_offered_cancelar_salida_and_the_administrator_only_on_a_scheduled_departure', async () => {
    open('SAL-018', createDepartureFixture(), false);
    await screen.findByRole('heading', { name: 'SAL-018' });
    expect(cancelButton()).not.toBeInTheDocument();
    cleanup();
    open('SAL-018');
    expect(await screen.findByRole('button', { name: 'Cancelar salida' })).toBeInTheDocument();
    cleanup();
    open('SAL-021');
    await screen.findByRole('heading', { name: 'SAL-021' });
    expect(cancelButton()).not.toBeInTheDocument();
    cleanup();
    open('SAL-003');
    await screen.findByRole('heading', { name: 'SAL-003' });
    expect(cancelButton()).not.toBeInTheDocument();
  });

  it('U·the_confirmation_names_the_departure_and_says_it_cannot_be_undone_and_nothing_is_sent_before_it', async () => {
    const gateway = createDepartureFixture();
    const spy = vi.fn(gateway.cancelDeparture!);
    gateway.cancelDeparture = spy;
    open('SAL-018', gateway);
    await choose();
    const p = await panel();
    expect(within(p).getByText(/SAL-018/)).toBeInTheDocument();
    expect(within(p).getByText(/Esta acción no se puede deshacer\./)).toBeInTheDocument();
    expect(within(p).getByText(/reprogramadas o reembolsadas al 100 %/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(within(p).getByRole('button', { name: 'Volver' }));
    expect(within(p).getByRole('button', { name: 'Cancelar salida' })).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('U·a_confirmed_cancellation_goes_to_the_saga_with_a_key_and_the_page_shows_the_departure_cancelled_with_its_record', async () => {
    const gateway = createDepartureFixture();
    const spy = vi.fn(gateway.cancelDeparture!);
    gateway.cancelDeparture = spy;
    open('SAL-018', gateway);
    await choose();
    confirm(await panel());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][0]).toMatchObject({ code: 'SAL-018' });
    expect(spy.mock.calls[0][0].key).toBeTruthy();
    const record = (await screen.findByRole('heading', { name: 'Cancelación' })).closest('section') as HTMLElement;
    expect(within(record).getByText(/no atribuible al cliente/i)).toBeInTheDocument();
    expect(cancelButton()).not.toBeInTheDocument();
    expect(screen.getAllByText('Cancelada').length).toBeGreaterThan(0);
  });

  it('U·a_request_that_has_not_finished_says_it_is_in_course_while_the_departure_is_still_scheduled', async () => {
    const gateway = createDepartureFixture();
    const still = (await gateway.getDeparture('SAL-018')) as Departure;
    gateway.cancelDeparture = async () => still;
    open('SAL-018', gateway);
    await choose();
    confirm(await panel());
    expect(await screen.findByText(/La cancelación está en curso/)).toBeInTheDocument();
  });

  it('U·a_retry_after_a_failure_keeps_the_key_a_refusal_is_told_and_the_button_is_disabled_while_pending', async () => {
    const gateway = createDepartureFixture();
    const keys: string[] = [];
    let release: () => void = () => {};
    const errors = [new Unavailable(), new Refused('INVALID_STATUS_TRANSITION'), new Forbidden()];
    gateway.cancelDeparture = async ({ key }) => {
      keys.push(key);
      await new Promise<void>((resolve) => (release = resolve));
      throw errors[keys.length - 1];
    };
    open('SAL-018', gateway);
    await choose();
    const p = await panel();
    confirm(p);
    await waitFor(() => expect(within(p).getByRole('button', { name: 'Confirmar cancelación' })).toBeDisabled());
    release();
    expect(await within(p).findByRole('alert')).toHaveTextContent('Tus datos siguen aquí.');
    fireEvent.click(within(p).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    release();
    expect(await within(p).findByRole('alert')).toHaveTextContent(/ya no está programada/);
    fireEvent.click(within(p).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(keys).toHaveLength(3));
    release();
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).toBe(keys[0]);
    expect(await within(p).findByRole('alert')).toHaveTextContent(/Solo el Administrador/);
  });
});

describe('the panel Cancelar salida, after the review', () => {
  it('U·while_the_request_is_in_course_the_action_is_not_offered_again_so_no_second_saga_starts', async () => {
    const gateway = createDepartureFixture();
    const still = (await gateway.getDeparture('SAL-018')) as Departure;
    gateway.cancelDeparture = async () => still;
    open('SAL-018', gateway);
    await choose();
    confirm(await panel());
    const p = await panel();
    expect(await within(p).findByText(/La cancelación está en curso/)).toBeInTheDocument();
    expect(within(p).queryByRole('button', { name: 'Cancelar salida' })).not.toBeInTheDocument();
  });

  it('U·the_focus_goes_back_to_the_action_when_the_person_leaves_the_confirmation', async () => {
    open('SAL-018');
    await choose();
    const p = await panel();
    fireEvent.click(within(p).getByRole('button', { name: 'Volver' }));
    await waitFor(() => expect(within(p).getByRole('button', { name: 'Cancelar salida' })).toHaveFocus());
  });

  it('U·a_service_that_did_not_answer_does_not_say_that_the_cancellation_was_not_asked', async () => {
    const gateway = createDepartureFixture();
    gateway.cancelDeparture = async () => {
      throw new Unavailable();
    };
    open('SAL-018', gateway);
    await choose();
    const p = await panel();
    confirm(p);
    const alert = await within(p).findByRole('alert');
    expect(alert).toHaveTextContent(/No pudimos confirmar/);
    expect(alert).not.toHaveTextContent(/no se pidió/);
  });
});

describe('the record of a cancelled departure', () => {
  it('U·a_cancelled_departure_shows_when_by_whom_and_why_and_offers_no_action', async () => {
    const gateway = createDepartureFixture();
    const cancelled = {
      ...((await gateway.getDeparture('SAL-003')) as Departure),
      cancellation: { at: '2026-12-01T10:30', by: 'acc-1', cause: 'NOT_CARRIED_OUT' as const, reason: 'Nadie llegó al punto de encuentro' },
    };
    gateway.getDeparture = async () => cancelled;
    open('SAL-003', gateway);
    const record = (await screen.findByRole('heading', { name: 'Cancelación' })).closest('section') as HTMLElement;
    expect(within(record).getByText('2026-12-01 10:30')).toBeInTheDocument();
    expect(within(record).getByText('acc-1')).toBeInTheDocument();
    expect(within(record).getByText('Nadie llegó al punto de encuentro')).toBeInTheDocument();
    expect(within(record).queryByRole('button')).not.toBeInTheDocument();
    expect(cancelButton()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar regularización' })).not.toBeInTheDocument();
  });

  it('U·a_cancellation_by_the_system_does_not_say_by_whom', async () => {
    const gateway = createDepartureFixture();
    const cancelled = {
      ...((await gateway.getDeparture('SAL-003')) as Departure),
      cancellation: { at: '2026-12-01T10:30', cause: 'NOT_ATTRIBUTABLE_TO_CUSTOMER' as const },
    };
    gateway.getDeparture = async () => cancelled;
    open('SAL-003', gateway);
    const record = (await screen.findByRole('heading', { name: 'Cancelación' })).closest('section') as HTMLElement;
    expect(within(record).queryByText(/Solicitada por/)).not.toBeInTheDocument();
    expect(within(record).getByText(/no atribuible al cliente/i)).toBeInTheDocument();
  });
});
