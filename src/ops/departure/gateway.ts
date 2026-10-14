// Port of the departure execution page to the operations-cost service (spec 004 plan D-02). Only the test-data
// adapter exists: the contract of the service is not written yet (spec G-1).
export type DepartureStatus = 'SCHEDULED' | 'IN_EXECUTION' | 'PENDING_REGULARIZATION' | 'FINISHED' | 'CANCELLED';

export interface HistoryEntry {
  at: string;
  who: string;
  action: string;
  detail: string;
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
  history: HistoryEntry[];
}

export interface StartInput {
  code: string;
  startedAt: string;
  key: string;
}

export interface DepartureExecutionGateway {
  // Resolves undefined when the departure does not exist.
  getDeparture(code: string): Promise<Departure | undefined>;
  registerStart(input: StartInput): Promise<Departure>;
}
