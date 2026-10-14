// Port of the page to the operations-cost service. Only the test-data adapter exists in this version (declared: the
// service has no portal consumer yet); the HTTP adapter comes with the contract (spec 001 plan D-02).
export interface UpcomingDeparture {
  reservationId: string;
  date: string;
  service: string;
  status: 'CONFIRMED' | 'PENDING';
}

export interface Execution {
  reservationId: string;
  date: string;
  service: string;
  reserved: number;
  executed: number;
  cause: string;
  status: 'IN_PROGRESS' | 'FINISHED';
  responsible: string;
}

export interface OperationsGateway {
  listUpcoming(): Promise<UpcomingDeparture[]>;
  listExecutions(): Promise<Execution[]>;
  finalizeExecution(reservationId: string): Promise<Execution>;
  getReservation(reservationId: string): Promise<ReservationToExecute>;
  registerExecution(input: ExecutionInput): Promise<Execution>;
  recordCost(input: CostInput): Promise<void>;
}

export interface ReservationToExecute {
  reservationId: string;
  customer: string;
  service: string;
  date: string;
  reserved: number;
}

export interface ExecutionInput {
  reservationId: string;
  served: boolean;
  executed: number;
  cause: string;
}

export interface CostInput {
  reservationId: string;
  concept: string;
  amountCents: number;
}

