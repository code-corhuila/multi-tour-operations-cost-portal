import type { ApiClient } from '../../contract';
import {
  FieldError,
  Failed,
  Forbidden,
  Refused,
  Unavailable,
  type DepartureRow,
  type DeparturesGateway,
  type ScheduleInput,
  type Tour,
  type Vehicle,
  type VehicleInput,
} from './model';
import { TENANT_TIME_ZONE, fromInstant, toInstant } from './time';

interface Failure {
  status?: number;
  code?: string;
  traceId?: string;
  details?: { field?: string; message?: string }[];
}

export function translate(error: unknown): Error {
  const f: Failure = typeof error === 'object' && error !== null ? error : {};
  if (f.traceId) console.warn(`operations-cost portal: request failed (${f.status ?? f.code}), traceId ${f.traceId}`);
  const named = (f.details ?? []).filter((d): d is { field: string; message: string } => !!d.field && !!d.message);
  if (f.status === 400) return new FieldError(named);
  if (f.status === 422) return new Refused(f.code ?? 'BUSINESS_RULE_VIOLATION');
  if (f.status === 403) return new Forbidden();
  if (f.status === 503 || f.code === 'TIMEOUT' || f.code === 'NETWORK_ERROR') return new Unavailable();
  return new Failed();
}

interface CatalogPage {
  data: { serviceId: string; commercialName: string; configuredCapacity: number; transportRequired: boolean }[];
  meta: { totalPages: number };
}

interface VehiclePage {
  data: { vehicleId: string; name: string; capacity: number }[];
  meta: { totalPages: number };
}

interface DeparturePage {
  data: {
    code: string;
    serviceId: string;
    status: DepartureRow['status'];
    pendingRegularization: boolean;
    startAlert: boolean;
    scheduledStart: string;
    scheduledEnd: string;
    capacity: number;
    booked: number;
    vehicles: { vehicleId: string }[];
  }[];
  meta: { totalPages: number };
}

const DEPARTURES = '/api/v1/operations-cost/departures';
const asVehicle = (v: { vehicleId: string; name: string; capacity: number }): Vehicle => ({ id: v.vehicleId, name: v.name, capacity: v.capacity });
const VEHICLES = '/api/v1/operations-cost/vehicles';
const LOCALIZATION = '/api/v1/identity-audit/tenant/localization';

// shortcut: past 5 pages (500 tours) the list is cut without a signal; raise it if a tenant ever has that many.
const MAX_PAGES = 5;
const CATALOG = '/api/v1/commercial-reservation/catalog/services?serviceType=TOUR&catalogStatus=ACTIVE&limit=100';

/** The vehicles of the tenant, page by page (the same cut as the other lists). */
export async function readVehicles(apiClient: ApiClient): Promise<Vehicle[]> {
  const vehicles: Vehicle[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const answer = await apiClient.request<VehiclePage>(`${VEHICLES}?limit=100&page=${page}`);
      vehicles.push(...answer.data.map(asVehicle));
      if (page >= answer.meta.totalPages) break;
    }
  } catch (error) {
    throw translate(error);
  }
  return vehicles;
}

/** `rest` must be a plain object of arrow functions (it is spread). Scheduling and the tours go to the service through the client of the container; the rest stays on `rest` (D-01). */
export function createDeparturesGateway(apiClient: ApiClient, rest: DeparturesGateway): DeparturesGateway {
  return {
    ...rest,
    connected: true,
    supportsVehicles: true,
    listVehicles: () => readVehicles(apiClient),
    async tenantTimeZone() {
      let answer: { timeZone?: string };
      try {
        answer = await apiClient.request<{ timeZone?: string }>(LOCALIZATION);
      } catch (error) {
        throw translate(error);
      }
      // an answer without a zone is a failure: a guessed zone would schedule at another hour
      if (!answer.timeZone) throw new Failed();
      return answer.timeZone;
    },
    async createVehicle({ name, capacity, key }: VehicleInput): Promise<Vehicle> {
      try {
        const answer = await apiClient.request<{ vehicleId: string; name: string; capacity: number }>(VEHICLES, {
          method: 'POST',
          headers: { 'Idempotency-Key': key },
          body: { name, capacity },
        });
        return asVehicle(answer);
      } catch (error) {
        throw translate(error);
      }
    },
    async listDepartures() {
      const rows: DepartureRow[] = [];
      try {
        for (let page = 1; page <= MAX_PAGES; page++) {
          const answer = await apiClient.request<DeparturePage>(`${DEPARTURES}?limit=100&page=${page}`);
          for (const d of answer.data) {
            rows.push({
              code: d.code,
              tourId: d.serviceId,
              start: fromInstant(d.scheduledStart, TENANT_TIME_ZONE),
              end: fromInstant(d.scheduledEnd, TENANT_TIME_ZONE),
              vehicleIds: d.vehicles.map((v) => v.vehicleId),
              booked: d.booked,
              reservations: 0,
              status: d.status,
              pendingRegularization: d.pendingRegularization,
              startAlert: d.startAlert,
              capacity: d.capacity,
            });
          }
          if (page >= answer.meta.totalPages) break;
        }
      } catch (error) {
        throw translate(error);
      }
      return rows;
    },
    async listTours() {
      const tours: Tour[] = [];
      try {
        for (let page = 1; page <= MAX_PAGES; page++) {
          const answer = await apiClient.request<CatalogPage>(`${CATALOG}&page=${page}`);
          for (const s of answer.data)
            tours.push({ id: s.serviceId, name: s.commercialName, capacity: s.configuredCapacity, needsTransport: s.transportRequired });
          if (page >= answer.meta.totalPages) break;
        }
      } catch (error) {
        throw translate(error);
      }
      return tours;
    },
    async scheduleDeparture({ tourId, start, end, vehicleIds, key, timeZone }: ScheduleInput): Promise<DepartureRow> {
      if (!timeZone) throw new Failed();
      try {
        const answer = await apiClient.request<{ code: string; status: DepartureRow['status']; booked: number; vehicles?: { vehicleId: string }[] }>(
          DEPARTURES,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': key },
            body: {
              serviceId: tourId,
              scheduledStart: toInstant(start, timeZone),
              scheduledEnd: toInstant(end, timeZone),
              timeZone,
              // only a tour that requires transport takes vehicles; the field is left out when there is none
              ...(vehicleIds.length > 0 ? { vehicleIds } : {}),
            },
          },
        );
        const assigned = (answer.vehicles ?? []).map((v) => v.vehicleId);
        return { code: answer.code, tourId, start, end, vehicleIds: assigned, booked: answer.booked, reservations: 0, status: answer.status };
      } catch (error) {
        throw translate(error);
      }
    },
  };
}
