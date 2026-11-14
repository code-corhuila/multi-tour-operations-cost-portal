import { useEffect, useRef, useState } from 'react';
import { Forbidden, Refused, Unavailable } from '../departures/model';
import type { Departure } from './gateway';
import type { PanelProps } from './panelProps';
import { useRegistration } from './useRegistration';

// What the person reads when the request failed: a refusal of the service is told as such and nothing the person did is lost.
function failure(error: unknown): string {
  if (error instanceof Refused) {
    return 'El servicio no aceptó la cancelación: la salida ya no está programada; vuelve a abrirla para ver cómo quedó. Tus datos siguen aquí.';
  }
  if (error instanceof Forbidden) return 'Solo el Administrador cancela una salida. Tus datos siguen aquí.';
  if (error instanceof Unavailable) return 'No pudimos confirmar si la cancelación se pidió: el servicio no respondió. Reintentar es seguro. Tus datos siguen aquí.';
  return 'No pudimos pedir la cancelación. Tus datos siguen aquí.';
}

// Panel "Cancelar salida" (HU-OPS-006, spec 013 AC-PT-13.1 to -13.3): only the Administrator, only on a scheduled departure, with a
// confirmation inside the panel that says it cannot be undone. The request goes to the saga; its answer may be "running", so the
// departure that comes back says what it is now (D-02). The key is per departure, so a retry after a lost answer reuses it (D-04).
export function CancelDeparturePanel({ departure, gateway, canSchedule, onChanged }: PanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [inCourse, setInCourse] = useState(false);
  const { sending, failed, error, submit, clear } = useRegistration();
  const title = useRef<HTMLParagraphElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const moved = useRef(false);

  // the focus follows the person: into the confirmation, and back to the action or to the notice when they leave it (the element they were on is gone)
  useEffect(() => {
    if (!moved.current) return;
    (confirming ? title.current : (trigger.current ?? status.current))?.focus();
  }, [confirming, inCourse]);

  const cancel = gateway.cancelDeparture;
  if (!canSchedule || !cancel || departure.status !== 'SCHEDULED') return null;

  async function send() {
    let updated: Departure | undefined;
    const ok = await submit(departure.code, async (key) => {
      updated = await cancel!({ code: departure.code, key });
    });
    if (!ok || !updated) return;
    setConfirming(false);
    setInCourse(updated.status === 'SCHEDULED');
    onChanged(updated);
  }

  return (
    <section className="operator-panel" aria-labelledby="cancel-title">
      <p className="operator-eyebrow">Cancelación</p>
      <h2 id="cancel-title">Cancelar salida</h2>
      <p role="status" ref={status} tabIndex={-1} className="operator-copy">
        {inCourse ? 'La cancelación está en curso. Vuelve a abrir la salida en unos segundos para ver cómo quedó.' : ''}
      </p>
      {confirming ? (
        <div role="group" aria-labelledby="cancel-confirm">
          <p id="cancel-confirm" ref={title} tabIndex={-1} className="operator-copy">
            Vas a cancelar la salida {departure.code}. Esta acción no se puede deshacer. Sus reservas serán reprogramadas o reembolsadas al 100 %, porque la
            causa no es atribuible al cliente.
          </p>
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
              <p className="operator-form-feedback is-error">{failure(error)}</p>
              <button type="button" className="operator-outline" disabled={sending} onClick={() => void send()}>
                Reintentar
              </button>
            </div>
          )}
        </div>
      ) : (
        !inCourse && (
          <>
            <p className="operator-copy">Cancela una salida programada. Se ejecuta como proceso: las reservas de la salida se atienden una por una.</p>
            <button
              type="button"
              ref={trigger}
              className="operator-outline"
              onClick={() => {
                moved.current = true;
                setConfirming(true);
              }}
            >
              Cancelar salida
            </button>
          </>
        )
      )}
    </section>
  );
}
