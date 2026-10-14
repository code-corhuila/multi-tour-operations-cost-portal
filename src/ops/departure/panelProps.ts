import type { Departure, DepartureExecutionGateway } from './gateway';

export interface PanelProps {
  departure: Departure;
  gateway: DepartureExecutionGateway;
  canManage: boolean;
  onChanged: (departure: Departure) => void;
}

// The page shows the wall-clock strings as the service gives them.
export const showTime = (value?: string) => (value ? value.replace('T', ' ') : '—');
