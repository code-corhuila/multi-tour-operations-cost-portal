import { useCallback, useState, type FormEvent } from 'react';
import { effectiveCapacity, overlaps } from './capacity';
import type { DeparturesGateway } from './model';
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

// Form of the Mockup admin-programar-salida.html (spec 005 PT-11) over the test data of the port.
export function ScheduleDepartureForm({ gateway, editCode, onBack, onSaved }: ScheduleDepartureFormProps) {
  const load = useCallback(async () => {
    const [tours, vehicles, departures] = await Promise.all([gateway.listTours(), gateway.listVehicles(), gateway.listDepartures()]);
    return { tours, vehicles, departures };
  }, [gateway]);
  const { state, retry } = useAsync(load);
  const [form, setForm] = useState<{ tourId: string; date: string; start: string; end: string; vehicleIds: string[] }>();
  const [messages, setMessages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

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
  const editing = departures.find((d) => d.code === editCode);
  // First render of the form: filled from the departure being edited, or empty.
  const current =
    form ??
    (editing
      ? { tourId: editing.tourId, date: editing.start.slice(0, 10), start: editing.start.slice(11), end: editing.end.slice(11), vehicleIds: [...editing.vehicleIds] }
      : { tourId: '', date: '', start: '', end: '', vehicleIds: [] as string[] });
  const set = (patch: Partial<typeof current>) => setForm({ ...current, ...patch });
  // A departure with reservations keeps its date, hours and tour (RN-OPS-PT-56).
  const locked = !!editing && editing.reservations > 0;

  const tour = tours.find((t) => t.id === current.tourId);
  const chosen = vehicles.filter((v) => current.vehicleIds.includes(v.id));
  const hasInterval = !!current.date && !!current.start && !!current.end && current.end > current.start;
  const busy = (vehicleId: string) =>
    hasInterval
      ? departures.find((d) => d.code !== editCode && d.status !== 'CANCELLED' && d.vehicleIds.includes(vehicleId) && overlaps(interval(current), d))
      : undefined;
  const capacity = tour ? effectiveCapacity(tour.capacity, chosen.map((v) => v.capacity), tour.needsTransport) : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateDeparture({ ...current, editingCode: editCode }, { tours, vehicles, departures });
    setMessages(found);
    if (found.length > 0 || !tour) return;
    setSending(true);
    try {
      const { start, end } = interval(current);
      // The same data gives the same key: repeating the save answers the same departure (Idempotency-Key).
      const key = `schedule:${editCode ?? 'new'}|${current.tourId}|${start}|${end}|${[...current.vehicleIds].sort().join(',')}`;
      const saved = editCode
        ? await gateway.updateDeparture({ code: editCode, tourId: current.tourId, start, end, vehicleIds: current.vehicleIds, key })
        : await gateway.scheduleDeparture({ tourId: current.tourId, start, end, vehicleIds: current.vehicleIds, key });
      const verb = editCode ? 'actualizada' : 'programada';
      const tail = editCode ? '' : ' Ya se puede reservar.';
      onSaved(`Salida ${saved.code} ${verb} (${tour.name}, ${start.replace('T', ' ')}). Capacidad efectiva: ${capacity}.${tail}`);
    } catch {
      setMessages(['No pudimos guardar la salida. Tus datos siguen aquí.']);
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
      <p className="operator-eyebrow">Datos de prueba</p>

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
            <select id="sch-tour" value={current.tourId} disabled={locked} onChange={(e) => set({ tourId: e.target.value })}>
              <option value="">Selecciona un tour</option>
              {tours.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <label htmlFor="sch-date">Fecha</label>
            <input id="sch-date" type="date" value={current.date} disabled={locked} onChange={(e) => set({ date: e.target.value })} />
            <label htmlFor="sch-start">Hora de inicio programada</label>
            <input id="sch-start" type="time" value={current.start} disabled={locked} onChange={(e) => set({ start: e.target.value })} />
            <label htmlFor="sch-end">Hora de finalización estimada</label>
            <input id="sch-end" type="time" value={current.end} disabled={locked} onChange={(e) => set({ end: e.target.value })} />
            <label htmlFor="sch-quota">Cupo del tour (viajeros)</label>
            <input id="sch-quota" type="number" value={tour ? tour.capacity : ''} readOnly />
            <label htmlFor="sch-state">Estado</label>
            <input id="sch-state" type="text" value="Programada" readOnly />
          </div>
        </section>

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
