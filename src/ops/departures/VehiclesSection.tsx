import { useCallback, useRef, useState, type FormEvent } from 'react';
import { FieldError, Forbidden, Refused, Unavailable, type DeparturesGateway, type Vehicle } from './model';
import { useAsync } from '../useAsync';

// The fields of the request as the person knows them. The text is ours: the service speaks English to developers.
const FIELD_MESSAGE = {
  name: 'El nombre del vehículo no es válido.',
  capacity: 'La capacidad es un número entero de 1 a 100.',
} as const;
type Field = keyof typeof FIELD_MESSAGE;

const byName = (a: Vehicle, b: Vehicle) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

function failure(error: unknown): { general?: string; fields: Partial<Record<Field, string>> } {
  if (error instanceof FieldError) {
    const fields: Partial<Record<Field, string>> = {};
    for (const { field } of error.fields) if (field === 'name' || field === 'capacity') fields[field] = FIELD_MESSAGE[field];
    return Object.keys(fields).length > 0 ? { fields } : { general: 'Revisa los datos del vehículo.', fields };
  }
  if (error instanceof Refused) return { fields: { name: 'Ya existe un vehículo con ese nombre.' } };
  if (error instanceof Forbidden) return { general: 'No tienes permiso para registrar vehículos.', fields: {} };
  if (error instanceof Unavailable) return { general: 'El servicio no responde. Tus datos siguen aquí; intenta de nuevo.', fields: {} };
  return { general: 'No pudimos registrar el vehículo. Tus datos siguen aquí.', fields: {} };
}

// Section "Vehículos" of the departures page (portal spec 007, AC-PT-07.1 and -07.2): the vehicles of the tenant and the form to
// register one. Drawn only when the gateway can register, that is, when it is the connected one.
export function VehiclesSection({ gateway }: { gateway: DeparturesGateway }) {
  const load = useCallback(() => gateway.listVehicles(), [gateway]);
  const { state, retry, set } = useAsync(load);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [errors, setErrors] = useState<{ general?: string; fields: Partial<Record<Field, string>> }>({ fields: {} });
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  // One key per attempt: a retry of the same data after a failure reuses it; a new save, even of data seen before, gets another.
  const attempt = useRef<{ signature: string; key: string } | undefined>(undefined);

  if (!gateway.createVehicle) return null;
  const create = gateway.createVehicle;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setDone(false);
    const trimmed = name.trim();
    const amount = /^\d+$/.test(capacity.trim()) ? Number(capacity.trim()) : NaN;
    const fields: Partial<Record<Field, string>> = {};
    if (!trimmed) fields.name = 'Escribe el nombre del vehículo.';
    else if (trimmed.length > 60) fields.name = 'El nombre tiene como máximo 60 caracteres.';
    if (!(amount >= 1 && amount <= 100)) fields.capacity = FIELD_MESSAGE.capacity;
    setErrors({ fields });
    if (Object.keys(fields).length > 0) return;
    setSending(true);
    try {
      const signature = `${trimmed.toLowerCase()}|${amount}`;
      if (attempt.current?.signature !== signature) attempt.current = { signature, key: `vehicle:${crypto.randomUUID()}` };
      const created = await create({ name: trimmed, capacity: amount, key: attempt.current.key });
      attempt.current = undefined;
      if (state.kind === 'data') set([...state.data.filter((v) => v.id !== created.id), created].sort(byName));
      setName('');
      setCapacity('');
      setDone(true);
    } catch (error) {
      setErrors(failure(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="operator-panel" aria-labelledby="veh-title">
      <p className="operator-eyebrow">Transporte</p>
      <h2 id="veh-title">Vehículos</h2>
      <p className="operator-copy">Los vehículos de tu empresa se asignan a las salidas de los tours que usan transporte.</p>
      {state.kind === 'loading' && <p role="status">Cargando…</p>}
      {state.kind === 'error' && (
        <div role="alert">
          <p className="operator-copy">No pudimos cargar los vehículos.</p>
          <button type="button" className="operator-outline" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}
      {state.kind === 'data' &&
        (state.data.length === 0 ? (
          <p className="operator-copy">Aún no hay vehículos registrados.</p>
        ) : (
          <ul className="operator-detail-list">
            {state.data.map((v) => (
              <li key={v.id}>
                {v.name} · {v.capacity} viajeros
              </li>
            ))}
          </ul>
        ))}
      <form onSubmit={submit} noValidate>
        <div className="operator-form-grid">
          <label htmlFor="veh-name">Nombre del vehículo</label>
          <input
            id="veh-name"
            type="text"
            value={name}
            aria-invalid={!!errors.fields.name}
            aria-describedby={errors.fields.name ? 'veh-name-error' : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {errors.fields.name && (
            <p id="veh-name-error" role="alert" className="operator-error" style={{ gridColumn: '1 / -1' }}>
              {errors.fields.name}
            </p>
          )}
          <label htmlFor="veh-capacity">Capacidad (viajeros)</label>
          <input
            id="veh-capacity"
            type="text"
            inputMode="numeric"
            value={capacity}
            aria-invalid={!!errors.fields.capacity}
            aria-describedby={errors.fields.capacity ? 'veh-capacity-error' : undefined}
            onChange={(e) => setCapacity(e.target.value)}
          />
          {errors.fields.capacity && (
            <p id="veh-capacity-error" role="alert" className="operator-error" style={{ gridColumn: '1 / -1' }}>
              {errors.fields.capacity}
            </p>
          )}
        </div>
        {errors.general && (
          <p role="alert" className="operator-error">
            {errors.general}
          </p>
        )}
        {done && (
          <p className="operator-form-feedback" role="status">
            Vehículo registrado.
          </p>
        )}
        <div className="operator-form-actions">
          <button type="submit" className="operator-primary" disabled={sending}>
            {sending ? 'Registrando…' : 'Registrar vehículo'}
          </button>
        </div>
      </form>
    </section>
  );
}
