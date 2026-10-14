import type { Departure, DepartureExecutionGateway, HistoryEntry, ReservationService } from './gateway';

// Test data, labelled as such on the page: one departure per status, fictitious (RN-OPS-PT-42).
const who = 'Operador demo';
const log = (at: string, action: string, detail: string): HistoryEntry => ({ at, who, action, detail });
const reservation = (reservationId: string, customer: string, travelers: number, state: ReservationService['state'], service = 'Caminata al cañón del río'): ReservationService => ({
  reservationId, customer, service, travelers, state,
});

const seed = (): Departure[] => [
  {
    code: 'SAL-018', status: 'SCHEDULED', vehicles: ['Van VAN-204'], capacity: 12, booked: 8, scheduledStart: '2026-10-18T08:00', scheduledEnd: '2026-10-18T14:00', mark: '—',
    reservations: [reservation('RES-1001', 'Cliente de prueba', 4, 'ELIGIBLE'), reservation('RES-1003', 'Cliente de prueba 2', 4, 'NOT_ELIGIBLE')],
    novelties: [], history: [log('2026-10-15T09:00', 'Salida programada', 'Creada con 8 viajeros')],
  },
  {
    code: 'SAL-021', status: 'IN_EXECUTION', vehicles: ['Bote BOT-02'], capacity: 10, booked: 6, scheduledStart: '2026-10-14T07:00', scheduledEnd: '2026-10-14T13:00', actualStart: '2026-10-14T07:05', mark: 'Iniciada',
    reservations: [reservation('RES-1002', 'Cliente de prueba', 4, 'IN_EXECUTION', 'Paseo en bote por la ciénaga'), reservation('RES-1004', 'Cliente de prueba 2', 2, 'IN_EXECUTION', 'Paseo en bote por la ciénaga')],
    novelties: [], history: [log('2026-10-14T07:05', 'Inicio de la salida', 'Inicio real 2026-10-14 07:05')],
  },
  {
    code: 'SAL-014', status: 'PENDING_REGULARIZATION', vehicles: ['Van VAN-101'], capacity: 12, booked: 9, scheduledStart: '2026-10-10T08:00', scheduledEnd: '2026-10-10T14:00', actualStart: '2026-10-10T08:00', mark: 'Sin cierre',
    reservations: [reservation('RES-0990', 'Cliente de prueba', 9, 'IN_EXECUTION')],
    novelties: [], history: [log('2026-10-10T08:00', 'Inicio de la salida', 'Inicio real 2026-10-10 08:00')],
  },
  {
    code: 'SAL-009', status: 'FINISHED', vehicles: ['Van VAN-204'], capacity: 12, booked: 7, scheduledStart: '2026-10-05T08:00', scheduledEnd: '2026-10-05T14:00', actualStart: '2026-10-05T08:00', actualEnd: '2026-10-05T13:40', mark: 'Cerrada',
    reservations: [{ ...reservation('RES-0950', 'Cliente de prueba', 7, 'FINISHED'), result: 'DELIVERED' }],
    novelties: [], history: [log('2026-10-05T08:00', 'Inicio de la salida', 'Inicio real 2026-10-05 08:00'), log('2026-10-05T13:40', 'Finalización', 'Finalizada')],
  },
  {
    code: 'SAL-003', status: 'CANCELLED', vehicles: [], capacity: 10, booked: 0, scheduledStart: '2026-10-02T08:00', scheduledEnd: '2026-10-02T14:00', mark: 'Cancelada',
    reservations: [], novelties: [], history: [log('2026-10-01T10:00', 'Salida cancelada', 'Sin cupos mínimos')],
  },
];

// Opening a departure from a reservation of the operations list (the list works per reservation in the fixture).
const BY_RESERVATION: Record<string, string> = { 'RES-1001': 'SAL-018', 'RES-1002': 'SAL-021' };
export const departureCodeOfReservation = (reservationId: string): string => BY_RESERVATION[reservationId] ?? 'SAL-018';

const copy = (d: Departure): Departure => ({
  ...d,
  vehicles: [...d.vehicles],
  reservations: d.reservations.map((r) => ({ ...r })),
  novelties: d.novelties.map((n) => ({ ...n })),
  history: [...d.history],
});

