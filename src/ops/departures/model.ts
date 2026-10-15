// Port of the screens "Salidas" and "Programar salida" to the operations-cost service (spec 005 plan D-01). Only the
// test-data adapter exists: the contract has `GET /departures` and nothing to schedule or cancel yet (spec G-1).
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

export interface DeparturesGateway {
  listDepartures(): Promise<DepartureRow[]>;
  listTours(): Promise<Tour[]>;
  listVehicles(): Promise<Vehicle[]>;
  // Only a SCHEDULED departure is cancelled; the answer says how many reservations open their rescheduling.
  scheduleDeparture(input: ScheduleInput): Promise<DepartureRow>;
  // Only a SCHEDULED departure is edited; with reservations its date, hours and tour stay (RN-OPS-PT-56).
  updateDeparture(input: UpdateInput): Promise<DepartureRow>;
  cancelDeparture(input: CancelInput): Promise<{ departure: DepartureRow; reservationsToReschedule: number }>;
}
