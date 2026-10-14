import { useState, type FormEvent } from 'react';
import type { OperationsGateway } from './gateway';
import { parseMoney } from './money';
import { useAsync } from './useAsync';

const SELECT_FIRST = 'Selecciona una ejecución registrada para asociar el costo.';

// Cost form of the Mockup admin-operacion.html (spec 003 PT-07): a cost belongs to a registered execution and the value
// is parsed from the typed text into minor units.
export function CostPanel({ gateway }: { gateway: OperationsGateway }) {
  const { state } = useAsync(gateway.listExecutions);
  const [open, setOpen] = useState(false);
  const [reservationId, setReservationId] = useState('');
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [feedback, setFeedback] = useState(SELECT_FIRST);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const cents = parseMoney(amount);
    let problem: string | undefined;
    if (!reservationId) problem = SELECT_FIRST;
    else if (!concept.trim()) problem = 'Describe el concepto del costo.';
    else if (cents === undefined) problem = 'Ingresa un valor mayor que cero.';
    setFailed(Boolean(problem));
    if (problem || cents === undefined) {
      setFeedback(problem ?? '');
      return;
    }
    setSending(true);
    try {
      await gateway.recordCost({ reservationId, concept: concept.trim(), amountCents: cents });
      setFeedback('Costo registrado.');
      setConcept('');
      setAmount('');
    } finally {
      setSending(false);
    }
  }

  const executions = state.kind === 'data' ? state.data : [];
  return (
    <section className="operator-panel" aria-labelledby="ops-costs">
      <div className="operator-panel-head">
        <div>
          <p className="operator-eyebrow">Costos operacionales</p>
          <h2 id="ops-costs">Registro real de la ejecución</h2>
        </div>
        <button type="button" className="operator-outline" onClick={() => setOpen(!open)}>
          Registrar costo
        </button>
      </div>
      <p className="operator-copy">Los costos operacionales se registran para servicios ejecutados y se diferencian del valor comercial vendido.</p>
      {open && (
        <form onSubmit={onSubmit} noValidate>
          <div className="operator-form-grid">
            <label>
              Ejecución asociada
              <select value={reservationId} onChange={(e) => setReservationId(e.target.value)}>
                <option value="">Selecciona una ejecución registrada</option>
                {executions.map((e) => (
                  <option key={e.reservationId} value={e.reservationId}>
                    {e.reservationId} · {e.service}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Concepto
              <input type="text" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Describe el costo operacional" />
            </label>
            <label>
              Valor
              <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          </div>
          <p className={failed ? 'operator-form-feedback is-error' : 'operator-form-feedback'} aria-live="polite">
            {feedback}
          </p>
          <div className="operator-form-actions">
            <button type="button" className="operator-outline" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="operator-primary" disabled={sending}>
              Registrar costo
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
