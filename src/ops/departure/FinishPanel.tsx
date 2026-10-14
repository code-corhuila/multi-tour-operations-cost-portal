import { useState, type FormEvent } from 'react';
import type { Departure } from './gateway';
import type { PanelProps } from './panelProps';
import { useRegistration } from './useRegistration';

// Panel "Finalización": the end needs its time and result; an interruption needs its cause (RN-OPS-PT-37).
export function FinishPanel({ departure, gateway, canManage, onChanged }: PanelProps) {
  const [finishedAt, setFinishedAt] = useState('');
  const [result, setResult] = useState<'FINISHED' | 'INTERRUPTED'>('FINISHED');
  const [cause, setCause] = useState('');
  const [errors, setErrors] = useState<{ at?: string; cause?: string }>({});
  const { sending, failed, submit } = useRegistration();
  const locked = !canManage || sending;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const next: typeof errors = {};
    if (!finishedAt) next.at = 'Ingresa la hora de finalización real.';
    if (result === 'INTERRUPTED' && !cause.trim()) next.cause = 'Ingresa la causa y la evidencia de la interrupción.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    let updated: Departure | undefined;
    const ok = await submit(`${departure.code}|${finishedAt}|${result}|${cause.trim()}`, async (key) => {
      updated = await gateway.registerFinish({ code: departure.code, finishedAt, result, cause: result === 'INTERRUPTED' ? cause.trim() : '', key });
    });
    if (ok && updated) onChanged(updated);
  }

  return (
    <section className="operator-panel" aria-labelledby="finish-title">
      <p className="operator-eyebrow">Finalización</p>
      <h2 id="finish-title">Registrar la finalización o la interrupción</h2>
      <p className="operator-copy">
        El cierre es de la salida: al registrar la finalización, las reservas En ejecución pasan automáticamente a Finalizada. Una
        salida interrumpida termina en Finalizada con la interrupción registrada y sus reservas se gestionan con la reprogramación
        (24 horas para proponer, regreso excepcional a Confirmada si el cliente acepta) o la devolución del 100 %. Si la salida superó
        su hora estimada, este registro también la regulariza.
      </p>
      <form className="operator-form-grid" onSubmit={send} noValidate>
        <div>
          <label htmlFor="finish-at">Hora de finalización real</label>
          <input
            id="finish-at"
            type="datetime-local"
            value={finishedAt}
            disabled={locked}
            aria-invalid={errors.at ? true : undefined}
            aria-describedby={errors.at ? 'finish-at-error' : undefined}
            onChange={(e) => setFinishedAt(e.target.value)}
          />
          {errors.at && (
            <span id="finish-at-error" className="operator-form-feedback is-error">
              {errors.at}
            </span>
          )}
        </div>
        <div>
          <label htmlFor="finish-result">Resultado</label>
          <select id="finish-result" value={result} disabled={locked} onChange={(e) => setResult(e.target.value as 'FINISHED' | 'INTERRUPTED')}>
            <option value="FINISHED">Finalizada</option>
            <option value="INTERRUPTED">Interrumpida (termina Finalizada)</option>
          </select>
        </div>
        {result === 'INTERRUPTED' && (
          <div className="operator-form-wide">
            <label htmlFor="finish-cause">Interrupción (causa y evidencia)</label>
            <textarea
              id="finish-cause"
              value={cause}
              disabled={locked}
              aria-invalid={errors.cause ? true : undefined}
              aria-describedby={errors.cause ? 'finish-cause-error' : undefined}
              onChange={(e) => setCause(e.target.value)}
            />
            {errors.cause && (
              <span id="finish-cause-error" className="operator-form-feedback is-error">
                {errors.cause}
              </span>
            )}
          </div>
        )}
        <div className="operator-form-actions">
          <button type="submit" className="operator-primary" disabled={locked}>
            Registrar finalización
          </button>
        </div>
      </form>
      {failed && (
        <div role="alert">
          <p className="operator-form-feedback is-error">No pudimos registrar la finalización. Tus datos siguen aquí.</p>
          <button type="button" className="operator-outline" disabled={locked} onClick={() => void send()}>
            Reintentar
          </button>
        </div>
      )}
    </section>
  );
}
