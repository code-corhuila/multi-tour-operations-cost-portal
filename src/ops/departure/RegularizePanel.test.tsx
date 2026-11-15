import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DepartureExecutionPage } from './DepartureExecutionPage';
import { FieldError, Refused } from '../departures/model';
import { createDepartureFixture } from './fixture';

const setup = () => {
  const gateway = createDepartureFixture();
  render(<DepartureExecutionPage gateway={gateway} code="SAL-014" canManage onBack={vi.fn()} />);
  return gateway;
};

const panel = async () => (await screen.findByRole('heading', { name: 'Registrar lo ocurrido' })).closest('section') as HTMLElement;
const choose = (p: HTMLElement, value: string) => fireEvent.change(within(p).getByLabelText('Resultado'), { target: { value } });
const send = (p: HTMLElement) => fireEvent.click(within(p).getByRole('button', { name: 'Registrar regularización' }));

// Spec 004 PT-09 (RN-OPS-PT-38): a departure past its estimated end without a close is regularized with the fields of
// its result, and an actual start earlier than the scheduled one needs its motive.
describe('regularization of a departure (RN-OPS-PT-38)', () => {
  it('U·regularize_fields_follow_the_result: each result asks for its own fields', async () => {
    setup();
    const p = await panel();
    choose(p, 'NOT_DONE');
    expect(within(p).getByLabelText('Causal de la no realización')).toBeInTheDocument();
    expect(within(p).queryByLabelText('Hora de finalización real')).not.toBeInTheDocument();
    choose(p, 'EXECUTED');
    expect(within(p).getByLabelText('Hora de inicio real')).toBeInTheDocument();
    expect(within(p).getByLabelText('Hora de finalización real')).toBeInTheDocument();
    expect(within(p).queryByLabelText('Interrupción (causa y evidencia)')).not.toBeInTheDocument();
    choose(p, 'INTERRUPTED');
    expect(within(p).getByLabelText('Interrupción (causa y evidencia)')).toBeInTheDocument();
  });

  it('U·not_done_requires_the_causal_and_cancels_the_departure: nothing is sent without it', async () => {
    const gateway = setup();
    const spy = vi.spyOn(gateway, 'registerRegularization');
    const p = await panel();
    choose(p, 'NOT_DONE');
    send(p);
    expect(await within(p).findByText('Ingresa la causal de la no realización.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(within(p).getByLabelText('Causal de la no realización'), { target: { value: 'Clima adverso' } });
    send(p);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Registrar lo ocurrido' })).not.toBeInTheDocument());
    expect(within((await screen.findByRole('heading', { name: 'SAL-014' })).closest('section') as HTMLElement).getByText('Cancelada')).toBeInTheDocument();
  });

  it('U·early_start_needs_its_motive_and_end_is_required: the motive is asked only when the start is earlier', async () => {
    const gateway = setup();
    const spy = vi.spyOn(gateway, 'registerRegularization');
    const p = await panel();
    choose(p, 'EXECUTED');
    fireEvent.change(within(p).getByLabelText('Hora de inicio real'), { target: { value: '2026-10-10T07:30' } });
    send(p);
    expect(await within(p).findByText('Ingresa la hora de finalización real.')).toBeInTheDocument();
    fireEvent.change(within(p).getByLabelText('Hora de finalización real'), { target: { value: '2026-10-10T13:00' } });
    send(p);
    expect(await within(p).findByText('Ingresa el motivo: el inicio real es anterior al programado.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(within(p).getByLabelText('Motivo si la hora real de inicio es anterior a la programada'), {
      target: { value: 'Salimos antes por lluvia' },
    });
    send(p);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Registrar lo ocurrido' })).not.toBeInTheDocument());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(within((await screen.findByRole('heading', { name: 'SAL-014' })).closest('section') as HTMLElement).getByText('Finalizada')).toBeInTheDocument();
  });

  it('U·not_done_is_offered_over_the_service_too_and_its_cause_of_1_to_500_characters_is_checked_beside_the_field', async () => {
    const gateway = { ...createDepartureFixture(), connected: true };
    const spy = vi.spyOn(gateway, 'registerRegularization');
    render(<DepartureExecutionPage gateway={gateway} code="SAL-014" canManage onBack={vi.fn()} />);
    const p = await panel();
    expect(within(p).getByRole('option', { name: /No realizada/ })).toBeInTheDocument();
    choose(p, 'NOT_DONE');
    fireEvent.change(within(p).getByLabelText('Causal de la no realización'), { target: { value: 'c'.repeat(501) } });
    send(p);
    expect(await within(p).findByText('La causal no puede superar 500 caracteres.')).toBeInTheDocument();
    expect(within(p).getByLabelText('Causal de la no realización')).toHaveAttribute('aria-invalid', 'true');
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(within(p).getByLabelText('Causal de la no realización'), { target: { value: 'c'.repeat(500) } });
    send(p);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][0]).toMatchObject({ result: 'NOT_DONE', notDoneCause: 'c'.repeat(500) });
  });

  const connectedWith = (reject: (call: number) => unknown) => {
    const gateway = { ...createDepartureFixture(), connected: true };
    const keys: string[] = [];
    gateway.registerRegularization = async (input) => {
      keys.push(input.key);
      throw reject(keys.length);
    };
    render(<DepartureExecutionPage gateway={gateway} code="SAL-014" canManage onBack={vi.fn()} />);
    return keys;
  };

  it('U·a_whitespace_only_cause_is_refused_beside_the_field_and_the_trimmed_text_is_what_is_sent', async () => {
    const gateway = { ...createDepartureFixture(), connected: true };
    const spy = vi.spyOn(gateway, 'registerRegularization');
    render(<DepartureExecutionPage gateway={gateway} code="SAL-014" canManage onBack={vi.fn()} />);
    const p = await panel();
    choose(p, 'NOT_DONE');
    fireEvent.change(within(p).getByLabelText('Causal de la no realización'), { target: { value: '   ' } });
    send(p);
    expect(await within(p).findByText('Ingresa la causal de la no realización.')).toBeInTheDocument();
    expect(within(p).getByLabelText('Causal de la no realización')).toHaveAttribute('aria-describedby', 'reg-notdone-error');
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(within(p).getByLabelText('Causal de la no realización'), { target: { value: '  Clima adverso  ' } });
    send(p);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][0]).toMatchObject({ notDoneCause: 'Clima adverso' });
  });

  it('U·a_400_of_the_service_on_the_cause_is_shown_beside_the_field', async () => {
    connectedWith(() => new FieldError([{ field: 'notCarriedOutCause', message: 'too long' }]));
    const p = await panel();
    choose(p, 'NOT_DONE');
    fireEvent.change(within(p).getByLabelText('Causal de la no realización'), { target: { value: 'Clima' } });
    send(p);
    expect(await within(p).findByText('El servicio no aceptó la causal: debe tener de 1 a 500 caracteres.')).toBeInTheDocument();
    expect(within(p).getByLabelText('Causal de la no realización')).toHaveAttribute('aria-invalid', 'true');
    expect(within(p).getByLabelText('Causal de la no realización')).toHaveValue('Clima');
  });

  it('U·a_422_on_not_done_does_not_talk_about_hours', async () => {
    connectedWith(() => new Refused('BUSINESS_RULE_VIOLATION'));
    const p = await panel();
    choose(p, 'NOT_DONE');
    fireEvent.change(within(p).getByLabelText('Causal de la no realización'), { target: { value: 'Clima' } });
    send(p);
    const alert = await within(p).findByRole('alert');
    expect(alert).not.toHaveTextContent('hora');
    expect(alert).toHaveTextContent('Tus datos siguen aquí.');
  });

  it('U·a_retry_of_the_same_not_done_keeps_the_key_even_if_a_field_that_is_not_sent_changed', async () => {
    const keys = connectedWith(() => new Error('network'));
    const p = await panel();
    choose(p, 'NOT_DONE');
    fireEvent.change(within(p).getByLabelText('Causal de la no realización'), { target: { value: 'Clima' } });
    send(p);
    await waitFor(() => expect(keys).toHaveLength(1));
    choose(p, 'EXECUTED');
    fireEvent.change(within(p).getByLabelText('Hora de inicio real'), { target: { value: '2026-10-10T09:00' } });
    choose(p, 'NOT_DONE');
    send(p);
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);
    fireEvent.change(within(p).getByLabelText('Causal de la no realización'), { target: { value: 'Otra causal' } });
    send(p);
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[2]).not.toBe(keys[0]);
  });
});
