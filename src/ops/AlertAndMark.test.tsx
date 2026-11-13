import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../contract';
import { DepartureExecutionPage } from './departure/DepartureExecutionPage';
import { createDepartureFixture } from './departure/fixture';
import { createExecutionGateway } from './departure/execution';
import type { Departure, DepartureExecutionGateway } from './departure/gateway';
import { DeparturesPage } from './departures/DeparturesPage';
import { createDeparturesFixture } from './departures/fixture';
import type { DeparturesGateway } from './departures/model';
import { createDeparturesGateway } from './departures/scheduling';

// Spec 009 PT9-01 (AC-PT-09.1, -09.2, -09.6, -09.10): the start alert and the mark of pending regularization come from the service
// as data; the mark is not a state and the alert is not computed with the clock of the browser.

const answer = (extra: Record<string, unknown> = {}) => ({
  code: 'SAL-031',
  serviceId: 'tour-1',
  status: 'SCHEDULED',
  scheduledStart: '2026-12-01T13:00:00Z',
  scheduledEnd: '2026-12-01T21:00:00Z',
  capacity: 12,
  booked: 0,
  pendingRegularization: false,
  startAlert: false,
  interrupted: false,
  vehicles: [],
  ...extra,
});

const client = (body: unknown): ApiClient => ({ request: async <T,>() => body as T });

describe('the adapters read the alert and the mark', () => {
  it('C·the_page_of_a_departure_reads_the_alert_and_the_mark_and_keeps_the_state', async () => {
    const read = await createExecutionGateway(client(answer({ pendingRegularization: true, startAlert: true }))).getDeparture('SAL-031');
    expect(read).toMatchObject({ status: 'SCHEDULED', pendingRegularization: true, startAlert: true, mark: 'Pendiente de regularización' });
    const quiet = await createExecutionGateway(client(answer())).getDeparture('SAL-031');
    expect(quiet).toMatchObject({ status: 'SCHEDULED', pendingRegularization: false, startAlert: false, mark: '' });
  });

  it('C·the_list_reads_the_alert_and_the_mark_of_each_row', async () => {
    const page = { data: [answer({ startAlert: true }), answer({ code: 'SAL-032', pendingRegularization: true })], meta: { page: 1, limit: 100, total: 2, totalPages: 1 } };
    const rows = await createDeparturesGateway(client(page), createDeparturesFixture()).listDepartures();
    expect(rows.map((r) => [r.code, r.startAlert, r.pendingRegularization])).toEqual([
      ['SAL-031', true, false],
      ['SAL-032', false, true],
    ]);
  });
});

const listWith = (rows: Partial<Awaited<ReturnType<DeparturesGateway['listDepartures']>>[number]>[]): DeparturesGateway => {
  const base = createDeparturesFixture();
  return {
    ...base,
    listDepartures: async () => rows.map((r, i) => ({ code: `SAL-0${i + 1}`, tourId: 'T-1', start: '2026-10-10T08:00', end: '2026-10-10T14:00', vehicleIds: [], booked: 0, reservations: 0, status: 'SCHEDULED' as const, ...r })),
  };
};

describe('the list flags what needs attention by its data', () => {
  it('U·a_departure_with_the_start_alert_or_the_mark_is_flagged_and_keeps_its_state', async () => {
    const gateway = listWith([{ startAlert: true }, { pendingRegularization: true }, {}]);
    render(<DeparturesPage gateway={gateway} canSchedule canManage onOpen={vi.fn()} onSchedule={vi.fn()} />);
    const alerts = (await screen.findByRole('heading', { name: 'Salidas sin cierre operativo' })).closest('section') as HTMLElement;
    expect(within(alerts).getByText('2 alertas')).toBeInTheDocument();
    const flagged = (await screen.findByText('SAL-01')).closest('tr') as HTMLElement;
    expect(within(flagged).getByText('Programada')).toBeInTheDocument();
    expect(within(flagged).getByText('Sin inicio registrado')).toBeInTheDocument();
    const marked = (await screen.findByText('SAL-02')).closest('tr') as HTMLElement;
    expect(within(marked).getByText('Programada')).toBeInTheDocument();
    expect(within(marked).getByText('Pendiente de regularizar')).toBeInTheDocument();
    const quiet = (await screen.findByText('SAL-03')).closest('tr') as HTMLElement;
    expect(within(quiet).queryByText('Sin inicio registrado')).not.toBeInTheDocument();
    expect(within(quiet).queryByText('Pendiente de regularizar')).not.toBeInTheDocument();
  });
});

const pageWith = (extra: Partial<Departure>): DepartureExecutionGateway => {
  const base = createDepartureFixture();
  return { ...base, getDeparture: async (code) => ({ ...(await base.getDeparture(code))!, ...extra }) };
};

const open = (gateway: DepartureExecutionGateway, code = 'SAL-018') =>
  render(<DepartureExecutionPage gateway={gateway} code={code} canManage onBack={vi.fn()} />);

describe('the page of a departure shows the alert and the mark', () => {
  it('U·the_start_alert_says_the_start_passed_and_the_start_is_still_offered', async () => {
    open(pageWith({ startAlert: true }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('La hora programada de inicio ya pasó y nadie registró el inicio');
    expect(screen.getByRole('button', { name: 'Registrar inicio real' })).toBeInTheDocument();
  });

  it('U·a_marked_departure_shows_the_mark_beside_its_real_state', async () => {
    open(pageWith({ pendingRegularization: true, mark: 'Pendiente de regularización' }));
    const panel = (await screen.findByRole('heading', { name: 'SAL-018' })).closest('section') as HTMLElement;
    expect(within(panel).getByText('Programada')).toBeInTheDocument();
    expect(within(panel).getByText('Pendiente de regularización')).toBeInTheDocument();
  });

  it('U·the_mark_is_said_once_on_the_page', async () => {
    open(pageWith({ pendingRegularization: true, mark: 'Pendiente de regularización' }));
    const panel = (await screen.findByRole('heading', { name: 'SAL-018' })).closest('section') as HTMLElement;
    expect(within(panel).getAllByText('Pendiente de regularización')).toHaveLength(1);
  });

  it('U·a_marked_departure_in_execution_offers_the_end_and_not_the_regularization', async () => {
    open(pageWith({ status: 'IN_EXECUTION', actualStart: '2026-10-18T08:05', pendingRegularization: true, mark: 'Pendiente de regularización' }));
    expect(await screen.findByRole('heading', { name: 'Registrar la finalización o la interrupción' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Registrar lo ocurrido' })).not.toBeInTheDocument();
  });

  it('U·a_marked_scheduled_departure_offers_the_regularization_and_not_the_start', async () => {
    open(pageWith({ pendingRegularization: true }));
    expect(await screen.findByRole('heading', { name: 'Registrar lo ocurrido' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar inicio real' })).not.toBeInTheDocument();
  });
});
