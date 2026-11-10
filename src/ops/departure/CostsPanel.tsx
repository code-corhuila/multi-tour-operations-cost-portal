import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Forbidden, Refused } from '../departures/model';
import { parseMoney } from '../money';
import { useAsync } from '../useAsync';
import type { CostInput, CostLine, CostMode, CostSheet } from './gateway';
import type { PanelProps } from './panelProps';
import { useRegistration } from './useRegistration';

// Pesos with thousands dots and, only when there are cents, a comma and two decimals. Built from the integer of minor units: no float.
export function formatMoney(cents: number): string {
  const pesos = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = cents % 100;
  return `$ ${pesos}${rest ? `,${String(rest).padStart(2, '0')}` : ''}`;
}

const ORIGIN: Record<CostMode, string> = { CALCULATED: 'Calculado', MANUAL: 'Gasto real' };

function failureText(error: unknown): string {
  if (error instanceof Refused) {
    return error.code === 'INVALID_STATUS_TRANSITION'
      ? 'El servicio no aceptó el costo: la salida aún no ha iniciado. Tus datos siguen aquí.'
      : 'El servicio no aceptó el costo: revisa que haya servicios prestados registrados y, si el tour no tiene costo parametrizado, la justificación. Tus datos siguen aquí.';
  }
  if (error instanceof Forbidden) return 'Tu usuario no tiene el permiso Gestionar ejecución de salidas. Tus datos siguen aquí.';
  return 'No pudimos registrar el costo. Tus datos siguen aquí.';
}

type Errors = { concept?: string; amount?: string; justification?: string };

