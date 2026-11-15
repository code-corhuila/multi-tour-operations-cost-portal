import { useCallback, useState } from 'react';
import { effectiveCapacity } from '../departures/capacity';
import { Forbidden, Unavailable } from '../departures/model';
import { useAsync } from '../useAsync';
import type { VehicleChange } from './gateway';
import type { PanelProps } from './panelProps';
import { useRegistration } from './useRegistration';

// What the person reads after an answer of the saga (spec 016 AC-PT-16.3); the saga id is the reference a person reviews a failure with.
function told(change: VehicleChange): string {
  if (change.status === 'COMPLETED') return `Vehículos cambiados. Capacidad efectiva: ${change.departure?.capacity ?? '—'}.`;
  if (change.status === 'RUNNING') return 'El cambio está en curso. Vuelve a consultarlo en unos segundos.';
  if (change.status === 'FAILED') return `El cambio quedó sin terminar y una persona debe revisarlo. Referencia: ${change.sagaId}.`;
  if (change.reason === 'SEATS_HELD') return 'Hay más cupos reservados que la nueva capacidad. No se cambió nada.';
  if (change.reason === 'VEHICLES_REFUSED') return 'El servicio rechazó los vehículos elegidos. No se cambió nada.';
  return 'No pudimos completar el cambio. No se cambió nada.';
}

function failure(error: unknown): string {
  if (error instanceof Forbidden) return 'Solo el Administrador cambia los vehículos de una salida. Tus datos siguen aquí.';
  if (error instanceof Unavailable) return 'No pudimos confirmar si el cambio se pidió: el servicio no respondió. Reintentar es seguro. Tus datos siguen aquí.';
  return 'No pudimos pedir el cambio de vehículos. Tus datos siguen aquí.';
}

// Panel "Cambiar vehículos" (HU-OPS-002 part B, spec 016): the Administrator chooses the whole new set of a scheduled departure, sees the
// capacity it would give (a preview, the saga decides: RN-OPS-PT-71) and sends it to the saga. The key belongs to the set (RN-OPS-PT-72).
export function ChangeVehiclesPanel({ departure, gateway, canSchedule, onChanged }: PanelProps) {
  const applicable = !!canSchedule && !!gateway.changeVehicles && !!gateway.listVehicles && departure.status === 'SCHEDULED' && !!departure.transportRequired;
  const listVehicles = gateway.listVehicles;
  const load = useCallback(async () => (applicable && listVehicles ? listVehicles() : []), [applicable, listVehicles]);
  const { state, retry } = useAsync(load);
  const [chosen, setChosen] = useState<string[]>(departure.vehicleIds ?? []);
  const [error, setError] = useState<string>();
  const [change, setChange] = useState<VehicleChange>();
  const { sending, failed, error: cause, submit } = useRegistration();
  const [reading, setReading] = useState(false);

  if (!applicable || !gateway.changeVehicles) return null;
  const changeVehicles = gateway.changeVehicles;
  const readAgain = gateway.readVehicleChange;

  const show = (answer: VehicleChange) => {
    setChange(answer);
    if (answer.departure) onChanged(answer.departure);
  };

  async function send() {
    setChange(undefined);
    if (chosen.length === 0) return setError('Elige al menos un vehículo.');
    setError(undefined);
    const ids = [...chosen].sort();
    let answer: VehicleChange | undefined;
    const ok = await submit(`${departure.code}|${ids.join(',')}`, async (key) => {
      answer = await changeVehicles({ code: departure.code, vehicleIds: ids, key });
    });
    if (ok && answer) show(answer);
  }

  async function lookAgain(sagaId: string) {
    if (!readAgain) return;
    setReading(true);
    try {
      show(await readAgain(sagaId, departure.code));
    } catch {
      // the saga is still where it was: the person may look again
    } finally {
      setReading(false);
    }
  }

  const vehicles = state.kind === 'data' ? state.data : [];
  const capacities = vehicles.filter((v) => chosen.includes(v.id)).map((v) => v.capacity);
  const preview = departure.tourCapacity === undefined ? '—' : effectiveCapacity(departure.tourCapacity, capacities, true);
  const toggle = (id: string, on: boolean) => {
    setChange(undefined);
    setChosen(on ? [...chosen, id] : chosen.filter((chosenId) => chosenId !== id));
  };

  return (
    <section className="operator-panel" aria-labelledby="change-vehicles-title">
      <p className="operator-eyebrow">Transporte</p>
      <h2 id="change-vehicles-title">Cambiar vehículos</h2>
      <p className="operator-copy">
        Elige el conjunto completo de vehículos que tendrá la salida. Se ejecuta como proceso: primero se ajusta el cupo de las reservas y, si el cambio falla,
        se deshace.
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
      {state.kind === 'data' && vehicles.length === 0 && <p className="operator-copy">No hay vehículos para elegir.</p>}
      {state.kind === 'data' && vehicles.length > 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          noValidate
        >
          <fieldset disabled={sending} aria-describedby={error ? 'change-vehicles-error' : undefined} aria-invalid={error ? true : undefined}>
            <legend>Vehículos de la salida</legend>
            {vehicles.map((v) => (
              <label key={v.id} className="operator-check">
                <input type="checkbox" checked={chosen.includes(v.id)} onChange={(e) => toggle(v.id, e.target.checked)} />
                {v.name} · {v.capacity} cupos
              </label>
            ))}
          </fieldset>
          {error && (
            <p id="change-vehicles-error" className="operator-form-feedback is-error" role="alert">
              {error}
            </p>
          )}
          <ul className="operator-detail-list">
            <li>Capacidad hoy: {departure.capacity}</li>
            <li>Capacidad con el nuevo conjunto: {preview}</li>
          </ul>
          <div className="operator-form-actions">
            <button type="submit" className="operator-primary" disabled={sending}>
              Confirmar cambio
            </button>
          </div>
        </form>
      )}
      {change && (
        <div role="status">
          <p className="operator-form-feedback">{told(change)}</p>
          {change.status === 'RUNNING' && readAgain && (
            <button type="button" className="operator-outline" disabled={reading} onClick={() => void lookAgain(change.sagaId)}>
              Volver a consultar
            </button>
          )}
        </div>
      )}
      {failed && (
        <div role="alert">
          <p className="operator-form-feedback is-error">{failure(cause)}</p>
          <button type="button" className="operator-outline" disabled={sending} onClick={() => void send()}>
            Reintentar
          </button>
        </div>
      )}
    </section>
  );
}
