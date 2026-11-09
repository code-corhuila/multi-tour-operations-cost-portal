import type { ApiClient } from '../../contract';
import { readVehicles, translate } from '../departures/scheduling';
import { TENANT_TIME_ZONE, fromInstant, toInstant } from '../departures/time';
import type { Departure, DepartureExecutionGateway, DepartureStatus } from './gateway';

// The adapter of the page of a departure to the operations-cost service (spec 008 plan D-02). Only what the service offers is
// served: reading a departure, adding vehicles to it, recording its start and recording its end or interruption. What it does not offer yet is refused
// here and never sent; its panels are not drawn (D-03).
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
  pendingRegularization: boolean;
  startAlert: boolean;
  transportRequired?: boolean;
  vehicles: { vehicleId: string; name: string }[];
}

const wall = (instant?: string) => (instant ? fromInstant(instant, TENANT_TIME_ZONE) : undefined);
const notAvailable = () => Promise.reject(new Error('NOT_AVAILABLE'));
const DEPARTURES = '/api/v1/operations-cost/departures';

function asDeparture(d: DepartureAnswer): Departure {
  return {
    code: d.code,
    status: d.status,
    vehicles: d.vehicles.map((v) => v.name),
    vehicleIds: d.vehicles.map((v) => v.vehicleId),
    transportRequired: d.transportRequired ?? false,
    capacity: d.capacity,
    booked: d.booked,
    scheduledStart: fromInstant(d.scheduledStart, TENANT_TIME_ZONE),
    scheduledEnd: fromInstant(d.scheduledEnd, TENANT_TIME_ZONE),
    actualStart: wall(d.actualStart),
    actualEnd: wall(d.actualEnd),
    mark: d.pendingRegularization ? 'Pendiente de regularización' : d.interrupted ? 'Interrumpida' : '',
    pendingRegularization: d.pendingRegularization,
    startAlert: d.startAlert,
    ...(d.interruptionCause ? { interruptionCause: d.interruptionCause } : {}),
    reservations: [],
    novelties: [],
    history: [],
  };
}

export function createExecutionGateway(apiClient: ApiClient): DepartureExecutionGateway {
  return {
    connected: true,
    panels: ['departure', 'vehicles', 'start', 'finish'],
    listVehicles: () => readVehicles(apiClient),
    async addVehicles({ code, vehicleIds, key }) {
      return record(`${DEPARTURES}/${encodeURIComponent(code)}/vehicles`, key, () => ({ vehicleIds }));
    },
    async getDeparture(code) {
      try {
        return asDeparture(await apiClient.request<DepartureAnswer>(`${DEPARTURES}/${encodeURIComponent(code)}`));
      } catch (error) {
        if (typeof error === 'object' && error !== null && (error as { status?: number }).status === 404) return undefined;
        throw translate(error);
      }
    },
    async registerStart({ code, startedAt, key }) {
      return record(`${DEPARTURES}/${encodeURIComponent(code)}/executions`, key, () => ({ startedAt: toInstant(startedAt, TENANT_TIME_ZONE) }));
    },
    async registerFinish({ code, finishedAt, result, cause, key }) {
      return record(`${DEPARTURES}/${encodeURIComponent(code)}/finish`, key, () => ({
        finishedAt: toInstant(finishedAt, TENANT_TIME_ZONE),
        result,
        // only an interruption carries its cause
        ...(result === 'INTERRUPTED' ? { cause } : {}),
      }));
    },
    registerServices: notAvailable,
    registerNovelty: notAvailable,
    registerRegularization: notAvailable,
  };

  // The body is built inside the guard: a wall clock that cannot be converted is a failure that is told, and nothing is sent.
  async function record(path: string, key: string, body: () => Record<string, unknown>): Promise<Departure> {
    try {
      return asDeparture(await apiClient.request<DepartureAnswer>(path, { method: 'POST', headers: { 'Idempotency-Key': key }, body: body() }));
    } catch (error) {
      throw translate(error);
    }
  }
}
