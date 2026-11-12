import type { DepartureStatus } from './gateway';

export type PanelId = 'departure' | 'vehicles' | 'start' | 'regularize' | 'reservations' | 'novelties' | 'finish' | 'costs' | 'history' | 'cancel' | 'cancellation';

// The only place that knows which panels a status shows (spec 004 section 3.2, RN-OPS-PT-31).
const BY_STATUS: Record<DepartureStatus, PanelId[]> = {
  SCHEDULED: ['departure', 'vehicles', 'start', 'cancel', 'reservations', 'costs', 'history'],
  IN_EXECUTION: ['departure', 'reservations', 'novelties', 'finish', 'costs', 'history'],
  FINISHED: ['departure', 'reservations', 'novelties', 'costs', 'history'],
  CANCELLED: ['departure', 'cancellation', 'reservations', 'costs', 'history'],
};

// A marked departure that never started is regularized; one that is running is closed by its end (the service refuses the other way).
const PENDING_NEVER_STARTED: PanelId[] = ['departure', 'regularize', 'cancel', 'reservations', 'costs', 'history'];

export const panelsFor = (status: DepartureStatus, pendingRegularization = false): PanelId[] =>
  status === 'SCHEDULED' && pendingRegularization ? PENDING_NEVER_STARTED : BY_STATUS[status];
