import { useState, type FormEvent } from 'react';
import type { Departure } from './gateway';
import type { PanelProps } from './panelProps';
import { useRegistration } from './useRegistration';

// Panel "Inicio de la salida": the real start, required and not before the scheduled one (RN-OPS-PT-32, -33).
export function StartPanel({ departure, gateway, canManage, onChanged }: PanelProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const { sending, failed, submit } = useRegistration();

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!value) return setError('Ingresa la hora de inicio real.');
    if (new Date(value) < new Date(departure.scheduledStart)) return setError('El inicio real no puede ser anterior a la hora programada.');
    setError(undefined);
    let updated: Departure | undefined;
    const ok = await submit(`${departure.code}|${value}`, async (key) => {
      updated = await gateway.registerStart({ code: departure.code, startedAt: value, key });
    });
    if (ok && updated) onChanged(updated);
  }

  const locked = !canManage || sending;
  return (
    <section className="operator-panel" aria-labelledby="start-title">
      <p className="operator-eyebrow">Inicio de la salida</p>
      <h2 id="start-title">Registrar el inicio real</h2>
      <p className="operator-copy">
        Se registra después del control operativo previo realizado por el guía. El inicio real no puede ser anterior a la hora
        programada. Al registrarlo pasan a En ejecución las reservas Confirmadas con Pago completo; las que tengan pagos o saldos
        pendientes, o un comprobante aún En validación, se cancelan por incumplimiento del pago y liberan su cupo. Un retraso en el
        inicio no extiende los plazos económicos.
      </p>
      <form className="operator-form-grid" onSubmit={send} noValidate>
        <div>
          <label htmlFor="start-at">Hora de inicio real</label>
          <input
            id="start-at"
            type="datetime-local"
            required
            value={value}
            disabled={locked}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'start-error' : undefined}
            onChange={(e) => setValue(e.target.value)}
          />
          {error && (
            <span id="start-error" className="operator-form-feedback is-error">
              {error}
            </span>
          )}
        </div>
        <div className="operator-form-actions">
          <button type="submit" className="operator-primary" disabled={locked}>
            Registrar inicio real
          </button>
        </div>
      </form>
      {failed && (
        <div role="alert">
          <p className="operator-form-feedback is-error">No pudimos registrar el inicio. Tus datos siguen aquí.</p>
          <button type="button" className="operator-outline" disabled={locked} onClick={() => void send()}>
            Reintentar
          </button>
        </div>
      )}
    </section>
  );
}
