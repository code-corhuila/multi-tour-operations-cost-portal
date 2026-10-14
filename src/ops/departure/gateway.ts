// Port of the departure execution page to the operations-cost service (spec 004 plan D-02). Only the test-data
// adapter exists: the contract of the service is not written yet (spec G-1).
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

export interface DepartureExecutionGateway {
  // Resolves undefined when the departure does not exist.
  getDeparture(code: string): Promise<Departure | undefined>;
  registerStart(input: StartInput): Promise<Departure>;
  registerServices(input: ServicesInput): Promise<Departure>;
  registerNovelty(input: NoveltyInput): Promise<Departure>;
  registerFinish(input: FinishInput): Promise<Departure>;
  registerRegularization(input: RegularizationInput): Promise<Departure>;
}
