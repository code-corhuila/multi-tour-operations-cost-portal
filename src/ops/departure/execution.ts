import type { ApiClient } from '../../contract';
import { translate } from '../departures/scheduling';
import { TENANT_TIME_ZONE, fromInstant } from '../departures/time';
import type { Departure, DepartureExecutionGateway, DepartureStatus } from './gateway';

// The adapter of the page of a departure to the operations-cost service (spec 008 plan D-02). Only what the service offers is
// served: reading a departure. What it does not offer yet is refused here and never sent; its panels are not drawn (D-03).
interface DepartureAnswer {
  code: string;
  status: DepartureStatus;
  scheduledStart: string;
  scheduledEnd: string;
  capacity: number;
  booked: number;
  actualStart?: string;
  actualEnd?: string;
  interrupted: boolean;
  interruptionCause?: string;
  vehicles: { name: string }[];
}

const wall = (instant?: string) => (instant ? fromInstant(instant, TENANT_TIME_ZONE) : undefined);
const notAvailable = () => Promise.reject(new Error('NOT_AVAILABLE'));

function asDeparture(d: DepartureAnswer): Departure {
  return {
    code: d.code,
    status: d.status,
    vehicles: d.vehicles.map((v) => v.name),
    capacity: d.capacity,
    booked: d.booked,
    scheduledStart: fromInstant(d.scheduledStart, TENANT_TIME_ZONE),
    scheduledEnd: fromInstant(d.scheduledEnd, TENANT_TIME_ZONE),
    actualStart: wall(d.actualStart),
    actualEnd: wall(d.actualEnd),
    mark: d.interrupted ? 'Interrumpida' : '',
    ...(d.interruptionCause ? { interruptionCause: d.interruptionCause } : {}),
    reservations: [],
    novelties: [],
    history: [],
  };
}

export function createExecutionGateway(apiClient: ApiClient): DepartureExecutionGateway {
  return {
    connected: true,
    panels: ['departure'],
    async getDeparture(code) {
      try {
        return asDeparture(await apiClient.request<DepartureAnswer>(`/api/v1/operations-cost/departures/${code}`));
      } catch (error) {
        if (typeof error === 'object' && error !== null && (error as { status?: number }).status === 404) return undefined;
        throw translate(error);
      }
    },
    registerStart: notAvailable,
    registerServices: notAvailable,
    registerNovelty: notAvailable,
    registerFinish: notAvailable,
    registerRegularization: notAvailable,
  };
}
