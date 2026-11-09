import { useCallback, useState } from 'react';
import { Refused } from '../departures/model';
import { useAsync } from '../useAsync';
import type { Departure } from './gateway';
import { failureText, type PanelProps } from './panelProps';
import { useRegistration } from './useRegistration';

// Panel "Agregar vehículos" (HU-OPS-002, spec 008 AC-PT-08.7): the Administrator gives more vehicles to a scheduled departure of a tour
// that requires transport. It only adds: nothing is removed here (part B). Drawn only where the adapter can do it and the departure allows it.
export function AddVehiclesPanel({ departure, gateway, canSchedule, onChanged }: PanelProps) {
  const applicable = !!canSchedule && !!gateway.addVehicles && !!gateway.listVehicles && departure.status === 'SCHEDULED' && !!departure.transportRequired;
  const listVehicles = gateway.listVehicles;
  const load = useCallback(async () => (applicable && listVehicles ? listVehicles() : []), [applicable, listVehicles]);
  const { state, retry } = useAsync(load);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const { sending, failed, error: failure, submit } = useRegistration();

  if (!applicable || !gateway.addVehicles) return null;
  const add = gateway.addVehicles;
  const onIt = departure.vehicleIds ?? [];

  async function send() {
    setDone(undefined);
    if (chosen.length === 0) return setError('Elige al menos un vehículo.');
    setError(undefined);
    let updated: Departure | undefined;
    const ids = [...chosen].sort();
    const ok = await submit(`${departure.code}|${ids.join(',')}`, async (key) => {
      updated = await add({ code: departure.code, vehicleIds: ids, key });
    });
    if (ok && updated) {
      setChosen([]);
      setDone(`Vehículos agregados. Capacidad efectiva: ${updated.capacity}.`);
      onChanged(updated);
    }
  }

  const message =
    failure instanceof Refused && failure.code === 'BUSINESS_RULE_VIOLATION'
      ? 'El servicio no aceptó los vehículos: alguno ya está en otra salida a esa hora, no existe o el tour no usa transporte. Tus datos siguen aquí.'
      : failureText(failure, 'los vehículos');
  const free = state.kind === 'data' ? state.data.filter((v) => !onIt.includes(v.id)) : [];

  return (
    <section className="operator-panel" aria-labelledby="add-vehicles-title">
      <p className="operator-eyebrow">Transporte</p>
      <h2 id="add-vehicles-title">Agregar vehículos</h2>
      <p className="operator-copy">
        Suma la capacidad de los vehículos que agregues; la capacidad efectiva es el menor entre el cupo del tour y la capacidad acumulada. Un vehículo no
        puede estar en dos salidas que se crucen en el tiempo.
      </p>
      {state.kind === 'loading' && <p role="status">Cargando…</p>}
      {state.kind === 'error' && (
        <div role="alert">
          <p className="operator-copy">No pudimos cargar los vehículos.</p>
          <button type="button" className="operator-outline" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}
      {state.kind === 'data' && free.length === 0 && <p className="operator-copy">No hay vehículos disponibles para agregar.</p>}
      {state.kind === 'data' && free.length > 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          noValidate
        >
          <fieldset disabled={sending} aria-describedby={error ? 'add-vehicles-error' : undefined}>
            <legend>Vehículos disponibles</legend>
            {free.map((v) => (
              <label key={v.id} className="operator-check">
                <input
                  type="checkbox"
                  checked={chosen.includes(v.id)}
                  onChange={(e) => setChosen(e.target.checked ? [...chosen, v.id] : chosen.filter((id) => id !== v.id))}
                />
                {v.name} · {v.capacity} cupos
              </label>
            ))}
          </fieldset>
          {error && (
            <p id="add-vehicles-error" className="operator-form-feedback is-error">
              {error}
            </p>
          )}
          <div className="operator-form-actions">
            <button type="submit" className="operator-primary" disabled={sending}>
              Agregar vehículos
            </button>
          </div>
        </form>
      )}
      {done && (
        <p className="operator-form-feedback" role="status">
          {done}
        </p>
      )}
      {failed && (
        <div role="alert">
          <p className="operator-form-feedback is-error">{message}</p>
          <button type="button" className="operator-outline" disabled={sending} onClick={() => void send()}>
            Reintentar
          </button>
        </div>
      )}
    </section>
  );
}
