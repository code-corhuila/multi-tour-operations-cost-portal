import type { PanelProps } from './panelProps';
import { showTime } from './panelProps';

// Panel "Cancelación" of a cancelled departure (HU-OPS-006, spec 013 AC-PT-13.5): when, by whom when it says so and why. It offers no
// action over the departure: a cancellation is final (CA-029). It is drawn only when the service sent the record.
export function CancellationRecord({ departure }: PanelProps) {
  const cancellation = departure.cancellation;
  if (!cancellation) return null;
  const why = cancellation.cause === 'NOT_CARRIED_OUT' ? (cancellation.reason ?? 'La salida no se realizó') : 'Causa no atribuible al cliente';
  return (
    <section className="operator-panel" aria-labelledby="cancellation-title">
      <p className="operator-eyebrow">Salida cancelada</p>
      <h2 id="cancellation-title">Cancelación</h2>
      <ul className="operator-detail-list">
        <li>
          <span className="operator-eyebrow">Cancelada el</span> <strong>{showTime(cancellation.at)}</strong>
        </li>
        {cancellation.by && (
          <li>
            <span className="operator-eyebrow">Solicitada por</span> <strong>{cancellation.by}</strong>
          </li>
        )}
        <li>
          <span className="operator-eyebrow">Motivo</span> <strong>{why}</strong>
        </li>
      </ul>
    </section>
  );
}
