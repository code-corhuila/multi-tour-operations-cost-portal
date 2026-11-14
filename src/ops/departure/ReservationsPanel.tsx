import { useEffect, useState } from 'react';
import type { Departure, ReservationService, ReservationState, ServiceResult, ServicesInput } from './gateway';
import { ExtraordinaryCancellationForm } from './ExtraordinaryCancellationForm';
import { PersonalEmergencyForm } from './PersonalEmergencyForm';
import type { PanelProps } from './panelProps';
import { showTime } from './panelProps';
import { useRegistration } from './useRegistration';

const STATE: Record<ReservationState, { label: string; className: string }> = {
  ELIGIBLE: { label: 'Elegible para iniciar', className: 'operator-status is-confirmed' },
  NOT_ELIGIBLE: { label: 'No elegible (pago pendiente)', className: 'operator-status is-pending' },
  IN_EXECUTION: { label: 'Reserva en ejecución', className: 'operator-status is-confirmed' },
  FINISHED: { label: 'Reserva finalizada', className: 'operator-status is-active' },
  CANCELLED: { label: 'Cancelada por incumplimiento de pago', className: 'operator-status is-failed' },
};

// A reservation cancelled extraordinarily is not one cancelled for a missing payment (spec 012 AC-PT-12.1).
const EXTRAORDINARY = { label: 'Cancelada por emergencia (cancelación extraordinaria)', className: 'operator-status is-failed' };

interface Row {
  result: ServiceResult;
  served: string;
  cause: string;
  noShow: boolean;
}
type Draft = Record<string, Row>;
type RowErrors = { served?: string; cause?: string };

// What a reservation starts with: what was already recorded, or all of its travelers served.
const initialRow = (r: ReservationService): Row => ({
  result: r.result ?? 'DELIVERED',
  served: String(r.travelersServed ?? (r.result === 'NOT_DELIVERED' ? 0 : r.travelers)),
  cause: r.cause ?? '',
  noShow: r.noShow ?? false,
});

// The personal emergency recorded for a reservation, if there is one (HU-OPS-008): it does not change the state of the reservation.
const emergencyOf = (departure: PanelProps['departure'], reservationId: string) =>
  departure.novelties.find((n) => n.type === 'Emergencia personal' && n.reservationId === reservationId);

