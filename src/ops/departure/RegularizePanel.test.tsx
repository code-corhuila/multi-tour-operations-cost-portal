import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DepartureExecutionPage } from './DepartureExecutionPage';
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
    fireEvent.change(within(p).getByLabelText('Motivo si la hora real de inicio es anterior a la programada'), { target: { value: 'Salimos antes por lluvia' } });
    send(p);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Registrar lo ocurrido' })).not.toBeInTheDocument());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(within((await screen.findByRole('heading', { name: 'SAL-014' })).closest('section') as HTMLElement).getByText('Finalizada')).toBeInTheDocument();
  });
});
