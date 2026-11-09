import { Forbidden, Refused } from '../departures/model';
import type { Departure, DepartureExecutionGateway } from './gateway';

export interface PanelProps {
  departure: Departure;
  gateway: DepartureExecutionGateway;
  canManage: boolean;
  // Only the Administrator schedules and gives vehicles to a departure (RN-OPS-PT-58).
  canSchedule?: boolean;
  onChanged: (departure: Departure) => void;
}

// What a panel says when a recording failed: a refusal of the service is told as such (the body and the trace id never are), and the
// person keeps their data in every case.
export function failureText(error: unknown, what: string): string {
  if (error instanceof Refused) {
    const reason =
      error.code === 'INVALID_STATUS_TRANSITION'
        ? 'la salida ya no está en el estado que esperaba este registro; vuelve a abrirla para ver cómo quedó'
        : 'la hora está fuera de lo permitido (no antes del inicio ni en el futuro)';
    return `El servicio no aceptó ${what}: ${reason}. Tus datos siguen aquí.`;
  }
  if (error instanceof Forbidden) return 'Tu usuario no tiene el permiso Gestionar ejecución de salidas. Tus datos siguen aquí.';
  return `No pudimos registrar ${what}. Tus datos siguen aquí.`;
}

// The page shows the wall-clock strings as the service gives them.
export const showTime = (value?: string) => (value ? value.replace('T', ' ') : '—');
