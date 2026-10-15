import { useCallback, useState, type FormEvent } from 'react';
import { effectiveCapacity } from './capacity';
import type { DepartureRow, DepartureStatus, DeparturesGateway, Tour, Vehicle } from './model';
import { useAsync } from '../useAsync';

export interface DeparturesPageProps {
  gateway: DeparturesGateway;
  // The Administrator schedules, edits and cancels (RN-OPS-PT-58); who manages executions opens the page of spec 004.
  canSchedule: boolean;
  canManage: boolean;
  onOpen: (code: string) => void;
  // Without a handler the control is not drawn: the form arrives in its own task.
  onSchedule?: () => void;
  onEdit?: (code: string) => void;
  // The line of the form that just returned (spec 005 AC6).
  notice?: string;
}

interface Data {
  departures: DepartureRow[];
  tours: Tour[];
  vehicles: Vehicle[];
}

const STATUS: Record<DepartureStatus, { label: string; className: string }> = {
  SCHEDULED: { label: 'Programada', className: 'operator-status is-pending' },
  IN_EXECUTION: { label: 'En ejecución', className: 'operator-status is-active' },
  PENDING_REGULARIZATION: { label: 'Pendiente de regularizar', className: 'operator-status is-inactive' },
  FINISHED: { label: 'Finalizada', className: 'operator-status is-confirmed' },
  CANCELLED: { label: 'Cancelada', className: 'operator-status is-inactive' },
};

type Show = 'all' | DepartureStatus | 'alert';
const FILTERS: { value: Show; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'SCHEDULED', label: 'Programada' },
  { value: 'IN_EXECUTION', label: 'En ejecución' },
  { value: 'FINISHED', label: 'Finalizada' },
  { value: 'CANCELLED', label: 'Cancelada' },
  { value: 'alert', label: 'Con alerta o pendientes de regularización' },
];

// A departure is flagged by its data, never by the clock: nothing is closed by time (RN-OPS-PT-59).
const isAlert = (d: DepartureRow) => d.status === 'PENDING_REGULARIZATION';
const shown = (d: DepartureRow, show: Show) => (show === 'all' ? true : show === 'alert' ? isAlert(d) : d.status === show);
const when = (value: string) => value.replace('T', ' ');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function load(gateway: DeparturesGateway): Promise<Data> {
  const [departures, tours, vehicles] = await Promise.all([gateway.listDepartures(), gateway.listTours(), gateway.listVehicles()]);
  return { departures, tours, vehicles };
}

