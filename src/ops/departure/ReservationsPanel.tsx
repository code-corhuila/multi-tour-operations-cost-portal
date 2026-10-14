import { useState } from 'react';
import type { Departure, ReservationState, ServiceResult } from './gateway';
import type { PanelProps } from './panelProps';
import { useRegistration } from './useRegistration';

const STATE: Record<ReservationState, { label: string; className: string }> = {
  ELIGIBLE: { label: 'Elegible para iniciar', className: 'operator-status is-confirmed' },
  NOT_ELIGIBLE: { label: 'No elegible (pago pendiente)', className: 'operator-status is-pending' },
  IN_EXECUTION: { label: 'Reserva en ejecución', className: 'operator-status is-confirmed' },
  FINISHED: { label: 'Reserva finalizada', className: 'operator-status is-active' },
  CANCELLED: { label: 'Cancelada por incumplimiento de pago', className: 'operator-status is-failed' },
};

type Draft = Record<string, { result: ServiceResult; cause: string }>;

const initialDraft = (d: Departure): Draft =>
  Object.fromEntries(d.reservations.map((r) => [r.reservationId, { result: r.result ?? 'DELIVERED', cause: r.cause ?? '' }]));

// Panel "Reservas de la salida": the reserved numbers stay visible next to what was delivered (RN-OPS-PT-34, -35).
export function ReservationsPanel({ departure, gateway, canManage, onChanged }: PanelProps) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(departure));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const { sending, failed, submit } = useRegistration();
  const editable = departure.status === 'IN_EXECUTION';
  const locked = !canManage || sending;

  async function save() {
    const next: Record<string, string> = {};
    for (const r of departure.reservations) {
      const row = draft[r.reservationId];
      if (r.state === 'IN_EXECUTION' && row.result === 'NOT_DELIVERED' && !row.cause.trim()) {
        next[r.reservationId] = 'La causal es obligatoria para un servicio no prestado.';
      }
    }
    setErrors(next);
    setSaved(false);
    if (Object.keys(next).length > 0) return;
    const entries = departure.reservations
      .filter((r) => r.state === 'IN_EXECUTION')
      .map((r) => ({ reservationId: r.reservationId, result: draft[r.reservationId].result, cause: draft[r.reservationId].cause.trim() }));
    let updated: Departure | undefined;
    const ok = await submit(`${departure.code}|${JSON.stringify(entries)}`, async (key) => {
      updated = await gateway.registerServices({ code: departure.code, entries, key });
    });
    if (ok && updated) {
      setSaved(true);
      onChanged(updated);
    }
  }

  return (
    <section className="operator-panel" aria-labelledby="reservations-title">
      <p className="operator-eyebrow">Reservas de la salida</p>
      <h2 id="reservations-title">Lo reservado y lo efectivamente prestado</h2>
      <p className="operator-copy">
        Se registran los servicios prestados y no prestados con su causal obligatoria; la diferencia frente a la proyección inicial
        permanece visible. Si una persona no se presenta y no hubo aviso oportuno, el guía puede conceder hasta 10 minutos antes de
        iniciar; transcurridos, el servicio se mantiene cobrado. Una vez iniciada la salida no se permiten ajustes ordinarios.
      </p>
      {departure.reservations.length === 0 && <p className="operator-copy">Esta salida no tiene reservas.</p>}
      {departure.reservations.map((r) => {
        const state = STATE[r.state];
        const row = draft[r.reservationId];
        const rowEditable = editable && r.state === 'IN_EXECUTION';
        const executed = r.result === 'DELIVERED' ? r.travelers : 0;
        return (
          <article key={r.reservationId} className="operator-form-wide">
            <p>
              <strong>
                #{r.reservationId} · {r.customer} · {r.travelers} viajeros
              </strong>{' '}
              <span className={state.className}>{state.label}</span>
            </p>
            <p className="operator-copy">{r.service}</p>
            {rowEditable && (
              <div className="operator-form-grid">
                <div>
                  <label htmlFor={`result-${r.reservationId}`}>Resultado</label>
                  <select
                    id={`result-${r.reservationId}`}
                    value={row.result}
                    disabled={locked}
                    onChange={(e) => setDraft({ ...draft, [r.reservationId]: { ...row, result: e.target.value as ServiceResult } })}
                  >
                    <option value="DELIVERED">Prestado</option>
                    <option value="NOT_DELIVERED">No prestado</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={`cause-${r.reservationId}`}>Causal si no se prestó</label>
                  <input
                    id={`cause-${r.reservationId}`}
                    value={row.cause}
                    disabled={locked}
                    aria-invalid={errors[r.reservationId] ? true : undefined}
                    aria-describedby={errors[r.reservationId] ? `cause-error-${r.reservationId}` : undefined}
                    onChange={(e) => setDraft({ ...draft, [r.reservationId]: { ...row, cause: e.target.value } })}
                  />
                  {errors[r.reservationId] && (
                    <span id={`cause-error-${r.reservationId}`} className="operator-form-feedback is-error">
                      {errors[r.reservationId]}
                    </span>
                  )}
                </div>
              </div>
            )}
            {r.result && (
              <p className="operator-copy">
                {`Reservado: ${r.travelers} · Ejecutado: ${executed}`}
                {r.result === 'NOT_DELIVERED' && r.cause ? ` · No prestado: ${r.cause}` : ''}
              </p>
            )}
          </article>
        );
      })}
      {editable && (
        <div className="operator-form-actions">
          <button type="button" className="operator-primary" disabled={locked} onClick={() => void save()}>
            Guardar servicios
          </button>
        </div>
      )}
      {saved && <p role="status" className="operator-form-feedback">Servicios guardados.</p>}
      {failed && (
        <div role="alert">
          <p className="operator-form-feedback is-error">No pudimos guardar los servicios. Tus datos siguen aquí.</p>
          <button type="button" className="operator-outline" disabled={locked} onClick={() => void save()}>
            Reintentar
          </button>
        </div>
      )}
    </section>
  );
}
