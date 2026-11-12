// Port of the departure execution page (spec 004 plan D-02). Two adapters: the test data (`fixture.ts`) and the one that talks to the
// operations-cost service (`execution.ts`, spec 008), which serves only the panels the service can back.
import type { Vehicle } from '../departures/model';
import type { PanelId } from './panels';

export type DepartureStatus = 'SCHEDULED' | 'IN_EXECUTION' | 'FINISHED' | 'CANCELLED';

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
  // The service of the tour; the test data have it and the service does not send it.
  service?: string;
  travelers: number;
  state: ReservationState;
  result?: ServiceResult;
  // Since contract 0.7.0 the travelers served and the no-show are recorded next to the reserved ones.
  travelersServed?: number;
  noShow?: boolean;
  cause?: string;
  // Since contract 0.10.0 (HU-OPS-005): why, by whom and when the reservation was cancelled extraordinarily; the time is the wall clock of the tenant.
  extraordinaryCancellation?: ExtraordinaryCancellation;
}

export interface ExtraordinaryCancellation {
  justification: string;
  recordedBy: string;
  recordedAt: string;
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
  // Since contract 0.6.0 the service says both: the mark of a departure past its estimated end with no closing (it is not a state),
  // and the alert of a scheduled departure whose start passed. The test data may leave them out.
  pendingRegularization?: boolean;
  startAlert?: boolean;
  // Present only for a departure that ended as an interruption (PDR K1).
  interruptionCause?: string;
  // What the service says of the tour and of the vehicles that are on the departure; the test data leave them out.
  transportRequired?: boolean;
  vehicleIds?: string[];
  reservations: ReservationService[];
  // The real base: the travelers served of the delivered reservations; absent when the reservations could not be read.
  travelersServed?: number;
  // True when the service answered the departure without its reservations because it could not read them (api 006 D-04).
  reservationsUnavailable?: boolean;
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
  entries: { reservationId: string; result: ServiceResult; travelersServed: number; noShow: boolean; cause: string }[];
  key: string;
}

export interface ExtraordinaryCancellationInput {
  code: string;
  reservationId: string;
  justification: string;
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

// The operational costs of a departure (HU-OPS-007). The amounts are minor units; the total is the service's sum of the lines.
export type CostMode = 'CALCULATED' | 'MANUAL';

export interface CostLine {
  costId: string;
  concept: string;
  amountCents: number;
  mode: CostMode;
  unitCostCents?: number;
  travelersServed?: number;
  withoutParametrization: boolean;
  justification?: string;
  recordedAt: string;
}

export interface CostSheet {
  lines: CostLine[];
  totalCents: number;
  travelersServed: number;
  // The cost the catalog parametrizes for the tour; absent when the tour has none (no calculation, the expense needs its justification).
  baseCostCents?: number;
}

// A calculated cost sends only its concept: the service computes the amount (api 007 D-03).
export interface CostInput {
  code: string;
  concept: string;
  mode: CostMode;
  amountCents: number;
  justification: string;
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
  // HU-OPS-005: the answer is the departure as it is now, with the cancellation next to its reservation.
  recordExtraordinaryCancellation(input: ExtraordinaryCancellationInput): Promise<Departure>;
  registerFinish(input: FinishInput): Promise<Departure>;
  registerRegularization(input: RegularizationInput): Promise<Departure>;
  // Only the adapter of the service has them: the vehicles of the tenant, and adding some to a scheduled departure (HU-OPS-002).
  listVehicles?(): Promise<Vehicle[]>;
  addVehicles?(input: AddVehiclesInput): Promise<Departure>;
  // The costs of a departure: only the adapter of the service and the test data have them.
  getCosts?(code: string): Promise<CostSheet>;
  recordCost?(input: CostInput): Promise<CostLine>;
}
