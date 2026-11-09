import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../contract';
import { DepartureExecutionPage } from './departure/DepartureExecutionPage';
import { createExecutionGateway } from './departure/execution';
import type { Departure, DepartureExecutionGateway, RegularizationInput } from './departure/gateway';
import { createDepartureFixture } from './departure/fixture';
import { Refused } from './departures/model';

// Spec 009 PT9-02 (AC-PT-09.3 to -09.5, -09.7, -09.8, -09.10): the regularization of a departure over the service.

type Call = { path: string; init?: { method?: string; body?: Record<string, unknown>; headers?: Record<string, string> } };

const answer = (extra: Record<string, unknown> = {}) => ({
  code: 'SAL-031',
  serviceId: 'tour-1',
  status: 'FINISHED',
  scheduledStart: '2026-12-01T13:00:00Z',
  scheduledEnd: '2026-12-01T21:00:00Z',
  capacity: 12,
  booked: 0,
  pendingRegularization: false,
  startAlert: false,
  actualStart: '2026-12-01T13:00:00Z',
  actualEnd: '2026-12-01T20:00:00Z',
  interrupted: false,
  vehicles: [],
  ...extra,
});

function fakeClient(body: unknown): { client: ApiClient; calls: Call[] } {
  const calls: Call[] = [];
  const client: ApiClient = {
    request: async <T,>(path: string, init?: Call['init']) => {
      calls.push({ path, init });
      return body as T;
    },
  };
  return { client, calls };
}

const input = (extra: Partial<RegularizationInput> = {}): RegularizationInput => ({
  code: 'SAL-031',
  result: 'EXECUTED',
  startedAt: '2026-12-01T08:00',
  finishedAt: '2026-12-01T15:00',
  earlyStartMotive: '',
  interruption: '',
  notDoneCause: '',
  key: 'regularize-key-0001',
  ...extra,
});

describe('the connected gateway regularizes through the service', () => {
  it('C·an_executed_departure_is_sent_with_the_real_hours_as_instants_and_the_key', async () => {
    const { client, calls } = fakeClient(answer());
    const done = await createExecutionGateway(client).registerRegularization(input());
    expect(calls).toEqual([
      {
        path: '/api/v1/operations-cost/departures/SAL-031/regularization',
        init: {
          method: 'POST',
          headers: { 'Idempotency-Key': 'regularize-key-0001' },
          body: { result: 'EXECUTED', actualStart: '2026-12-01T13:00:00Z', actualEnd: '2026-12-01T20:00:00Z' },
        },
      },
    ]);
    expect(done).toMatchObject({ code: 'SAL-031', status: 'FINISHED', pendingRegularization: false });
  });

  it('C·an_interruption_and_an_early_start_carry_their_texts_and_nothing_else_does', async () => {
    const { client, calls } = fakeClient(answer({ interrupted: true, interruptionCause: 'Heavy rain' }));
    await createExecutionGateway(client).registerRegularization(
      input({ result: 'INTERRUPTED', startedAt: '2026-12-01T07:30', interruption: ' Heavy rain ', earlyStartMotive: ' Left early ', notDoneCause: 'ignored' }),
    );
    expect(calls[0].init?.body).toEqual({
      result: 'INTERRUPTED',
      actualStart: '2026-12-01T12:30:00Z',
      actualEnd: '2026-12-01T20:00:00Z',
      interruption: 'Heavy rain',
      earlyStartReason: 'Left early',
    });
  });

  it('C·not_done_is_never_sent_because_the_service_does_not_cancel_yet', async () => {
    const { client, calls } = fakeClient(answer());
    await expect(createExecutionGateway(client).registerRegularization(input({ result: 'NOT_DONE', notDoneCause: 'Rain' }))).rejects.toThrow('NOT_AVAILABLE');
    expect(calls).toHaveLength(0);
  });

  it('C·the_regularization_panel_is_served', () => {
    expect(createExecutionGateway(fakeClient(answer()).client).panels).toContain('regularize');
  });
});

// A gateway that talks to the service (connected), over a marked departure that never started.
const marked = (): Departure => ({
  code: 'SAL-014',
  status: 'SCHEDULED',
  pendingRegularization: true,
  startAlert: false,
  vehicles: [],
  capacity: 12,
  booked: 0,
  scheduledStart: '2026-10-10T08:00',
  scheduledEnd: '2026-10-10T14:00',
  mark: 'Pendiente de regularización',
  reservations: [],
  novelties: [],
  history: [],
});

const connected = (register: DepartureExecutionGateway['registerRegularization']): DepartureExecutionGateway => ({
  ...createDepartureFixture(),
  connected: true,
  getDeparture: async () => marked(),
  registerRegularization: register,
});

