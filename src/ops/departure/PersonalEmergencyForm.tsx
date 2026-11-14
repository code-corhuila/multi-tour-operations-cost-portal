import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Forbidden, Refused, Unavailable } from '../departures/model';
import type { Departure, ReservationService } from './gateway';
import { failureText } from './panelProps';
import { useRegistration } from './useRegistration';

const MAX = 1000;

// What the person reads when the record failed: a refusal of the service is told as such, and the data stay in every case.
function failure(error: unknown): string {
  if (error instanceof Refused) {
    return error.code === 'INVALID_STATUS_TRANSITION'
      ? 'El servicio no aceptó la emergencia: la salida ya no está en ejecución; vuelve a abrirla para ver cómo quedó. Tus datos siguen aquí.'
      : 'El servicio no aceptó la emergencia: la reserva ya no está en ejecución o ya tiene una emergencia. Tus datos siguen aquí.';
  }
  if (error instanceof Unavailable) return 'No pudimos confirmar si la emergencia se registró: el servicio no respondió. Reintentar es seguro. Tus datos siguen aquí.';
  if (error instanceof Forbidden) return failureText(error, 'la emergencia personal');
  return 'No pudimos registrar la emergencia personal. Tus datos siguen aquí.';
}

interface Props {
  code: string;
  reservation: ReservationService;
  record: (input: { code: string; reservationId: string; affected: number; detail: string; key: string }) => Promise<Departure>;
  onDone: (updated: Departure) => void;
  onClose: () => void;
  // tells the panel that a send is pending, so no other form is opened over it
  onBusy?: (busy: boolean) => void;
}

// Spec 014 (AC-PT-14.1 to -14.6): the travelers who cannot continue and what happened, then a confirmation that says the reservation is
// not cancelled and that the record cannot be undone, then the send. The service has the last word on the data (the amount of the refund
// is not shown here: it is decided on the reservations side).
export function PersonalEmergencyForm({ code, reservation, record, onDone, onClose, onBusy }: Props) {
  const [travelers, setTravelers] = useState('');
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [errors, setErrors] = useState<{ travelers?: string; detail?: string }>({});
  const { sending, failed, error: failedWith, submit, clear } = useRegistration();
  const field = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLParagraphElement>(null);
  const moved = useRef(false);
  const id = `emergency-${reservation.reservationId}`;
  const detail = text.trim();
  const affected = Number(travelers);

  useEffect(() => {
    onBusy?.(sending);
    return () => onBusy?.(false);
  }, [sending, onBusy]);

  // the focus follows the person from the field to the confirmation and back (the element they were on is gone)
  useEffect(() => {
    if (!moved.current) return;
    (confirming ? title.current : field.current)?.focus();
  }, [confirming]);

  function next(event?: FormEvent) {
    event?.preventDefault();
    const found: { travelers?: string; detail?: string } = {};
    if (!/^[0-9]+$/.test(travelers.trim()) || affected < 1 || affected > reservation.travelers) {
      found.travelers = `Indica cuántos viajeros no pueden continuar (de 1 a ${reservation.travelers}).`;
    }
    if (detail.length < 1 || detail.length > MAX) found.detail = `Escribe qué ocurrió (1 a ${MAX} caracteres).`;
    setErrors(found);
    if (found.travelers || found.detail) return;
    clear();
    moved.current = true;
    setConfirming(true);
  }

  async function send() {
    let updated: Departure | undefined;
    const ok = await submit(`${code}|${reservation.reservationId}|${affected}|${detail}`, async (key) => {
      updated = await record({ code, reservationId: reservation.reservationId, affected, detail, key });
    });
    if (ok && updated) onDone(updated);
  }

  if (confirming) {
    return (
      <div className="operator-form-wide" role="group" aria-labelledby={`${id}-title`}>
        <p id={`${id}-title`} ref={title} tabIndex={-1} className="operator-copy">
          Vas a registrar la emergencia personal de {affected} {affected === 1 ? 'viajero' : 'viajeros'} de {reservation.customer}. La reserva no se cancela: el
          sistema determina el reembolso que corresponda. Esta acción no se puede deshacer.
        </p>
        <p className="operator-copy">Qué ocurrió: {detail}</p>
        <div className="operator-form-actions">
          <button
            type="button"
            className="operator-outline"
            disabled={sending}
            onClick={() => {
              clear();
              setConfirming(false);
            }}
          >
            Volver
          </button>
          <button type="button" className="operator-primary" disabled={sending} onClick={() => void send()}>
            Confirmar emergencia
          </button>
        </div>
        {failed && (
          <div role="alert">
            <p className="operator-form-feedback is-error">{failure(failedWith)}</p>
            <button type="button" className="operator-outline" disabled={sending} onClick={() => void send()}>
              Reintentar
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form className="operator-form-grid" onSubmit={next} noValidate>
      <div className="operator-form-wide">
        <label htmlFor={`${id}-travelers`}>Viajeros que no pueden continuar</label>
        <input
          id={`${id}-travelers`}
          ref={field}
          type="text"
          inputMode="numeric"
          value={travelers}
          aria-invalid={errors.travelers ? true : undefined}
          aria-describedby={errors.travelers ? `${id}-travelers-error` : undefined}
          onChange={(e) => setTravelers(e.target.value)}
        />
        {errors.travelers && (
          <p id={`${id}-travelers-error`} role="alert" className="operator-form-feedback is-error">
            {errors.travelers}
          </p>
        )}
      </div>
      <div className="operator-form-wide">
        <label htmlFor={`${id}-detail`}>Qué ocurrió</label>
        <textarea
          id={`${id}-detail`}
          value={text}
          maxLength={MAX}
          aria-invalid={errors.detail ? true : undefined}
          aria-describedby={errors.detail ? `${id}-detail-error` : undefined}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="operator-copy">{`${text.length}/${MAX}`}</p>
        {errors.detail && (
          <p id={`${id}-detail-error`} role="alert" className="operator-form-feedback is-error">
            {errors.detail}
          </p>
        )}
      </div>
      <div className="operator-form-actions">
        <button type="button" className="operator-outline" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="operator-primary">
          Continuar
        </button>
      </div>
    </form>
  );
}
