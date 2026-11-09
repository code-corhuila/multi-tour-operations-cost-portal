import type { DepartureStatus } from './gateway';
import type { PanelProps } from './panelProps';
import { showTime } from './panelProps';

const STATUS: Record<DepartureStatus, { label: string; className: string }> = {
  SCHEDULED: { label: 'Programada', className: 'operator-status is-pending' },
  IN_EXECUTION: { label: 'En ejecución', className: 'operator-status is-confirmed' },
  FINISHED: { label: 'Finalizada', className: 'operator-status is-active' },
  CANCELLED: { label: 'Cancelada', className: 'operator-status is-failed' },
};

// Panel "Salida" of the Mockup: the data of the departure, read only.
export function DeparturePanel({ departure }: PanelProps) {
  const status = STATUS[departure.status];
  const items: [string, string][] = [
    ['Vehículos asignados', departure.vehicles.length ? departure.vehicles.join(', ') : '—'],
    ['Capacidad y cupos', `${departure.capacity} cupos · ${departure.booked} reservados`],
    ['Inicio real', showTime(departure.actualStart)],
    ['Finalización real', showTime(departure.actualEnd)],
    ['Marca', departure.mark],
    ...(departure.interruptionCause ? ([['Causa de la interrupción', departure.interruptionCause]] as [string, string][]) : []),
  ];
  return (
    <section className="operator-panel" aria-labelledby="departure-title">
      <div className="operator-panel-head">
        <div>
          <p className="operator-eyebrow">Salida</p>
          <h2 id="departure-title">{departure.code}</h2>
        </div>
        <span className={status.className}>{status.label}</span>
        {departure.pendingRegularization && <span className="operator-status is-failed">Pendiente de regularización</span>}
      </div>
      {departure.startAlert && (
        <p role="alert" className="operator-form-feedback is-error">
          La hora programada de inicio ya pasó y nadie registró el inicio. Registra el inicio real cuando ocurra.
        </p>
      )}
      <ul className="operator-detail-list">
        {items.map(([label, value]) => (
          <li key={label}>
            <span className="operator-eyebrow">{label}</span> <strong>{value}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
