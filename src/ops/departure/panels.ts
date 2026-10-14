import type { DepartureStatus } from './gateway';

export type PanelId = 'departure' | 'start' | 'regularize' | 'reservations' | 'novelties' | 'finish' | 'history';

// The only place that knows which panels a status shows (spec 004 section 3.2, RN-OPS-PT-31).
const BY_STATUS: Record<DepartureStatus, PanelId[]> = {
  SCHEDULED: ['departure', 'start', 'reservations', 'history'],
  IN_EXECUTION: ['departure', 'reservations', 'novelties', 'finish', 'history'],
  PENDING_REGULARIZATION: ['departure', 'regularize', 'reservations', 'history'],
  FINISHED: ['departure', 'reservations', 'novelties', 'history'],
  CANCELLED: ['departure', 'reservations', 'history'],
};

export const panelsFor = (status: DepartureStatus): PanelId[] => BY_STATUS[status];
