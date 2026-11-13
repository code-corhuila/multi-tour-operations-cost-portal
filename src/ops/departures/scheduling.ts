import type { ApiClient } from '../../contract';
import { FieldError, Failed, Forbidden, Refused, Unavailable, type DepartureRow, type DeparturesGateway, type ScheduleInput, type Tour } from './model';
import { TENANT_TIME_ZONE, toInstant } from './time';

interface Failure {
  status?: number;
  code?: string;
  traceId?: string;
  details?: { field?: string; message?: string }[];
}

function translate(error: unknown): Error {
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

// shortcut: past 5 pages (500 tours) the list is cut without a signal; raise it if a tenant ever has that many.
const MAX_PAGES = 5;
const CATALOG = '/api/v1/commercial-reservation/catalog/services?serviceType=TOUR&catalogStatus=ACTIVE&limit=100';

/** `rest` must be a plain object of arrow functions (it is spread). Scheduling and the tours go to the service through the client of the container; the rest stays on `rest` (D-01). */
export function createDeparturesGateway(apiClient: ApiClient, rest: DeparturesGateway): DeparturesGateway {
  return {
    ...rest,
    supportsVehicles: false,
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
    async scheduleDeparture({ tourId, start, end, key }: ScheduleInput): Promise<DepartureRow> {
      try {
        const answer = await apiClient.request<{ code: string; status: DepartureRow['status']; booked: number }>('/api/v1/operations-cost/departures', {
          method: 'POST',
          headers: { 'Idempotency-Key': key },
          body: {
            serviceId: tourId,
            scheduledStart: toInstant(start, TENANT_TIME_ZONE),
            scheduledEnd: toInstant(end, TENANT_TIME_ZONE),
            timeZone: TENANT_TIME_ZONE,
          },
        });
        return { code: answer.code, tourId, start, end, vehicleIds: [], booked: answer.booked, reservations: 0, status: answer.status };
      } catch (error) {
        throw translate(error);
      }
    },
  };
}
