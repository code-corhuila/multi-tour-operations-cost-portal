import type { Departure, DepartureExecutionGateway, HistoryEntry } from './gateway';

// Test data, labelled as such on the page: one departure per status, fictitious (RN-OPS-PT-42).
const who = 'Operador demo';
const log = (at: string, action: string, detail: string): HistoryEntry => ({ at, who, action, detail });

const seed = (): Departure[] => [
  { code: 'SAL-018', status: 'SCHEDULED', vehicles: ['Van VAN-204'], capacity: 12, booked: 8, scheduledStart: '2026-10-18T08:00', scheduledEnd: '2026-10-18T14:00', mark: '—', history: [log('2026-10-15T09:00', 'Salida programada', 'Creada con 8 viajeros')] },
  { code: 'SAL-021', status: 'IN_EXECUTION', vehicles: ['Bote BOT-02'], capacity: 10, booked: 6, scheduledStart: '2026-10-14T07:00', scheduledEnd: '2026-10-14T13:00', actualStart: '2026-10-14T07:05', mark: 'Iniciada', history: [log('2026-10-14T07:05', 'Inicio de la salida', 'Inicio real 2026-10-14 07:05')] },
  { code: 'SAL-014', status: 'PENDING_REGULARIZATION', vehicles: ['Van VAN-101'], capacity: 12, booked: 9, scheduledStart: '2026-10-10T08:00', scheduledEnd: '2026-10-10T14:00', actualStart: '2026-10-10T08:00', mark: 'Sin cierre', history: [log('2026-10-10T08:00', 'Inicio de la salida', 'Inicio real 2026-10-10 08:00')] },
  { code: 'SAL-009', status: 'FINISHED', vehicles: ['Van VAN-204'], capacity: 12, booked: 7, scheduledStart: '2026-10-05T08:00', scheduledEnd: '2026-10-05T14:00', actualStart: '2026-10-05T08:00', actualEnd: '2026-10-05T13:40', mark: 'Finalizada', history: [log('2026-10-05T08:00', 'Inicio de la salida', 'Inicio real 2026-10-05 08:00'), log('2026-10-05T13:40', 'Finalización', 'Finalizada')] },
  { code: 'SAL-003', status: 'CANCELLED', vehicles: [], capacity: 10, booked: 0, scheduledStart: '2026-10-02T08:00', scheduledEnd: '2026-10-02T14:00', mark: 'Cancelada', history: [log('2026-10-01T10:00', 'Salida cancelada', 'Sin cupos mínimos')] },
];

// Opening a departure from a reservation of the operations list (the list works per reservation in the fixture).
const BY_RESERVATION: Record<string, string> = { 'RES-1001': 'SAL-018', 'RES-1002': 'SAL-021' };
export const departureCodeOfReservation = (reservationId: string): string => BY_RESERVATION[reservationId] ?? 'SAL-018';

export function createDepartureFixture(): DepartureExecutionGateway {
  const departures = seed();
  const answered = new Map<string, Departure>();

  return {
    getDeparture: async (code) => {
      const found = departures.find((d) => d.code === code);
      return found && { ...found, history: [...found.history] };
    },
    registerStart: async ({ code, startedAt, key }) => {
      const reused = answered.get(key);
      if (reused) return { ...reused };
      const found = departures.find((d) => d.code === code);
      if (!found) throw new Error('NOT_FOUND');
      if (new Date(startedAt) < new Date(found.scheduledStart)) throw new Error('START_BEFORE_SCHEDULED');
      found.status = 'IN_EXECUTION';
      found.actualStart = startedAt;
      found.mark = 'Iniciada';
      found.history.push(log(startedAt, 'Inicio de la salida', `Inicio real ${startedAt.replace('T', ' ')}`));
      const result = { ...found, history: [...found.history] };
      answered.set(key, result);
      return { ...result };
    },
  };
}