export function createDepartureFixture(): DepartureExecutionGateway {
  const departures = seed();
  const answered = new Map<string, Departure>();
  const find = (code: string) => {
    const found = departures.find((d) => d.code === code);
    if (!found) throw new Error('NOT_FOUND');
    return found;
  };
  // Same key, same answer, nothing applied twice (RN-OPS-PT-40).
  const once = (key: string, apply: () => void, code: string): Departure => {
    const reused = answered.get(key);
    if (reused) return copy(reused);
    apply();
    const result = copy(find(code));
    answered.set(key, result);
    return copy(result);
  };

  return {
    getDeparture: async (code) => {
      const found = departures.find((d) => d.code === code);
      return found && copy(found);
    },
    registerStart: async ({ code, startedAt, key }) =>
      once(key, () => {
        const d = find(code);
        if (d.status !== 'SCHEDULED') throw new Error('INVALID_STATUS_TRANSITION');
        if (new Date(startedAt) < new Date(d.scheduledStart)) throw new Error('START_BEFORE_SCHEDULED');
        d.status = 'IN_EXECUTION';
        d.actualStart = startedAt;
        d.mark = 'Iniciada';
        d.reservations.forEach((r) => {
          if (r.state === 'ELIGIBLE') r.state = 'IN_EXECUTION';
          else if (r.state === 'NOT_ELIGIBLE') r.state = 'CANCELLED';
        });
        d.history.push(log(startedAt, 'Inicio de la salida', `Inicio real ${startedAt.replace('T', ' ')}`));
      }, code),
    registerServices: async ({ code, entries, key }) =>
      once(key, () => {
        const d = find(code);
        if (d.status !== 'IN_EXECUTION') throw new Error('INVALID_STATUS_TRANSITION');
        entries.forEach((e) => {
          const r = d.reservations.find((x) => x.reservationId === e.reservationId);
          if (r) Object.assign(r, { result: e.result, cause: e.result === 'NOT_DELIVERED' ? e.cause : undefined });
        });
        d.history.push(log(d.actualStart ?? '', 'Servicios registrados', `${entries.length} reservas`));
      }, code),
    registerNovelty: async ({ code, reservationId, detail, emergency, affected, key }) =>
      once(key, () => {
        const d = find(code);
        if (d.status !== 'IN_EXECUTION') throw new Error('INVALID_STATUS_TRANSITION');
        const at = d.actualStart ?? '';
        d.novelties.push({ at, type: emergency ? 'Emergencia personal' : 'Novedad', detail, who, reservationId, affected });
        d.history.push(log(at, emergency ? 'Emergencia personal' : 'Novedad', detail));
      }, code),
    registerFinish: async ({ code, finishedAt, result, cause, key }) =>
      once(key, () => {
        const d = find(code);
        if (d.status !== 'IN_EXECUTION') throw new Error('INVALID_STATUS_TRANSITION');
        d.status = 'FINISHED';
        d.actualEnd = finishedAt;
        d.mark = result === 'INTERRUPTED' ? 'Finalizada con interrupción' : 'Cerrada';
        d.reservations.forEach((r) => {
          if (r.state === 'IN_EXECUTION') r.state = 'FINISHED';
        });
        d.history.push(log(finishedAt, 'Finalización', result === 'INTERRUPTED' ? `Interrumpida: ${cause}` : 'Finalizada'));
      }, code),
    registerRegularization: async (input) =>
      once(input.key, () => {
        const d = find(input.code);
        if (d.status !== 'PENDING_REGULARIZATION') throw new Error('INVALID_STATUS_TRANSITION');
        const notDone = input.result === 'NOT_DONE';
        d.status = notDone ? 'CANCELLED' : 'FINISHED';
        d.mark = notDone ? 'No realizada' : input.result === 'INTERRUPTED' ? 'Finalizada con interrupción' : 'Cerrada';
        if (!notDone) {
          d.actualStart = input.startedAt;
          d.actualEnd = input.finishedAt;
        }
        const at = notDone ? (d.actualStart ?? d.scheduledStart) : input.finishedAt;
        const detail = notDone ? `No realizada: ${input.notDoneCause}` : input.result === 'INTERRUPTED' ? `Interrumpida: ${input.interruption}` : 'Ejecutada y finalizada';
        d.history.push(log(at, 'Regularización', detail));
      }, input.code),
  };
}
