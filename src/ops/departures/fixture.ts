import type { DepartureRow, DeparturesGateway, Tour, Vehicle } from './model';

// Test data, labelled as such on the page (RN-OPS-PT-61). The codes are the ones of the execution page fixture,
// so "Registrar ejecución" opens the same departure.
const tours: Tour[] = [
  { id: 'T-1', name: 'Caminata al cañón del río', capacity: 12, needsTransport: true },
  { id: 'T-2', name: 'Paseo en bote por la ciénaga', capacity: 10, needsTransport: true },
  { id: 'T-3', name: 'Sendero del café', capacity: 8, needsTransport: false },
];

const vehicles: Vehicle[] = [
  { id: 'V-1', name: 'Van VAN-204', capacity: 12 },
  { id: 'V-2', name: 'Bote BOT-02', capacity: 10 },
  { id: 'V-3', name: 'Van VAN-101', capacity: 12 },
  { id: 'V-4', name: 'Bus Andino 01', capacity: 30 },
];

const seed = (): DepartureRow[] => [
  { code: 'SAL-018', tourId: 'T-1', start: '2026-10-18T08:00', end: '2026-10-18T14:00', vehicleIds: ['V-1'], booked: 8, reservations: 2, status: 'SCHEDULED' },
  { code: 'SAL-021', tourId: 'T-2', start: '2026-10-14T07:00', end: '2026-10-14T13:00', vehicleIds: ['V-2'], booked: 6, reservations: 2, status: 'IN_EXECUTION' },
  { code: 'SAL-014', tourId: 'T-1', start: '2026-10-10T08:00', end: '2026-10-10T14:00', vehicleIds: ['V-3'], booked: 9, reservations: 1, status: 'PENDING_REGULARIZATION' },
  { code: 'SAL-009', tourId: 'T-1', start: '2026-10-05T08:00', end: '2026-10-05T14:00', vehicleIds: ['V-1'], booked: 7, reservations: 1, status: 'FINISHED' },
  { code: 'SAL-003', tourId: 'T-2', start: '2026-10-02T08:00', end: '2026-10-02T14:00', vehicleIds: [], booked: 0, reservations: 0, status: 'CANCELLED' },
  { code: 'SAL-025', tourId: 'T-3', start: '2026-10-25T09:00', end: '2026-10-25T15:00', vehicleIds: [], booked: 0, reservations: 0, status: 'SCHEDULED' },
];

export function createDeparturesFixture(): DeparturesGateway {
  const departures = seed();
  const answered = new Map<string, { departure: DepartureRow; reservationsToReschedule: number }>();
  const copy = (d: DepartureRow): DepartureRow => ({ ...d, vehicleIds: [...d.vehicleIds] });

  return {
    listDepartures: async () => departures.map(copy),
    listTours: async () => tours.map((t) => ({ ...t })),
    listVehicles: async () => vehicles.map((v) => ({ ...v })),
    cancelDeparture: async ({ code, cause, key }) => {
      const reused = answered.get(key);
      if (reused) return { departure: copy(reused.departure), reservationsToReschedule: reused.reservationsToReschedule };
      const found = departures.find((d) => d.code === code);
      if (!found) throw new Error('NOT_FOUND');
      if (found.status !== 'SCHEDULED') throw new Error('INVALID_STATUS_TRANSITION');
      if (!cause.trim()) throw new Error('VALIDATION_ERROR');
      found.status = 'CANCELLED';
      const result = { departure: copy(found), reservationsToReschedule: found.reservations };
      answered.set(key, result);
      return { departure: copy(result.departure), reservationsToReschedule: result.reservationsToReschedule };
    },
  };
}