// Page of the Mockup admin-salidas.html (spec 005 PT-10) over the test data of the port.
export function DeparturesPage({ gateway, canSchedule, canManage, onOpen, onSchedule, onEdit, notice }: DeparturesPageProps) {
  // A stable loader: useAsync reloads whenever the function changes.
  const loadAll = useCallback(() => load(gateway), [gateway]);
  const { state, retry, set } = useAsync(loadAll);
  const [show, setShow] = useState<Show>('all');
  const [cancelling, setCancelling] = useState<string>();
  const [cause, setCause] = useState('');
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | undefined>(notice);

  const data = state.kind === 'data' ? state.data : undefined;
  const tourOf = (d: DepartureRow) => data?.tours.find((t) => t.id === d.tourId);
  const vehiclesOf = (d: DepartureRow) => (data?.vehicles ?? []).filter((v) => d.vehicleIds.includes(v.id));
  const capacityOf = (d: DepartureRow) => {
    const tour = tourOf(d);
    return tour ? effectiveCapacity(tour.capacity, vehiclesOf(d).map((v) => v.capacity), tour.needsTransport) : 0;
  };

  async function confirmCancel(event: FormEvent, current: DepartureRow) {
    event.preventDefault();
    if (!cause.trim()) {
      setError('Ingresa la causal de la cancelación.');
      return;
    }
    setError(undefined);
    setSending(true);
    try {
      // One key per departure: cancelling the same departure again answers the same result.
      const done = await gateway.cancelDeparture({ code: current.code, cause: cause.trim(), key: `cancel-${current.code}` });
      if (data) set({ ...data, departures: data.departures.map((d) => (d.code === done.departure.code ? done.departure : d)) });
      setResult(`Salida ${current.code} cancelada. ${plural(done.reservationsToReschedule, 'reserva abre', 'reservas abren')} su reprogramación.`);
      setCancelling(undefined);
      setCause('');
    } catch {
      setError('No pudimos cancelar la salida. Tus datos siguen aquí.');
    } finally {
      setSending(false);
    }
  }

  const cancelTarget = data?.departures.find((d) => d.code === cancelling);
  const alerts = (data?.departures ?? []).filter(isAlert);
  const rows = (data?.departures ?? []).filter((d) => shown(d, show));

  return (
    <div className="operator-content">
      <header className="operator-topbar">
        <div>
          <p className="operator-eyebrow">Operación</p>
          <h1>Salidas</h1>
        </div>
        {canSchedule && onSchedule && (
          <button type="button" className="operator-outline" onClick={onSchedule}>
            Programar salida
          </button>
        )}
      </header>
      <section className="operator-hero operator-hero-compact">
        <p>
          Una salida es la ejecución programada de un tour con fecha, hora de inicio y hora de finalización estimada. Su capacidad efectiva
          y sus cupos apartados se leen aquí.
        </p>
        <p className="operator-eyebrow">Datos de prueba</p>
      </section>

      {state.kind === 'loading' && <p role="status">Cargando…</p>}
      {state.kind === 'error' && (
        <div role="alert">
          <p className="operator-copy">No pudimos cargar las salidas.</p>
          <button type="button" className="operator-outline" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}

      {data && alerts.length > 0 && (
        <section className="operator-panel" aria-labelledby="dep-alerts">
          <div className="operator-panel-head">
            <div>
              <p className="operator-eyebrow">Alertas de salidas</p>
              <h2 id="dep-alerts">Salidas sin cierre operativo</h2>
            </div>
            <span className="operator-status is-inactive">{plural(alerts.length, 'alerta', 'alertas')}</span>
          </div>
          <p className="operator-copy">Pasaron su hora estimada de finalización sin registro. No se cierran por tiempo: se regularizan.</p>
          <ul className="operator-detail-list">
            {alerts.map((d) => (
              <li key={d.code}>
                {d.code} · {tourOf(d)?.name} · inicio {when(d.start)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {cancelTarget && (
        <section className="operator-panel" aria-labelledby="dep-cancel">
          <h2 id="dep-cancel">
            Cancelar {cancelTarget.code} · {tourOf(cancelTarget)?.name} · {cancelTarget.start.slice(0, 10)} ({plural(cancelTarget.booked, 'cupo apartado', 'cupos apartados')})
          </h2>
          <form onSubmit={(e) => confirmCancel(e, cancelTarget)} noValidate>
            <label htmlFor="dep-cause">Causal de la cancelación (obligatoria)</label>
            <textarea id="dep-cause" rows={3} value={cause} onChange={(e) => setCause(e.target.value)} aria-describedby={error ? 'dep-cause-error' : undefined} aria-invalid={error ? true : undefined} />
            <p id="dep-cause-error" className="operator-error" role="alert">
              {error}
            </p>
            <div className="operator-form-actions">
              <button type="button" className="operator-outline" onClick={() => { setCancelling(undefined); setError(undefined); setCause(''); }}>
                No cancelar
              </button>
              <button type="submit" className="operator-primary" disabled={sending}>
                Confirmar cancelación
              </button>
            </div>
          </form>
        </section>
      )}
      {result && <p className="operator-form-feedback" role="status">{result}</p>}

      {data && (
        <section className="operator-panel" aria-labelledby="dep-agenda">
          <div className="operator-panel-head">
            <div>
              <p className="operator-eyebrow">Agenda de salidas</p>
              <h2 id="dep-agenda">Estados, capacidad y cupos</h2>
            </div>
            <label className="operator-filter">
              Mostrar
              <select value={show} onChange={(e) => setShow(e.target.value as Show)}>
                {FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {rows.length === 0 ? (
            <p className="operator-copy">No hay salidas con este filtro.</p>
          ) : (
            <div className="operator-table-wrap">
              <table className="operator-table">
                <thead>
                  <tr>
                    <th>Salida</th>
                    <th>Inicio programado</th>
                    <th>Fin estimado</th>
                    <th>Vehículos</th>
                    <th>Capacidad efectiva</th>
                    <th>Cupos apartados</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.code}>
                      <td>
                        <strong>{d.code}</strong>
                        <br />
                        <small>{tourOf(d)?.name}</small>
                      </td>
                      <td>{when(d.start)}</td>
                      <td>{when(d.end)}</td>
                      <td>{vehiclesOf(d).map((v) => v.name).join(', ') || 'Sin vehículos'}</td>
                      <td>{capacityOf(d)}</td>
                      <td>{d.booked}</td>
                      <td>
                        <span className={STATUS[d.status].className}>{STATUS[d.status].label}</span>
                      </td>
                      <td>
                        {d.status === 'SCHEDULED' && canSchedule && onEdit && (
                          <button type="button" className="operator-outline" onClick={() => onEdit(d.code)}>
                            Editar
                          </button>
                        )}
                        {d.status === 'SCHEDULED' && canSchedule && (
                          <button type="button" className="operator-outline" onClick={() => { setCancelling(d.code); setResult(undefined); setError(undefined); }}>
                            Cancelar salida
                          </button>
                        )}
                        {canManage && (d.status === 'SCHEDULED' || d.status === 'IN_EXECUTION' || d.status === 'PENDING_REGULARIZATION') && (
                          <button type="button" className="operator-outline" onClick={() => onOpen(d.code)}>
                            {d.status === 'SCHEDULED' ? 'Registrar ejecución' : d.status === 'IN_EXECUTION' ? 'Gestionar ejecución' : 'Regularizar'}
                          </button>
                        )}
                        {(d.status === 'FINISHED' || d.status === 'CANCELLED') && (
                          <button type="button" className="operator-outline" onClick={() => onOpen(d.code)}>
                            Ver registro
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="operator-copy">Capacidad efectiva = el menor entre el cupo del tour y la capacidad acumulada de los vehículos asignados.</p>
        </section>
      )}
    </div>
  );
}
