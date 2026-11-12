import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Forbidden, Refused, Unavailable } from '../departures/model';
import type { Departure, ReservationService } from './gateway';
import { failureText } from './panelProps';
import { useRegistration } from './useRegistration';

const MAX = 500;

// What the person reads when the cancellation failed: a refusal of the service is told as such, and the text stays in every case.
function failure(error: unknown): string {
  if (error instanceof Refused) {
    if (error.code === 'BUSINESS_RULE_VIOLATION') {
      return 'El servicio no aceptó la cancelación: la reserva ya no está en ejecución o ya fue cancelada. Tus datos siguen aquí.';
    }
    if (error.code === 'INVALID_STATUS_TRANSITION') {
      return 'El servicio no aceptó la cancelación: la salida ya no está en ejecución; vuelve a abrirla para ver cómo quedó. Tus datos siguen aquí.';
    }
  }
  if (error instanceof Unavailable) return 'El servicio no respondió y la cancelación no se registró. Tus datos siguen aquí.';
  if (error instanceof Forbidden) return failureText(error, 'la cancelación extraordinaria');
  return 'No pudimos registrar la cancelación extraordinaria. Tus datos siguen aquí.';
}

interface Props {
  code: string;
  reservation: ReservationService;
  record: (input: { code: string; reservationId: string; justification: string; key: string }) => Promise<Departure>;
  onDone: (updated: Departure) => void;
  onClose: () => void;
}

// Spec 012 (RN-OPS-PT-70 to -74): the justification of the emergency, then a confirmation that says it cannot be undone, then the send.
export function ExtraordinaryCancellationForm({ code, reservation, record, onDone, onClose }: Props) {
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const { sending, failed, error: failedWith, submit, clear } = useRegistration();
  const field = useRef<HTMLTextAreaElement>(null);
  const title = useRef<HTMLParagraphElement>(null);
  const moved = useRef(false);
  const id = `cancellation-${reservation.reservationId}`;
  const justification = text.trim();

  // the focus follows the person from the field to the confirmation and back (the element they were on is gone)
  useEffect(() => {
    if (!moved.current) return;
    (confirming ? title.current : field.current)?.focus();
  }, [confirming]);

  function next(event?: FormEvent) {
    event?.preventDefault();
    if (justification.length < 1 || justification.length > MAX) {
      setError(`Escribe la justificación de la emergencia (1 a ${MAX} caracteres).`);
      return;
    }
    setError(undefined);
    clear();
    moved.current = true;
    setConfirming(true);
  }

  async function send() {
    let updated: Departure | undefined;
    const ok = await submit(`${code}|${reservation.reservationId}|${justification}`, async (key) => {
      updated = await record({ code, reservationId: reservation.reservationId, justification, key });
    });
    if (ok && updated) onDone(updated);
  }

  if (confirming) {
    return (
      <div className="operator-form-wide" role="group" aria-labelledby={`${id}-title`}>
        <p id={`${id}-title`} ref={title} tabIndex={-1} className="operator-copy">
          Vas a cancelar la reserva de {reservation.customer}. Esta acción no se puede deshacer.
        </p>
        <p className="operator-copy">Justificación: {justification}</p>
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
            Confirmar cancelación
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
    <form className="operator-form-wide" onSubmit={next} noValidate>
      <label htmlFor={`${id}-text`}>Justificación de la cancelación extraordinaria</label>
      <textarea
        id={`${id}-text`}
        ref={field}
        value={text}
        maxLength={MAX}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => setText(e.target.value)}
      />
      <span className="operator-copy">{`${text.length}/${MAX}`}</span>
      {error && (
        <span id={`${id}-error`} role="alert" className="operator-form-feedback is-error">
          {error}
        </span>
      )}
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