// Panel "Reservas de la salida": the reserved numbers stay visible next to what was delivered (RN-OPS-PT-34, -35).
export function ReservationsPanel({ departure, gateway, canManage, onChanged }: PanelProps) {
  // only the rows the person edited are kept here; the rest start from what the departure says
  const [draft, setDraft] = useState<Draft>({});
  const [errors, setErrors] = useState<Record<string, RowErrors>>({});
  const [saved, setSaved] = useState(false);
  const [rereading, setRereading] = useState(false);
  const [rereadFailed, setRereadFailed] = useState(false);
  // the reservation whose extraordinary cancellation form is open (spec 012)
  const [cancelling, setCancelling] = useState<string>();
  // the reservation whose personal emergency form is open (spec 014); only one of the two forms is open at a time
  const [reporting, setReporting] = useState<string>();
  // a form of the panel has a send pending: no other form is opened over it, or its answer would be lost
  const [formBusy, setFormBusy] = useState(false);
  // the action that gets the focus back when its form is closed
  const [returnFocus, setReturnFocus] = useState<string>();
  useEffect(() => {
    if (returnFocus === undefined || cancelling !== undefined || reporting !== undefined) return;
    document.getElementById(returnFocus)?.focus();
    setReturnFocus(undefined);
  }, [returnFocus, cancelling, reporting]);
  const { sending, failed, submit } = useRegistration();
  const editable = departure.status === 'IN_EXECUTION';
  const locked = !canManage || sending;
  const rowOf = (r: ReservationService): Row => draft[r.reservationId] ?? initialRow(r);
  const edit = (r: ReservationService, change: Partial<Row>) => setDraft({ ...draft, [r.reservationId]: { ...rowOf(r), ...change } });

  async function reread() {
    setRereading(true);
    setRereadFailed(false);
    try {
      const again = await gateway.getDeparture(departure.code);
      if (again) onChanged(again);
      else setRereadFailed(true);
    } catch {
      setRereadFailed(true);
    } finally {
      setRereading(false);
    }
  }

  async function save() {
    const next: Record<string, RowErrors> = {};
    const entries: ServicesInput['entries'] = [];
    for (const r of departure.reservations.filter((x) => x.state === 'IN_EXECUTION')) {
      const row = rowOf(r);
      const delivered = row.result === 'DELIVERED';
      const served = delivered ? Number(row.served) : 0;
      const found: RowErrors = {};
      if (delivered && (!Number.isInteger(served) || served < 1 || served > r.travelers)) {
        found.served = `Los viajeros atendidos van de 1 a ${r.travelers}.`;
      } else if (served < r.travelers && !row.cause.trim()) {
        found.cause = delivered ? 'Indica la causal de los viajeros que no se atendieron.' : 'La causal es obligatoria para un servicio no prestado.';
      }
      if (found.served || found.cause) next[r.reservationId] = found;
      const cause = served < r.travelers ? row.cause.trim() : '';
      entries.push({ reservationId: r.reservationId, result: row.result, travelersServed: served, noShow: row.noShow, cause });
    }
    setErrors(next);
    setSaved(false);
    if (Object.keys(next).length > 0) return;
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
        Se registran los servicios prestados y no prestados con su causal obligatoria; la diferencia frente a la proyección inicial permanece visible. Si una
        persona no se presenta y no hubo aviso oportuno, el guía puede conceder hasta 10 minutos antes de iniciar; transcurridos, el servicio se mantiene
        cobrado. Una vez iniciada la salida no se permiten ajustes ordinarios.
      </p>
      {departure.reservationsUnavailable ? (
        <div role="alert">
          <p className="operator-form-feedback is-error">No se pudieron leer las reservas de esta salida.</p>
          {rereadFailed && <p className="operator-form-feedback is-error">Tampoco pudimos volver a leerlas. Intenta de nuevo.</p>}
          <button type="button" className="operator-outline" disabled={rereading} onClick={() => void reread()}>
            Reintentar
          </button>
        </div>
      ) : (
        departure.reservations.length === 0 && <p className="operator-copy">Esta salida no tiene reservas.</p>
      )}
      {departure.reservations.map((r) => {
        const state = r.extraordinaryCancellation && r.state === 'CANCELLED' ? EXTRAORDINARY : STATE[r.state];
        const row = rowOf(r);
        const rowErrors = errors[r.reservationId] ?? {};
        const rowEditable = editable && r.state === 'IN_EXECUTION';
        const emergency = emergencyOf(departure, r.reservationId);
        const executed = r.travelersServed ?? (r.result === 'DELIVERED' ? r.travelers : 0);
        return (
          <article key={r.reservationId} className="operator-form-wide">
            <p>
              <strong>
                #{r.reservationId} · {r.customer} · {r.travelers} viajeros
              </strong>{' '}
              <span className={state.className}>{state.label}</span>
            </p>
            {r.service && <p className="operator-copy">{r.service}</p>}
            {rowEditable && (
              <div className="operator-form-grid">
                <div>
                  <label htmlFor={`result-${r.reservationId}`}>Resultado</label>
                  <select
                    id={`result-${r.reservationId}`}
                    value={row.result}
                    disabled={locked}
                    onChange={(e) => {
                      const result = e.target.value as ServiceResult;
                      edit(r, result === 'DELIVERED' ? { result, served: String(r.travelers), noShow: false } : { result, served: '0' });
                    }}
                  >
                    <option value="DELIVERED">Prestado</option>
                    <option value="NOT_DELIVERED">No prestado</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={`served-${r.reservationId}`}>Viajeros atendidos</label>
                  <input
                    id={`served-${r.reservationId}`}
                    type="number"
                    min={0}
                    max={r.travelers}
                    value={row.result === 'DELIVERED' ? row.served : 0}
                    disabled={locked || row.result === 'NOT_DELIVERED'}
                    aria-invalid={rowErrors.served ? true : undefined}
                    aria-describedby={rowErrors.served ? `served-error-${r.reservationId}` : undefined}
                    onChange={(e) => edit(r, { served: e.target.value })}
                  />
                  {rowErrors.served && (
                    <span id={`served-error-${r.reservationId}`} className="operator-form-feedback is-error">
                      {rowErrors.served}
                    </span>
                  )}
                </div>
                <div>
                  <label htmlFor={`cause-${r.reservationId}`}>Causal si no se prestó</label>
                  <input
                    id={`cause-${r.reservationId}`}
                    value={row.cause}
                    maxLength={500}
                    disabled={locked}
                    aria-invalid={rowErrors.cause ? true : undefined}
                    aria-describedby={rowErrors.cause ? `cause-error-${r.reservationId}` : undefined}
                    onChange={(e) => edit(r, { cause: e.target.value })}
                  />
                  {rowErrors.cause && (
                    <span id={`cause-error-${r.reservationId}`} className="operator-form-feedback is-error">
                      {rowErrors.cause}
                    </span>
                  )}
                </div>
                <div>
                  <label htmlFor={`noshow-${r.reservationId}`}>
                    <input
                      id={`noshow-${r.reservationId}`}
                      type="checkbox"
                      checked={row.noShow}
                      disabled={locked}
                      onChange={(e) =>
                        edit(r, e.target.checked ? { noShow: true, result: 'NOT_DELIVERED', served: '0' } : { noShow: false, result: 'DELIVERED', served: String(r.travelers) })
                      }
                    />{' '}
                    No se presentó sin aviso oportuno
                  </label>
                  {row.noShow && <p className="operator-copy">El servicio se mantiene cobrado.</p>}
                </div>
              </div>
            )}
            {r.extraordinaryCancellation && (
              <div role="group" aria-label={`Cancelación extraordinaria de ${r.customer}`}>
                <p className="operator-copy">
                  {`Cancelación extraordinaria: ${r.extraordinaryCancellation.justification}`}
                  {` · ${showTime(r.extraordinaryCancellation.recordedAt)} · cuenta ${r.extraordinaryCancellation.recordedBy}`}
                </p>
                <p className="operator-copy">La decisión de reprogramar o reembolsar queda pendiente.</p>
              </div>
            )}
            {canManage &&
              rowEditable &&
              !r.extraordinaryCancellation &&
              (cancelling === r.reservationId ? (
                <ExtraordinaryCancellationForm
                  code={departure.code}
                  reservation={r}
                  record={(input) => gateway.recordExtraordinaryCancellation(input)}
                  onBusy={setFormBusy}
                  onDone={(updated) => {
                    setCancelling(undefined);
                    onChanged(updated);
                  }}
                  onClose={() => {
                    setCancelling(undefined);
                    setReturnFocus(`open-cancellation-${r.reservationId}`);
                  }}
                />
              ) : (
                <button
                  id={`open-cancellation-${r.reservationId}`}
                  type="button"
                  className="operator-outline"
                  disabled={sending || formBusy}
                  onClick={() => {
                    setReporting(undefined);
                    setCancelling(r.reservationId);
                  }}
                >
                  Cancelación extraordinaria
                </button>
              ))}
            {emergency && (
              <div role="group" aria-label={`Emergencia personal de ${r.customer}`}>
                <p className="operator-copy">
                  {`Emergencia personal: ${emergency.detail}`}
                  {emergency.affected === undefined ? '' : ` · ${emergency.affected} ${emergency.affected === 1 ? 'viajero' : 'viajeros'}`}
                  {` · ${showTime(emergency.at)} · cuenta ${emergency.who}`}
                </p>
                {r.state === 'IN_EXECUTION' && !r.extraordinaryCancellation && (
                  <p className="operator-copy">La reserva sigue en ejecución; el reembolso que corresponda lo determina el sistema.</p>
                )}
              </div>
            )}
            {canManage &&
              rowEditable &&
              !r.extraordinaryCancellation &&
              !emergency &&
              (reporting === r.reservationId ? (
                <PersonalEmergencyForm
                  code={departure.code}
                  reservation={r}
                  record={(input) => gateway.registerNovelty({ ...input, emergency: true })}
                  onBusy={setFormBusy}
                  onDone={(updated) => {
                    setReporting(undefined);
                    onChanged(updated);
                  }}
                  onClose={() => {
                    setReporting(undefined);
                    setReturnFocus(`open-emergency-${r.reservationId}`);
                  }}
                />
              ) : (
                <button
                  id={`open-emergency-${r.reservationId}`}
                  type="button"
                  className="operator-outline"
                  disabled={sending || formBusy}
                  onClick={() => {
                    setCancelling(undefined);
                    setReporting(r.reservationId);
                  }}
                >
                  Emergencia personal
                </button>
              ))}
            {r.result && (
              <p className="operator-copy">
                {`Reservado: ${r.travelers} · Ejecutado: ${executed}`}
                {r.result === 'NOT_DELIVERED' && r.cause ? ` · No prestado: ${r.cause}` : ''}
                {r.noShow ? ' · Sin aviso: el servicio se mantiene cobrado' : ''}
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
      {saved && (
        <p role="status" className="operator-form-feedback">
          Servicios guardados.
        </p>
      )}
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