const open = (gateway: DepartureExecutionGateway) => render(<DepartureExecutionPage gateway={gateway} code="SAL-014" canManage onBack={vi.fn()} />);
const panel = async () => (await screen.findByRole('heading', { name: 'Registrar lo ocurrido' })).closest('section') as HTMLElement;
const choose = (p: HTMLElement, value: string) => fireEvent.change(within(p).getByLabelText('Resultado'), { target: { value } });
const type = (p: HTMLElement, label: string, value: string) => fireEvent.change(within(p).getByLabelText(label), { target: { value } });
const send = (p: HTMLElement) => fireEvent.click(within(p).getByRole('button', { name: 'Registrar regularización' }));

describe('the panel over the service', () => {
  it('U·not_done_is_not_offered_when_the_service_cannot_cancel', async () => {
    open(connected(async () => marked()));
    const p = await panel();
    expect(within(p).queryByRole('option', { name: /No realizada/ })).not.toBeInTheDocument();
    expect(within(p).getByRole('option', { name: /Ejecutada y finalizada/ })).toBeInTheDocument();
    expect(within(p).getByRole('option', { name: /Interrumpida/ })).toBeInTheDocument();
  });

  it('U·the_motive_is_asked_only_when_the_typed_start_is_earlier_than_the_scheduled_one', async () => {
    const register = vi.fn(async () => marked());
    open(connected(register));
    const p = await panel();
    choose(p, 'EXECUTED');
    expect(within(p).queryByLabelText(/Motivo si la hora real/)).not.toBeInTheDocument();
    type(p, 'Hora de inicio real', '2026-10-10T07:30');
    expect(within(p).getByLabelText(/Motivo si la hora real/)).toBeInTheDocument();
    type(p, 'Hora de inicio real', '2026-10-10T08:15');
    expect(within(p).queryByLabelText(/Motivo si la hora real/)).not.toBeInTheDocument();
  });

  it('U·hours_in_the_future_or_out_of_order_are_refused_beside_the_field_and_nothing_is_sent', async () => {
    const register = vi.fn(async () => marked());
    open(connected(register));
    const p = await panel();
    choose(p, 'EXECUTED');
    type(p, 'Hora de inicio real', '2999-01-01T08:00');
    type(p, 'Hora de finalización real', '2026-10-10T09:00');
    send(p);
    expect(await within(p).findByText('El inicio real no puede ser posterior a este momento.')).toBeInTheDocument();
    type(p, 'Hora de inicio real', '2026-10-10T10:00');
    send(p);
    expect(await within(p).findByText('La finalización real no puede ser anterior al inicio.')).toBeInTheDocument();
    type(p, 'Hora de finalización real', '2999-01-01T09:00');
    send(p);
    expect(await within(p).findByText('La finalización real no puede ser posterior a este momento.')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('U·a_retry_of_the_same_data_reuses_the_key_and_a_refusal_of_the_service_is_told', async () => {
    const keys: string[] = [];
    let attempt = 0;
    const register = vi.fn(async (sent: RegularizationInput) => {
      keys.push(sent.key);
      if (++attempt === 1) throw new Refused('BUSINESS_RULE_VIOLATION');
      return { ...marked(), status: 'FINISHED' as const, pendingRegularization: false };
    });
    open(connected(register));
    const p = await panel();
    choose(p, 'EXECUTED');
    type(p, 'Hora de inicio real', '2026-10-10T08:15');
    type(p, 'Hora de finalización real', '2026-10-10T13:00');
    send(p);
    expect(await within(p).findByText(/El servicio no aceptó la regularización/)).toBeInTheDocument();
    expect(within(p).getByRole('button', { name: 'Registrar regularización' })).toBeEnabled();
    fireEvent.click(within(p).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(register).toHaveBeenCalledTimes(2));
    expect(keys[1]).toBe(keys[0]);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Registrar lo ocurrido' })).not.toBeInTheDocument());
    expect(within((await screen.findByRole('heading', { name: 'SAL-014' })).closest('section') as HTMLElement).getByText('Finalizada')).toBeInTheDocument();
  });

  it('U·the_button_is_disabled_while_a_send_is_pending', async () => {
    let release: () => void = () => undefined;
    const register = vi.fn(() => new Promise<Departure>((resolve) => (release = () => resolve({ ...marked(), status: 'FINISHED', pendingRegularization: false }))));
    open(connected(register));
    const p = await panel();
    choose(p, 'EXECUTED');
    type(p, 'Hora de inicio real', '2026-10-10T08:15');
    type(p, 'Hora de finalización real', '2026-10-10T13:00');
    send(p);
    await waitFor(() => expect(within(p).getByRole('button', { name: 'Registrar regularización' })).toBeDisabled());
    release();
    expect(await screen.findByText('Finalizada')).toBeInTheDocument();
  });
});
