import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../contract';
import { DepartureExecutionPage } from './DepartureExecutionPage';
import { createExecutionGateway } from './execution';
import { isAfterNow } from './panelProps';

// Spec 015 PT15-02 (RN-PT-151): a departure keeps the zone it was scheduled with, whatever the zone of the tenant is now.

type Call = { path: string; init?: { method?: string; body?: Record<string, unknown> } };

const departure = (extra: Record<string, unknown> = {}) => ({
  code: 'SAL-077',
  serviceId: 'tour-1',
  status: 'SCHEDULED',
  // 08:00 to 14:00 in Mexico City (UTC-6)
  scheduledStart: '2026-11-10T14:00:00Z',
  scheduledEnd: '2026-11-10T20:00:00Z',
  timeZone: 'America/Mexico_City',
  capacity: 12,
  booked: 0,
  pendingRegularization: false,
  startAlert: false,
  interrupted: false,
  vehicles: [],
  ...extra,
});

describe('the zone of a departure', () => {
  it('U·a_departure_is_read_and_recorded_in_its_own_zone', async () => {
    const calls: Call[] = [];
    let started = false;
    const client: ApiClient = {
      request: async <T,>(path: string, init?: Call['init']) => {
        calls.push({ path, init });
        if (path.endsWith('/executions')) started = true;
        if (path.includes('/vehicles')) return { data: [], meta: { totalPages: 1 } } as T;
        if (path.endsWith('/costs')) return { data: [], totalCents: 0, travelersServed: 0 } as T;
        return (started ? departure({ status: 'IN_EXECUTION', actualStart: '2026-11-10T14:00:00Z' }) : departure()) as T;
      },
    };
    render(<DepartureExecutionPage gateway={createExecutionGateway(client)} code="SAL-077" canManage onBack={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('Hora de inicio real'), { target: { value: '2026-11-10T08:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar inicio real' }));

    await waitFor(() => expect(calls.find((c) => c.path.endsWith('/executions'))?.init?.body).toEqual({ startedAt: '2026-11-10T14:00:00Z' }));
    expect(await screen.findByText('2026-11-10 08:00')).toBeInTheDocument();
  });

  it('U·a_real_hour_is_judged_against_now_in_the_zone_of_the_departure', () => {
    // 08:00 in Mexico City is 14:00 UTC: at 13:30 UTC it is still to come, whatever the zone of the browser
    expect(isAfterNow('2026-11-10T08:00', 'America/Mexico_City', Date.parse('2026-11-10T13:30:00Z'))).toBe(true);
    expect(isAfterNow('2026-11-10T08:00', 'America/Mexico_City', Date.parse('2026-11-10T14:30:00Z'))).toBe(false);
  });
});
