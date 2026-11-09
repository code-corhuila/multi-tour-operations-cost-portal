// Port of the departure execution page (spec 004 plan D-02). Two adapters: the test data (`fixture.ts`) and the one that talks to the
// operations-cost service (`execution.ts`, spec 008), which serves only the panels the service can back.
import type { Vehicle } from '../departures/model';
import type { PanelId } from './panels';

export type DepartureStatus = 'SCHEDULED' | 'IN_EXECUTION' | 'PENDING_REGULARIZATION' | 'FINISHED' | 'CANCELLED';

export interface HistoryEntry {
  at: string;
  who: string;
  action: string;
  detail: string;
}

export type ReservationState = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'IN_EXECUTION' | 'FINISHED' | 'CANCELLED';
export type ServiceResult = 'DELIVERED' | 'NOT_DELIVERED';

// What was reserved never changes; what was delivered is recorded next to it (RN-OPS-PT-35).
export interface ReservationService {
  reservationId: string;
  customer: string;
  service: string;
  travelers: number;
  state: ReservationState;
  result?: ServiceResult;
  cause?: string;
}

export interface Novelty {
  at: string;
  type: 'Novedad' | 'Emergencia personal';
  detail: string;
  who: string;
  reservationId: string;
  affected?: number;
}

// Times are wall-clock strings of the tenant ("2026-10-18T08:00"); the container does not give the tenant zone yet.
export interface Departure {
  code: string;
  status: DepartureStatus;
  vehicles: string[];
  capacity: number;
  booked: number;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart?: string;
  actualEnd?: string;
  mark: string;
  // Present only for a departure that ended as an interruption (PDR K1).
  interruptionCause?: string;
  // What the service says of the tour and of the vehicles that are on the departure; the test data leave them out.
  transportRequired?: boolean;
  vehicleIds?: string[];
  reservations: ReservationService[];
  novelties: Novelty[];
  history: HistoryEntry[];
}

export interface StartInput {
  code: string;
  startedAt: string;
  key: string;
}

export interface ServicesInput {
  code: string;
  entries: { reservationId: string; result: ServiceResult; cause: string }[];
  key: string;
}

export interface NoveltyInput {
  code: string;
  reservationId: string;
  detail: string;
  emergency: boolean;
  affected?: number;
  key: string;
}

export interface FinishInput {
  code: string;
  finishedAt: string;
  result: 'FINISHED' | 'INTERRUPTED';
  cause: string;
  key: string;
}

export type RegularizationResult = 'EXECUTED' | 'INTERRUPTED' | 'NOT_DONE';

// Fields that do not apply to the result are sent empty (RN-OPS-PT-38).
export interface RegularizationInput {
  code: string;
  result: RegularizationResult;
  startedAt: string;
  finishedAt: string;
  earlyStartMotive: string;
  interruption: string;
  notDoneCause: string;
  key: string;
}

export interface AddVehiclesInput {
  code: string;
  vehicleIds: string[];
  key: string;
}

export interface DepartureExecutionGateway {
  // True for the adapter that talks to the service; absent for the test data.
  connected?: boolean;
  // The panels this adapter can serve; absent means all of them. A panel the service cannot back yet is not drawn (spec 008 D-03).
  panels?: readonly PanelId[];
  // Resolves undefined when the departure does not exist.
  getDeparture(code: string): Promise<Departure | undefined>;
  registerStart(input: StartInput): Promise<Departure>;
  registerServices(input: ServicesInput): Promise<Departure>;
  registerNovelty(input: NoveltyInput): Promise<Departure>;
  registerFinish(input: FinishInput): Promise<Departure>;
  registerRegularization(input: RegularizationInput): Promise<Departure>;
  // Only the adapter of the service has them: the vehicles of the tenant, and adding some to a scheduled departure (HU-OPS-002).
  listVehicles?(): Promise<Vehicle[]>;
  addVehicles?(input: AddVehiclesInput): Promise<Departure>;
}