// Panel "Costos operacionales" (spec 011): the real cost of a departure that started, apart from the commercial value sold (RF-009).
export function CostsPanel({ departure, gateway, canManage }: PanelProps) {
  const started = departure.status === 'IN_EXECUTION' || departure.status === 'FINISHED';
  const load = useMemo(() => () => (started && gateway.getCosts ? gateway.getCosts(departure.code) : Promise.resolve(undefined)), [gateway, departure.code, started]);
  const { state, retry, set } = useAsync<CostSheet | undefined>(load);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [justification, setJustification] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);
  const lastMode = useRef<CostMode>('MANUAL');
  const { sending, failed, error: failure, submit } = useRegistration();

  if (!canManage || !gateway.recordCost) return null;
  if (!started) {
    return (
      <section className="operator-panel" aria-labelledby="costs-title">
        <p className="operator-eyebrow">Costos operacionales</p>
        <h2 id="costs-title">Registro real de la ejecución</h2>
        <p className="operator-copy">Disponible cuando la salida haya iniciado.</p>
      </section>
    );
  }

  const sheet = state.kind === 'data' ? state.data : undefined;
  const hasBase = sheet?.baseCostCents !== undefined;
  const canCalculate = hasBase && (sheet?.travelersServed ?? 0) >= 1;

  async function send(mode: CostMode, event?: FormEvent) {
    event?.preventDefault();
    lastMode.current = mode;
    const next: Errors = {};
    if (!concept.trim()) next.concept = 'Escribe el concepto del costo.';
    const cents = mode === 'MANUAL' ? parseMoney(amount) : 0;
    if (mode === 'MANUAL' && cents === undefined) next.amount = 'Escribe un valor mayor a $0 (por ejemplo 12500 o 12500,50).';
    if (mode === 'MANUAL' && sheet && !hasBase && !justification.trim()) next.justification = 'Justifica el valor: el tour no tiene costo parametrizado.';
    setErrors(next);
    setDone(false);
    if (Object.keys(next).length > 0) return;
    const input: Omit<CostInput, 'key'> = {
      code: departure.code,
      concept: concept.trim(),
      mode,
      amountCents: cents ?? 0,
      // only a cost without a catalogued cost carries its justification (api 007 D-03)
      justification: mode === 'MANUAL' && !hasBase ? justification.trim() : '',
    };
    const ok = await submit(JSON.stringify(input), async (key) => {
      await gateway.recordCost!({ ...input, key });
      set(await gateway.getCosts!(departure.code));
    });
    if (ok) {
      setDone(true);
      setConcept('');
      setAmount('');
      setJustification('');
    }
  }

  const locked = sending;
  return (
    <section className="operator-panel" aria-labelledby="costs-title">
      <p className="operator-eyebrow">Costos operacionales</p>
      <h2 id="costs-title">Registro real de la ejecución</h2>
      <p className="operator-copy">
        Los costos operacionales se registran para servicios ejecutados y se diferencian del valor comercial vendido.
      </p>
      {state.kind === 'loading' && <p role="status">Cargando costos…</p>}
      {state.kind === 'error' && (
        <div role="alert">
          <p className="operator-form-feedback is-error">No pudimos cargar los costos.</p>
          <button type="button" className="operator-outline" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}
      {sheet && (
        <>
          {sheet.lines.length === 0 ? (
            <p className="operator-copy">Aún no hay costos registrados para esta salida.</p>
          ) : (
            <table className="operator-table">
              <thead>
                <tr>
                  <th scope="col">Concepto</th>
                  <th scope="col">Origen</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Justificación</th>
                </tr>
              </thead>
              <tbody>
                {sheet.lines.map((l: CostLine) => (
                  <tr key={l.costId}>
                    <td>{l.concept}</td>
                    <td>{ORIGIN[l.mode]}</td>
                    <td>{formatMoney(l.amountCents)}</td>
                    <td>{l.justification ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="operator-copy">
            <strong>Total: {formatMoney(sheet.totalCents)}</strong> · Viajeros atendidos: {sheet.travelersServed}
          </p>
          {hasBase && canCalculate && (
            <p className="operator-copy">
              Costo parametrizado × viajeros atendidos: {formatMoney(sheet.baseCostCents ?? 0)} × {sheet.travelersServed} ={' '}
              {formatMoney((sheet.baseCostCents ?? 0) * sheet.travelersServed)}
            </p>
          )}
          {hasBase && !canCalculate && <p className="operator-copy">Registra los servicios prestados para calcular el costo.</p>}
          {!hasBase && <p className="operator-copy">Este tour no tiene costo parametrizado: justifica el valor.</p>}
          <form className="operator-form-grid" onSubmit={(e) => void send('MANUAL', e)} noValidate>
            <div>
              <label htmlFor="cost-concept">Concepto</label>
              <input
                id="cost-concept"
                value={concept}
                maxLength={200}
                disabled={locked}
                aria-invalid={errors.concept ? true : undefined}
                aria-describedby={errors.concept ? 'cost-concept-error' : undefined}
                placeholder="Describe el costo operacional"
                onChange={(e) => setConcept(e.target.value)}
              />
              {errors.concept && (
                <span id="cost-concept-error" className="operator-form-feedback is-error">
                  {errors.concept}
                </span>
              )}
            </div>
            <div>
              <label htmlFor="cost-amount">Valor</label>
              <input
                id="cost-amount"
                inputMode="decimal"
                value={amount}
                disabled={locked}
                aria-invalid={errors.amount ? true : undefined}
                aria-describedby={errors.amount ? 'cost-amount-error' : undefined}
                onChange={(e) => setAmount(e.target.value)}
              />
              {errors.amount && (
                <span id="cost-amount-error" className="operator-form-feedback is-error">
                  {errors.amount}
                </span>
              )}
            </div>
            {!hasBase && (
              <div>
                <label htmlFor="cost-justification">Justificación</label>
                <input
                  id="cost-justification"
                  value={justification}
                  maxLength={500}
                  disabled={locked}
                  aria-invalid={errors.justification ? true : undefined}
                  aria-describedby={errors.justification ? 'cost-justification-error' : undefined}
                  onChange={(e) => setJustification(e.target.value)}
                />
                {errors.justification && (
                  <span id="cost-justification-error" className="operator-form-feedback is-error">
                    {errors.justification}
                  </span>
                )}
              </div>
            )}
            <div className="operator-form-actions">
              <button type="submit" className="operator-outline" disabled={locked}>
                Registrar costo
              </button>
              {canCalculate && (
                <button type="button" className="operator-primary" disabled={locked} onClick={() => void send('CALCULATED')}>
                  Calcular con la parametrización
                </button>
              )}
            </div>
          </form>
        </>
      )}
      {done && (
        <p role="status" className="operator-form-feedback">
          Costo registrado y asociado a la salida {departure.code}.
        </p>
      )}
      {failed && (
        <div role="alert">
          <p className="operator-form-feedback is-error">{failureText(failure)}</p>
          <button type="button" className="operator-outline" disabled={locked} onClick={() => void send(lastMode.current)}>
            Reintentar
          </button>
        </div>
      )}
    </section>
  );
}
