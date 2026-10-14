import type { Execution, OperationsGateway, UpcomingDeparture } from './gateway';

// Test data, labelled as such on the page. It is fictitious: no real names, e-mails or ids.
export function createFixtureGateway(): OperationsGateway {
  const upcoming: UpcomingDeparture[] = [
    { reservationId: 'RES-1001', date: '2026-10-18', service: 'Caminata al cañón del río', status: 'CONFIRMED' },
    { reservationId: 'RES-1002', date: '2026-10-19', service: 'Paseo en bote por la ciénaga', status: 'CONFIRMED' },
    { reservationId: 'RES-1003', date: '2026-10-21', service: 'Observación de aves', status: 'PENDING' },
  ];
  const executions: Execution[] = [
    { reservationId: 'RES-0990', date: '2026-10-10', service: 'Caminata al cañón del río', reserved: 6, executed: 6, cause: '—', status: 'IN_PROGRESS', responsible: 'Operador demo' },
  ];

  return {
    listUpcoming: async () => [...upcoming],
    listExecutions: async () => executions.map((e) => ({ ...e })),
    finalizeExecution: async (reservationId) => {
      const found = executions.find((e) => e.reservationId === reservationId);
      if (!found) throw new Error('NOT_FOUND');
      found.status = 'FINISHED';
      return { ...found };
    },
    getReservation: async (reservationId) => {
      const row = upcoming.find((u) => u.reservationId === reservationId);
      if (!row) throw new Error('NOT_FOUND');
      return { reservationId, customer: 'Cliente de prueba', service: row.service, date: row.date, reserved: 6 };
    },
    registerExecution: async (input) => {
      const row = upcoming.find((u) => u.reservationId === input.reservationId);
      const created: Execution = {
        reservationId: input.reservationId,
        date: row?.date ?? '',
        service: row?.service ?? '',
        reserved: 6,
        executed: input.served ? input.executed : 0,
        cause: input.served ? '—' : input.cause,
        status: 'IN_PROGRESS',
        responsible: 'Operador demo',
      };
      executions.push(created);
      return { ...created };
    },
    recordCost: async () => undefined,
  };
}
