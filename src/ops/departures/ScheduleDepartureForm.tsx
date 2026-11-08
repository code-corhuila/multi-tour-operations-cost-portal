import { useCallback, useRef, useState, type FormEvent } from 'react';
import { effectiveCapacity, overlaps } from './capacity';
import { FieldError, Forbidden, Refused, Unavailable, type DeparturesGateway } from './model';
import { useAsync } from '../useAsync';
import { interval, validateDeparture } from './validateDeparture';

export interface ScheduleDepartureFormProps {
  gateway: DeparturesGateway;
  // Set to edit a SCHEDULED departure: the same form, filled (spec 005 plan D-04).
  editCode?: string;
  onBack: () => void;
  // The line of the result the list shows when the form returns.
  onSaved: (line: string) => void;
}

// The fields of the request, as the person knows them. The text is ours: the service speaks English to developers.
const FIELD: Record<string, { id: 'tour' | 'start' | 'end'; message: string }> = {
  serviceId: { id: 'tour', message: 'El tour no es válido.' },
  scheduledStart: { id: 'start', message: 'La hora de inicio no es válida.' },
  scheduledEnd: { id: 'end', message: 'La hora de finalización no es válida o es anterior al inicio.' },
};

function failure(error: unknown): { general: string[]; fields: Partial<Record<'tour' | 'start' | 'end', string>> } {
  if (error instanceof FieldError) {
    const fields: Partial<Record<'tour' | 'start' | 'end', string>> = {};
    for (const { field } of error.fields) if (FIELD[field]) fields[FIELD[field].id] = FIELD[field].message;
    return Object.keys(fields).length > 0 ? { general: [], fields } : { general: ['Revisa los datos de la salida.'], fields };
  }
  if (error instanceof Refused) {
    return {
      general: [
        error.code === 'INVALID_STATUS_TRANSITION'
          ? 'La salida ya no está en un estado que permita este cambio.'
          : 'El servicio no aceptó la salida: el tour no está disponible, la hora de inicio ya pasó o un vehículo ya está en otra salida a esa hora.',
      ],
      fields: {},
    };
  }
  if (error instanceof Forbidden) return { general: ['No tienes permiso para programar salidas.'], fields: {} };
  if (error instanceof Unavailable) return { general: ['El servicio no responde. Tus datos siguen aquí; intenta de nuevo.'], fields: {} };
  return { general: ['No pudimos guardar la salida. Tus datos siguen aquí.'], fields: {} };
}

const FieldMessage = ({ id, text }: { id: string; text?: string }) =>
  text ? (
    <p id={`sch-${id}-error`} role="alert" className="operator-error" style={{ gridColumn: '1 / -1' }}>
      {text}
    </p>
  ) : null;

