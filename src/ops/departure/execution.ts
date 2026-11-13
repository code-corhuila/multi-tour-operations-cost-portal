import type { ApiClient } from '../../contract';
import { Failed, Refused } from '../departures/model';
import { readVehicles, translate } from '../departures/scheduling';
import { TENANT_TIME_ZONE, fromInstant, toInstant } from '../departures/time';
import type { CancellationCause, CostLine, CostSheet, Departure, DepartureExecutionGateway, DepartureStatus, ReservationState, ServiceResult } from './gateway';

// The adapter of the page of a departure to the operations-cost service (spec 008 plan D-02). Only what the service offers is
// served: reading a departure, adding vehicles to it, the start, the end or interruption, the services, the regularization, the costs, the
// cancellation and the personal emergency (not the ordinary novelty). What it does not offer yet is refused
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
  cancellation?: { cancelledAt: string; cancelledBy?: string; cause: CancellationCause; reason?: string };
  // Since contract 0.12.0 (HU-OPS-008): the personal emergencies of the departure.
  novelties?: { at: string; type: 'NOVELTY' | 'PERSONAL_EMERGENCY'; detail: string; who: string; reservationId: string; affected?: number }[];
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
    extraordinaryCancellation?: { justification: string; recordedBy: string; recordedAt: string };
  }[];
}

interface CostSheetAnswer {
  data: CostLine[];
  totalCents: number;
  travelersServed: number;
  baseCostCents?: number;
}

// What the saga cancel-departure answers; only what the page decides on (its workflow contract).
interface SagaAnswer {
  status: 'RUNNING' | 'COMPLETED' | 'COMPENSATED' | 'FAILED';
  failedStep?: string;
  reason?: string;
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
    reservations: (d.reservations ?? []).map(({ extraordinaryCancellation, ...reservation }) => ({
      ...reservation,
      ...(extraordinaryCancellation
        ? { extraordinaryCancellation: { ...extraordinaryCancellation, recordedAt: fromInstant(extraordinaryCancellation.recordedAt, TENANT_TIME_ZONE) } }
        : {}),
    })),
    reservationsUnavailable: d.reservations === undefined,
    ...(d.travelersServed === undefined ? {} : { travelersServed: d.travelersServed }),
    ...(d.cancellation
      ? {
          cancellation: {
            at: fromInstant(d.cancellation.cancelledAt, TENANT_TIME_ZONE),
            ...(d.cancellation.cancelledBy ? { by: d.cancellation.cancelledBy } : {}),
            cause: d.cancellation.cause,
            ...(d.cancellation.reason ? { reason: d.cancellation.reason } : {}),
          },
        }
      : {}),
    novelties: (d.novelties ?? []).map((n) => ({
      at: fromInstant(n.at, TENANT_TIME_ZONE),
      type: n.type === 'PERSONAL_EMERGENCY' ? 'Emergencia personal' : 'Novedad',
      detail: n.detail,
      who: n.who,
      reservationId: n.reservationId,
      ...(n.affected === undefined ? {} : { affected: n.affected }),
    })),
    history: [],
  };
}

export function createExecutionGateway(apiClient: ApiClient): DepartureExecutionGateway {
  return {
    connected: true,
    panels: ['departure', 'vehicles', 'start', 'reservations', 'finish', 'regularize', 'costs', 'cancel', 'cancellation'],
    listVehicles: () => readVehicles(apiClient),
    async addVehicles({ code, vehicleIds, key }) {
      return record(`${DEPARTURES}/${encodeURIComponent(code)}/vehicles`, key, () => ({ vehicleIds }));
    },
    async getCosts(code): Promise<CostSheet> {
      try {
        const sheet = await apiClient.request<CostSheetAnswer>(`${DEPARTURES}/${encodeURIComponent(code)}/costs`);
        // an answer that is not a sheet is a failure that is told, never a screen that breaks
        if (!Array.isArray(sheet?.data) || !Number.isFinite(sheet.totalCents) || !Number.isFinite(sheet.travelersServed)) throw new Error('NOT_A_SHEET');
        return {
          lines: sheet.data,
          totalCents: sheet.totalCents,
          travelersServed: sheet.travelersServed,
          ...(sheet.baseCostCents === undefined ? {} : { baseCostCents: sheet.baseCostCents }),
        };
      } catch (error) {
        throw translate(error);
      }
    },
    async recordCost({ code, concept, mode, amountCents, justification, key }): Promise<CostLine> {
      try {
        return await apiClient.request<CostLine>(`${DEPARTURES}/${encodeURIComponent(code)}/costs`, {
          method: 'POST',
          headers: { 'Idempotency-Key': key },
          // a calculated cost carries neither an amount nor a justification: the service calculates it
          body:
            mode === 'CALCULATED'
              ? { concept: concept.trim(), mode }
              : { concept: concept.trim(), mode, amountCents, ...(justification.trim() ? { justification: justification.trim() } : {}) },
        });
      } catch (error) {
        throw translate(error);
      }
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
    async registerNovelty({ code, reservationId, detail, emergency, affected, key }) {
      // The service offers only the personal emergency (HU-OPS-008): the ordinary novelty is refused here and never sent.
      if (!emergency) return notAvailable();
      return record(`${DEPARTURES}/${encodeURIComponent(code)}/novelties`, key, () => ({
        reservationId,
        type: 'PERSONAL_EMERGENCY',
        detail: detail.trim(),
        affected,
      }));
    },
    async recordExtraordinaryCancellation({ code, reservationId, justification, key }) {
      return record(`${DEPARTURES}/${encodeURIComponent(code)}/reservations/${encodeURIComponent(reservationId)}/extraordinary-cancellation`, key, () => ({
        justification: justification.trim(),
      }));
    },
    async cancelDeparture({ code, key }) {
      // The saga may still be running when it answers: the departure is read again and says what it is now (spec 013 D-02). A saga that
      // compensated or that failed before the departure was cancelled changed nothing, and it is told, not shown as done.
      try {
        const saga = await apiClient.request<SagaAnswer>('/api/v1/sagas/cancel-departure', {
          method: 'POST',
          headers: { 'Idempotency-Key': key },
          body: { departureCode: code },
        });
        if (saga?.status === 'COMPENSATED') throw saga.reason === 'DEPARTURE_REFUSED' ? new Refused('INVALID_STATUS_TRANSITION') : new Failed();
        if (saga?.status === 'FAILED' && saga.failedStep === 'CANCEL_DEPARTURE') throw new Failed();
        return asDeparture(await apiClient.request<DepartureAnswer>(`${DEPARTURES}/${encodeURIComponent(code)}`));
      } catch (error) {
        throw error instanceof Refused || error instanceof Failed ? error : translate(error);
      }
    },
    async registerRegularization({ code, result, startedAt, finishedAt, earlyStartMotive, interruption, notDoneCause, key }) {
      // A departure that was not carried out sends its cause and no hours; the fields that do not apply are left out.
      if (result === 'NOT_DONE') {
        return record(`${DEPARTURES}/${encodeURIComponent(code)}/regularization`, key, () => ({ result: 'NOT_CARRIED_OUT', notCarriedOutCause: notDoneCause.trim() }));
      }
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
