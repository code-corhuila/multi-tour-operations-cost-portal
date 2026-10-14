import { useMemo, useState, type FormEvent } from 'react';
import type { OperationsGateway } from './gateway';
import { useAsync } from './useAsync';

interface Props {
  gateway: OperationsGateway;
  reservationId: string;
  onBack: () => void;
}

// Page of the Mockup admin-registrar-ejecucion.html (spec 002 PT-06): the reservation data is read only and the person
// states the real result; the causal is required when the service was not served.
export function RegisterExecutionForm({ gateway, reservationId, onBack }: Props) {
  const load = useMemo(() => () => gateway.getReservation(reservationId), [gateway, reservationId]);
  const { state, retry } = useAsync(load);
  const [served, setServed] = useState('');
  const [executed, setExecuted] = useState('');
  const [cause, setCause] = useState('');
  const [errors, setErrors] = useState<{ served?: string; cause?: string; executed?: string }>({});
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!served) next.served = 'Selecciona si el servicio se prestó.';
    if (served === 'no' && !cause.trim()) next.cause = 'La causal de no prestación es obligatoria.';
    if (served === 'si' && !/^\d+$/.test(executed)) next.executed = 'Ingresa la cantidad de viajeros ejecutados.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSending(true);
    try {
      await gateway.registerExecution({ reservationId, served: served === 'si', executed: Number(executed || 0), cause: cause.trim() });
      onBack();
    } finally {
      setSending(false);
    }
  }

  if (state.kind === 'loading') return <p role="status">Cargando…</p>;
  if (state.kind === 'error') {
    return (
      <div role="alert">
        <p className="operator-copy">No pudimos cargar la reserva.</p>
        <button type="button" className="operator-outline" onClick={retry}>
          Reintentar
        </button>
      </div>
    );
  }
  const r = state.data;
  return (
    <div className="operator-content">
      <header className="operator-topbar">
        <div>
          <p className="operator-eyebrow">Seguimiento real</p>
          <h1>Registrar ejecución</h1>
        </div>
        <button type="button" className="operator-outline" onClick={onBack}>
          Volver a operación
        </button>
      </header>
      <form className="operator-reservation-form" onSubmit={onSubmit} noValidate>
        <section className="operator-panel">
          <p className="operator-eyebrow">01. Reserva</p>
          <h2>Datos reservados</h2>
          <div className="operator-form-grid">
            <label>
              Reserva
              <input readOnly value={r.reservationId} />
            </label>
            <label>
              Cliente
              <input readOnly value={r.customer} />
            </label>
            <label>
              Servicio
              <input readOnly value={r.service} />
            </label>
            <label>
              Fecha
              <input readOnly value={r.date} />
            </label>
            <label>
              Viajeros reservados
              <input readOnly value={String(r.reserved)} />
            </label>
          </div>
        </section>
        <section className="operator-panel">
          <p className="operator-eyebrow">02. Ejecución real</p>
          <h2>¿Se prestó el servicio?</h2>
          <div className="operator-form-grid">
            <div>
              <label>
                Resultado
                <select value={served} onChange={(e) => setServed(e.target.value)} aria-describedby="exec-served-error">
                  <option value="">Selecciona una opción</option>
                  <option value="si">Sí, se prestó</option>
                  <option value="no">No se prestó</option>
                </select>
              </label>
              <span id="exec-served-error" className="operator-form-feedback is-error">
                {errors.served}
              </span>
            </div>
            {served === 'si' && (
              <div>
                <label>
                  Viajeros ejecutados
                  <input type="number" min={0} inputMode="numeric" value={executed} onChange={(e) => setExecuted(e.target.value)} aria-describedby="exec-executed-error" />
                </label>
                <span id="exec-executed-error" className="operator-form-feedback is-error">
                  {errors.executed}
                </span>
              </div>
            )}
          </div>
          {served === 'no' && (
            <div className="operator-form-wide">
              <label>
                Causal de no prestación (obligatoria)
                <textarea value={cause} onChange={(e) => setCause(e.target.value)} placeholder="Describe la causal por la cual el servicio no se prestó" aria-describedby="exec-cause-error" />
              </label>
              <span id="exec-cause-error" className="operator-form-feedback is-error">
                {errors.cause}
              </span>
            </div>
          )}
        </section>
        <div className="operator-form-actions">
          <button type="button" className="operator-outline" onClick={onBack}>
            Cancelar
          </button>
          <button type="submit" className="operator-primary" disabled={sending}>
            Registrar ejecución
          </button>
        </div>
      </form>
    </div>
  );
}