// Form of the Mockup admin-programar-salida.html (spec 005 PT-11) over the port: the test data, or the service for a new departure (spec 006).
export function ScheduleDepartureForm({ gateway, editCode, onBack, onSaved }: ScheduleDepartureFormProps) {
  const load = useCallback(async () => {
    const [tours, vehicles, departures] = await Promise.all([gateway.listTours(), gateway.listVehicles(), gateway.listDepartures()]);
    return { tours, vehicles, departures };
  }, [gateway]);
  const { state, retry } = useAsync(load);
  const [form, setForm] = useState<{ tourId: string; date: string; start: string; end: string; vehicleIds: string[] }>();
  const [messages, setMessages] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'tour' | 'start' | 'end', string>>>({});
  const [sending, setSending] = useState(false);
  // One key per attempt: a retry of the same data after a failure reuses it; a new save, even of data seen before, gets another.
  const attempt = useRef<{ signature: string; key: string } | undefined>(undefined);

  if (state.kind === 'loading') return <p role="status">Cargando…</p>;
  if (state.kind === 'error') {
    return (
      <div role="alert">
        <p className="operator-copy">No pudimos cargar los datos de la salida.</p>
        <button type="button" className="operator-outline" onClick={retry}>
          Reintentar
        </button>
      </div>
    );
  }

  const { tours, vehicles, departures } = state.data;
  const withVehicles = gateway.supportsVehicles !== false;
  const connected = gateway.connected === true;
  if (tours.length === 0) {
    return (
      <div className="operator-content">
        <p className="operator-copy">El catálogo no tiene tours activos para programar.</p>
        <button type="button" className="operator-outline" onClick={onBack}>
          Volver a salidas
        </button>
      </div>
    );
  }
  const editing = departures.find((d) => d.code === editCode);
  // First render of the form: filled from the departure being edited, or empty.
  const current =
    form ??
    (editing
      ? {
          tourId: editing.tourId,
          date: editing.start.slice(0, 10),
          start: editing.start.slice(11),
          end: editing.end.slice(11),
          vehicleIds: [...editing.vehicleIds],
        }
      : { tourId: '', date: '', start: '', end: '', vehicleIds: [] as string[] });
  const set = (patch: Partial<typeof current>) => setForm({ ...current, ...patch });
  // A departure with reservations keeps its date, hours and tour (RN-OPS-PT-56).
  const locked = !!editing && editing.reservations > 0;

  const tour = tours.find((t) => t.id === current.tourId);
  // With the service, only a tour that requires transport takes vehicles (RN-OPS-API-34); with the test data every tour does.
  const takesVehicles = withVehicles && (!connected || !!tour?.needsTransport);
  const chosen = takesVehicles ? vehicles.filter((v) => current.vehicleIds.includes(v.id)) : [];
  const hasInterval = !!current.date && !!current.start && !!current.end && current.end > current.start;
  const busy = (vehicleId: string) =>
    hasInterval
      ? departures.find((d) => d.code !== editCode && d.status !== 'CANCELLED' && d.vehicleIds.includes(vehicleId) && overlaps(interval(current), d))
      : undefined;
  const capacity =
    tour && !takesVehicles && connected
      ? tour.capacity
      : tour
        ? effectiveCapacity(
            tour.capacity,
            chosen.map((v) => v.capacity),
            tour.needsTransport,
          )
        : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateDeparture({ ...current, editingCode: editCode }, { tours, vehicles, departures, withVehicles });
    setMessages(found);
    setFieldErrors({});
    if (found.length > 0 || !tour) return;
    setSending(true);
    try {
      const { start, end } = interval(current);
      const vehicleIds = chosen.map((v) => v.id);
      const signature = `${editCode ?? 'new'}|${current.tourId}|${start}|${end}|${[...vehicleIds].sort().join(',')}`;
      if (attempt.current?.signature !== signature) attempt.current = { signature, key: `schedule:${crypto.randomUUID()}` };
      const key = attempt.current.key;
      const saved = editCode
        ? await gateway.updateDeparture({ code: editCode, tourId: current.tourId, start, end, vehicleIds: current.vehicleIds, key })
        : await gateway.scheduleDeparture({ tourId: current.tourId, start, end, vehicleIds, key });
      const verb = editCode ? 'actualizada' : 'programada';
      const tail = editCode || connected ? '' : ' Ya se puede reservar.';
      const note = connected ? ' La lista muestra datos de prueba hasta que se conecte.' : '';
      attempt.current = undefined;
      onSaved(`Salida ${saved.code} ${verb} (${tour.name}, ${start.replace('T', ' ')}). Capacidad efectiva: ${capacity}.${tail}${note}`);
    } catch (error) {
      const { general, fields } = editCode ? { general: ['No pudimos guardar la salida. Tus datos siguen aquí.'], fields: {} } : failure(error);
      setMessages(general);
      setFieldErrors(fields);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="operator-content">
      <header className="operator-topbar">
        <div>
          <p className="operator-eyebrow">RF-020 · Solo Administrador del tenant</p>
          <h1>{editCode ? `Editar salida ${editCode}` : 'Programar salida'}</h1>
        </div>
        <button type="button" className="operator-outline" onClick={onBack}>
          Volver a salidas
        </button>
      </header>
      {!connected && <p className="operator-eyebrow">Datos de prueba</p>}

      <form onSubmit={submit} noValidate>
        <section className="operator-panel" aria-labelledby="sch-01">
          <p className="operator-eyebrow">01 · Programación</p>
          <h2 id="sch-01">Datos de la salida</h2>
          {locked && (
            <p className="operator-access-note">
              {editCode} tiene reservas: para cambiar fecha, horas o tour, cancélala y programa una nueva. Los vehículos sí se pueden cambiar.
            </p>
          )}
          <div className="operator-form-grid">
            <label htmlFor="sch-tour">Tour</label>
            <select
              id="sch-tour"
              aria-invalid={!!fieldErrors.tour}
              aria-describedby={fieldErrors.tour ? 'sch-tour-error' : undefined}
              value={current.tourId}
              disabled={locked}
              onChange={(e) => set({ tourId: e.target.value })}
            >
              <option value="">Selecciona un tour</option>
              {tours.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <FieldMessage id="tour" text={fieldErrors.tour} />
            <label htmlFor="sch-date">Fecha</label>
            <input id="sch-date" type="date" value={current.date} disabled={locked} onChange={(e) => set({ date: e.target.value })} />
            <label htmlFor="sch-start">Hora de inicio programada</label>
            <input
              id="sch-start"
              type="time"
              aria-invalid={!!fieldErrors.start}
              aria-describedby={fieldErrors.start ? 'sch-start-error' : undefined}
              value={current.start}
              disabled={locked}
              onChange={(e) => set({ start: e.target.value })}
            />
            <FieldMessage id="start" text={fieldErrors.start} />
            <label htmlFor="sch-end">Hora de finalización estimada</label>
            <input
              id="sch-end"
              type="time"
              aria-invalid={!!fieldErrors.end}
              aria-describedby={fieldErrors.end ? 'sch-end-error' : undefined}
              value={current.end}
              disabled={locked}
              onChange={(e) => set({ end: e.target.value })}
            />
            <FieldMessage id="end" text={fieldErrors.end} />
            <label htmlFor="sch-quota">Cupo del tour (viajeros)</label>
            <input id="sch-quota" type="number" value={tour ? tour.capacity : ''} readOnly />
            <label htmlFor="sch-state">Estado</label>
            <input id="sch-state" type="text" value="Programada" readOnly />
          </div>
        </section>

        {withVehicles && connected && !takesVehicles ? (
          <section className="operator-panel" aria-labelledby="sch-02">
            <p className="operator-eyebrow">02 · Vehículos asignados</p>
            <h2 id="sch-02">Vehículos</h2>
            <p className="operator-copy">
              {tour ? 'Este tour no usa transporte: no necesita vehículos.' : 'Selecciona un tour para ver si necesita vehículos.'}
            </p>
            <p className="operator-copy" aria-live="polite">
              {tour ? `Capacidad de la salida: ${tour.capacity} viajeros (la del tour).` : 'Selecciona un tour para ver la capacidad.'}
            </p>
          </section>
        ) : withVehicles ? (
          <section className="operator-panel" aria-labelledby="sch-02">
            <p className="operator-eyebrow">02 · Vehículos asignados</p>
            <h2 id="sch-02">Vehículos</h2>
            <p className="operator-copy">Un vehículo no puede estar en dos salidas cuyos horarios se cruzan.</p>
            {vehicles.map((v) => {
              const other = busy(v.id);
              return (
                <label key={v.id} className="operator-copy">
                  <input
                    type="checkbox"
                    checked={current.vehicleIds.includes(v.id)}
                    onChange={(e) => set({ vehicleIds: e.target.checked ? [...current.vehicleIds, v.id] : current.vehicleIds.filter((id) => id !== v.id) })}
                  />{' '}
                  {v.name} · {v.capacity} viajeros{other ? ` · ocupado en ${other.code}` : ''}
                </label>
              );
            })}
            <p className="operator-copy" aria-live="polite">
              {tour && chosen.length > 0
                ? `Capacidad efectiva de la salida: ${capacity} viajeros = menor entre el cupo del tour (${tour.capacity}) y la capacidad acumulada de los vehículos (${chosen.reduce((sum, v) => sum + v.capacity, 0)})`
                : 'Selecciona un tour y vehículos para calcular la capacidad efectiva.'}
            </p>
          </section>
        ) : (
          <section className="operator-panel" aria-labelledby="sch-02">
            <p className="operator-eyebrow">02 · Vehículos asignados</p>
            <h2 id="sch-02">Vehículos</h2>
            <p className="operator-copy">Los vehículos se asignan después.</p>
            {tour?.needsTransport && (
              <p className="operator-access-note">Este tour usa transporte: su capacidad es la del tour hasta que se asignen los vehículos.</p>
            )}
            <p className="operator-copy" aria-live="polite">
              {tour ? `Capacidad de la salida: ${tour.capacity} viajeros (la del tour).` : 'Selecciona un tour para ver la capacidad.'}
            </p>
          </section>
        )}

        {messages.length > 0 && (
          <div role="alert" className="operator-error">
            {messages.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
        <div className="operator-form-actions">
          <button type="button" className="operator-outline" onClick={onBack}>
            Cancelar
          </button>
          <button type="submit" className="operator-primary" disabled={sending}>
            Guardar salida
          </button>
        </div>
      </form>
    </div>
  );
}
