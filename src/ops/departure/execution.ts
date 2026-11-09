import type { ApiClient } from '../../contract';
import { readVehicles, translate } from '../departures/scheduling';
import { TENANT_TIME_ZONE, fromInstant, toInstant } from '../departures/time';
import type { Departure, DepartureExecutionGateway, DepartureStatus, ReservationState, ServiceResult } from './gateway';

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
  // Present only when the service could read the reservations of the departure (contract 0.7.0).
  travelersServed?: number;
  reservations?: {
    reservationId: string;
    customer: string;
    service?: string;
    travelers: number;
    state: ReservationState;
    result?: ServiceResult;
    travelersServed?: number;
    noShow?: boolean;
    cause?: string;
  }[];
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
    reservations: d.reservations ?? [],
    reservationsUnavailable: d.reservations === undefined,
    ...(d.travelersServed === undefined ? {} : { travelersServed: d.travelersServed }),
    novelties: [],
    history: [],
  };
}

export function createExecutionGateway(apiClient: ApiClient): DepartureExecutionGateway {
  return {
    connected: true,
    panels: ['departure', 'vehicles', 'start', 'reservations', 'finish', 'regularize'],
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
    async registerServices({ code, entries, key }) {
      return record(`${DEPARTURES}/${encodeURIComponent(code)}/services`, key, () => ({
        services: entries.map((e) => ({
          reservationId: e.reservationId,
          result: e.result,
          travelersServed: e.travelersServed,
          ...(e.noShow ? { noShow: true } : {}),
          ...(e.cause.trim() ? { cause: e.cause.trim() } : {}),
        })),
      }));
    },
    registerNovelty: notAvailable,
    async registerRegularization({ code, result, startedAt, finishedAt, earlyStartMotive, interruption, key }) {
      // The service cannot cancel a departure yet (HU-OPS-006): "not done" is never sent. The fields that do not apply are left out.
      if (result === 'NOT_DONE') return notAvailable();
      return record(`${DEPARTURES}/${encodeURIComponent(code)}/regularization`, key, () => ({
        result,
        actualStart: toInstant(startedAt, TENANT_TIME_ZONE),
        actualEnd: toInstant(finishedAt, TENANT_TIME_ZONE),
        ...(result === 'INTERRUPTED' ? { interruption: interruption.trim() } : {}),
        ...(earlyStartMotive.trim() ? { earlyStartReason: earlyStartMotive.trim() } : {}),
      }));
    },
  };

  // The body is built inside the guard: a wall clock that cannot be converted is a failure that is told, and nothing is sent.
  async function record(path: string, key: string, body: () => Record<string, unknown>): Promise<Departure> {
    try {
      const answer = await apiClient.request<DepartureAnswer>(path, { method: 'POST', headers: { 'Idempotency-Key': key }, body: body() });
      // Only the services answer the reservations: after any other recording the departure is read again, so the page keeps them.
      if (answer.reservations === undefined) {
        const fresh = await apiClient.request<DepartureAnswer>(`${DEPARTURES}/${encodeURIComponent(answer.code)}`).catch(() => undefined);
        return asDeparture(fresh ?? answer);
      }
      return asDeparture(answer);
    } catch (error) {
      throw translate(error);
    }
  }
}
