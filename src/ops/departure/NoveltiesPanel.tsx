import { useState, type FormEvent } from 'react';
import type { Departure } from './gateway';
import type { PanelProps } from './panelProps';
import { showTime } from './panelProps';
import { useRegistration } from './useRegistration';

// Panel "Novedades de ejecución": a novelty needs its text; the affected travelers exist only with the personal
// emergency and are an integer from 1 to the reserved ones (RN-OPS-PT-36). The refund is not computed here.
export function NoveltiesPanel({ departure, gateway, canManage, onChanged }: PanelProps) {
  const reservations = departure.reservations;
  const [reservationId, setReservationId] = useState(reservations[0]?.reservationId ?? '');
  const [detail, setDetail] = useState('');
  const [emergency, setEmergency] = useState(false);
  const [affected, setAffected] = useState('');
  const [errors, setErrors] = useState<{ detail?: string; affected?: string }>({});
  const { sending, failed, submit } = useRegistration();
  const canRecord = departure.status === 'IN_EXECUTION';
  const locked = !canManage || sending;
  const reserved = reservations.find((r) => r.reservationId === reservationId)?.travelers ?? 0;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const next: typeof errors = {};
    if (!detail.trim()) next.detail = 'Ingresa la novedad.';
    const count = Number(affected);
    if (emergency && !(Number.isInteger(count) && count >= 1 && count <= reserved)) next.affected = `Ingresa un número entero de 1 a ${reserved}.`;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    let updated: Departure | undefined;
    const ok = await submit(`${departure.code}|${reservationId}|${detail.trim()}|${emergency}|${affected}`, async (key) => {
      updated = await gateway.registerNovelty({ code: departure.code, reservationId, detail: detail.trim(), emergency, affected: emergency ? count : undefined, key });
    });
    if (ok && updated) {
      setDetail('');
      setEmergency(false);
      setAffected('');
      onChanged(updated);
    }
  }

  return (
    <section className="operator-panel" aria-labelledby="novelties-title">
      <p className="operator-eyebrow">Novedades de ejecución</p>
      <h2 id="novelties-title">Novedades y emergencia personal del cliente</h2>
      <p className="operator-copy">
        La emergencia personal no cancela la reserva ni genera devolución por sí misma: al registrarla, Multitour calcula de inmediato
        el monto reembolsable con la política vigente del servicio. Si es $0, la reserva continúa hasta Finalizada; si es mayor que
        $0, la devolución queda determinada y autorizada automáticamente, pendiente de ejecución en máximo 5 días hábiles.
      </p>
      {canRecord && (
        <form className="operator-form-grid" onSubmit={send} noValidate>
          <div>
            <label htmlFor="novelty-reservation">Reserva afectada</label>
            <select id="novelty-reservation" value={reservationId} disabled={locked} onChange={(e) => setReservationId(e.target.value)}>
              {reservations.map((r) => (
                <option key={r.reservationId} value={r.reservationId}>
                  {r.reservationId} · {r.customer}
                </option>
              ))}
            </select>
          </div>
          <div className="operator-form-wide">
            <label htmlFor="novelty-detail">Novedad</label>
            <textarea
              id="novelty-detail"
              value={detail}
              disabled={locked}
              aria-invalid={errors.detail ? true : undefined}
              aria-describedby={errors.detail ? 'novelty-detail-error' : undefined}
              onChange={(e) => setDetail(e.target.value)}
            />
            {errors.detail && (
              <span id="novelty-detail-error" className="operator-form-feedback is-error">
                {errors.detail}
              </span>
            )}
          </div>
          <div>
            <label htmlFor="novelty-emergency">
              <input id="novelty-emergency" type="checkbox" checked={emergency} disabled={locked} onChange={(e) => setEmergency(e.target.checked)} />{' '}
              Emergencia personal del cliente (calcula el reembolso según la política vigente)
            </label>
          </div>
          {emergency && (
            <div>
              <label htmlFor="novelty-affected">Viajeros afectados</label>
              <input
                id="novelty-affected"
                type="number"
                min={1}
                value={affected}
                disabled={locked}
                aria-invalid={errors.affected ? true : undefined}
                aria-describedby={errors.affected ? 'novelty-affected-error' : undefined}
                onChange={(e) => setAffected(e.target.value)}
              />
              {errors.affected && (
                <span id="novelty-affected-error" className="operator-form-feedback is-error">
                  {errors.affected}
                </span>
              )}
            </div>
          )}
          <div className="operator-form-actions">
            <button type="submit" className="operator-primary" disabled={locked}>
              Registrar novedad
            </button>
          </div>
        </form>
      )}
      {failed && (
        <div role="alert">
          <p className="operator-form-feedback is-error">No pudimos registrar la novedad. Tus datos siguen aquí.</p>
          <button type="button" className="operator-outline" disabled={locked} onClick={() => void send()}>
            Reintentar
          </button>
        </div>
      )}
      {departure.novelties.length === 0 ? (
        <p className="operator-copy">Aún no hay novedades.</p>
      ) : (
        <div className="operator-table-wrap">
          <table className="operator-table">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Tipo</th>
                <th>Detalle</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {departure.novelties.map((n, index) => (
                <tr key={`${n.at}-${index}`}>
                  <td>{showTime(n.at)}</td>
                  <td>{n.type}</td>
                  <td>{n.detail}</td>
                  <td>{n.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
