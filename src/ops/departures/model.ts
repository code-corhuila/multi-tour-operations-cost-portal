// Port of the screens "Salidas" and "Programar salida" to the operations-cost service (spec 005 plan D-01). Two adapters:
// the test data (`fixture.ts`) answers everything, and `scheduling.ts` answers the tours and the scheduling of a new
// departure from the service (spec 006); the list, the edit and the cancellation have no route yet (HU-OPS-003, HU-OPS-006).
export type DepartureStatus = 'SCHEDULED' | 'IN_EXECUTION' | 'PENDING_REGULARIZATION' | 'FINISHED' | 'CANCELLED';

export interface Tour {
  id: string;
  name: string;
  capacity: number;
  needsTransport: boolean;
}

export interface Vehicle {
  id: string;
  name: string;
  capacity: number;
}

// Times are wall-clock strings of the tenant ("2026-10-18T08:00"), like the execution page.
export interface DepartureRow {
  code: string;
  tourId: string;
  start: string;
  end: string;
  vehicleIds: string[];
  booked: number;
  reservations: number;
  status: DepartureStatus;
  // The effective capacity the service answers; the test data leave it out and the page computes it.
  capacity?: number;
}

export interface CancelInput {
  code: string;
  cause: string;
  key: string;
}

export interface ScheduleInput {
  tourId: string;
  start: string;
  end: string;
  vehicleIds: string[];
  key: string;
}

export interface UpdateInput extends ScheduleInput {
  code: string;
}

export interface VehicleInput {
  name: string;
  capacity: number;
  key: string;
}

export interface DeparturesGateway {
  // True for the adapter that talks to the service; absent for the test data (HU-OPS-002 turns the vehicles on with it).
  connected?: boolean;
  // False when the service does not take vehicles yet (HU-OPS-002): the form then offers none. Absent means true.
  supportsVehicles?: boolean;
  // Only the connected adapter registers vehicles; with the test data the section "Vehículos" is not drawn.
  createVehicle?(input: VehicleInput): Promise<Vehicle>;
  listDepartures(): Promise<DepartureRow[]>;
  listTours(): Promise<Tour[]>;
  listVehicles(): Promise<Vehicle[]>;
  scheduleDeparture(input: ScheduleInput): Promise<DepartureRow>;
  // Only a SCHEDULED departure is edited; with reservations its date, hours and tour stay (RN-OPS-PT-56).
  updateDeparture(input: UpdateInput): Promise<DepartureRow>;
  // Only a SCHEDULED departure is cancelled; the answer says how many reservations open their rescheduling.
  cancelDeparture(input: CancelInput): Promise<{ departure: DepartureRow; reservationsToReschedule: number }>;
}

// Typed failures of the port (spec 006 D-04). The form turns each into its own Spanish text; the body of an answer
// and the trace id are never shown. `FieldError.fields` use the names of the request (`scheduledStart`, `scheduledEnd`,
// `serviceId`, `timeZone`); the form maps them to its own fields. A 422 carries only the `code` of the envelope: the
// container replaces the message of the service by its own generic one.
export class FieldError extends Error {
  override readonly name = 'FieldError';
  constructor(readonly fields: { field: string; message: string }[]) {
    super('Some data must be corrected.');
  }
}
export class Refused extends Error {
  override readonly name = 'Refused';
  constructor(readonly code: string) {
    super('The service did not accept the request.');
  }
}
export class Forbidden extends Error {
  override readonly name = 'Forbidden';
  constructor() {
    super('Not allowed.');
  }
}
export class Unavailable extends Error {
  override readonly name = 'Unavailable';
  constructor() {
    super('The service does not answer.');
  }
}
export class Failed extends Error {
  override readonly name = 'Failed';
  constructor() {
    super('The request failed.');
  }
}
