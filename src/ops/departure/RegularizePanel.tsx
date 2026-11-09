import { useState, type FormEvent } from 'react';
import { TENANT_TIME_ZONE, toInstant } from '../departures/time';
import type { Departure, RegularizationResult } from './gateway';
import { failureText, type PanelProps } from './panelProps';
import { useRegistration } from './useRegistration';

type Errors = Partial<Record<'result' | 'start' | 'end' | 'motive' | 'interruption' | 'notDone', string>>;

// Panel "Salida pendiente de regularización": each result asks for its own fields and an actual start earlier than the
// scheduled one needs its motive (RN-OPS-PT-38). The status of the departure comes from the data, never from the clock.
export function RegularizePanel({ departure, gateway, canManage, onChanged }: PanelProps) {
  const [result, setResult] = useState<RegularizationResult | ''>('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [motive, setMotive] = useState('');
  const [interruption, setInterruption] = useState('');
  const [notDone, setNotDone] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const { sending, failed, error: failure, submit } = useRegistration();
  const locked = !canManage || sending;
  // Wall clocks of the tenant ("2026-10-10T08:00") compare as text; the motive is asked only for a start earlier than the scheduled one.
  const early = start !== '' && start < departure.scheduledStart;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const next: Errors = {};
    if (!result) next.result = 'Selecciona el resultado.';
    if (result === 'NOT_DONE' && !notDone.trim()) next.notDone = 'Ingresa la causal de la no realización.';
    if (result === 'EXECUTED' || result === 'INTERRUPTED') {
      if (!start) next.start = 'Ingresa la hora de inicio real.';
      if (!end) next.end = 'Ingresa la hora de finalización real.';
      if (early && !motive.trim()) next.motive = 'Ingresa el motivo: el inicio real es anterior al programado.';
      // The courtesy checks of the page; the service decides. The hours are compared as instants of the tenant, not of the browser.
      const now = Date.now();
      const at = (wall: string) => (wall ? Date.parse(toInstant(wall, TENANT_TIME_ZONE)) : NaN);
      if (start && at(start) > now) next.start = 'El inicio real no puede ser posterior a este momento.';
      if (start && end && at(end) < at(start)) next.end = 'La finalización real no puede ser anterior al inicio.';
      else if (end && at(end) > now) next.end = 'La finalización real no puede ser posterior a este momento.';
      if (result === 'INTERRUPTED' && !interruption.trim()) next.interruption = 'Ingresa la causa y la evidencia de la interrupción.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !result) return;
    let updated: Departure | undefined;
    const input = {
      code: departure.code,
      result,
      startedAt: start,
      finishedAt: end,
      earlyStartMotive: motive.trim(),
      interruption: interruption.trim(),
      notDoneCause: notDone.trim(),
    };
    const ok = await submit(`${departure.code}|${JSON.stringify(input)}`, async (key) => {
      updated = await gateway.registerRegularization({ ...input, key });
    });
    if (ok && updated) onChanged(updated);
  }

  const field = (id: keyof Errors, name: string) => ({
    id: `reg-${name}`,
    disabled: locked,
    'aria-invalid': errors[id] ? true : undefined,
    'aria-describedby': errors[id] ? `reg-${name}-error` : undefined,
  });
  const error = (id: keyof Errors, name: string) =>
    errors[id] && (
      <span id={`reg-${name}-error`} className="operator-form-feedback is-error">
        {errors[id]}
      </span>
    );
  const times = result === 'EXECUTED' || result === 'INTERRUPTED';

  return (
    <section className="operator-panel" aria-labelledby="regularize-title">
      <p className="operator-eyebrow">Salida pendiente de regularización</p>
      <h2 id="regularize-title">Registrar lo ocurrido</h2>
      <p className="operator-copy">
        La salida superó su hora de finalización estimada sin cierre. Registra la información real: ejecutada y finalizada, interrumpida o no realizada
        (Cancelada). La hora programada sigue gobernando los plazos aunque la hora real reportada sea anterior; en ese caso el motivo es obligatorio y queda
        auditado.
      </p>
      <form className="operator-form-grid" onSubmit={send} noValidate>
        <div>
          <label htmlFor="reg-result">Resultado</label>
          <select {...field('result', 'result')} value={result} onChange={(e) => setResult(e.target.value as RegularizationResult | '')}>
            <option value="">Selecciona una opción</option>
            <option value="EXECUTED">Ejecutada y finalizada</option>
            <option value="INTERRUPTED">Interrumpida (termina Finalizada)</option>
            {!gateway.connected && <option value="NOT_DONE">No realizada (queda Cancelada)</option>}
          </select>
          {error('result', 'result')}
        </div>
        {times && (
          <>
            <div>
              <label htmlFor="reg-start">Hora de inicio real</label>
              <input {...field('start', 'start')} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
              {error('start', 'start')}
            </div>
            <div>
              <label htmlFor="reg-end">Hora de finalización real</label>
              <input {...field('end', 'end')} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
              {error('end', 'end')}
            </div>
            {early && (
              <div className="operator-form-wide">
                <label htmlFor="reg-motive">Motivo si la hora real de inicio es anterior a la programada</label>
                <input {...field('motive', 'motive')} value={motive} onChange={(e) => setMotive(e.target.value)} />
                {error('motive', 'motive')}
              </div>
            )}
          </>
        )}
        {result === 'INTERRUPTED' && (
          <div className="operator-form-wide">
            <label htmlFor="reg-interruption">Interrupción (causa y evidencia)</label>
            <textarea {...field('interruption', 'interruption')} value={interruption} onChange={(e) => setInterruption(e.target.value)} />
            {error('interruption', 'interruption')}
          </div>
        )}
        {result === 'NOT_DONE' && (
          <div className="operator-form-wide">
            <label htmlFor="reg-notdone">Causal de la no realización</label>
            <textarea {...field('notDone', 'notdone')} value={notDone} onChange={(e) => setNotDone(e.target.value)} />
            {error('notDone', 'notdone')}
          </div>
        )}
        <div className="operator-form-actions">
          <button type="submit" className="operator-primary" disabled={locked}>
            Registrar regularización
          </button>
        </div>
      </form>
      {failed && (
        <div role="alert">
          <p className="operator-form-feedback is-error">{failureText(failure, 'la regularización')}</p>
          <button type="button" className="operator-outline" disabled={locked} onClick={() => void send()}>
            Reintentar
          </button>
        </div>
      )}
    </section>
  );
}
