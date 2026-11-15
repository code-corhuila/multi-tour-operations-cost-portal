import type { DepartureStatus } from './gateway';
import type { PanelProps } from './panelProps';
import { showTime } from './panelProps';

const STATUS: Record<DepartureStatus, { label: string; className: string }> = {
  SCHEDULED: { label: 'Programada', className: 'operator-status is-pending' },
  IN_EXECUTION: { label: 'En ejecución', className: 'operator-status is-confirmed' },
  FINISHED: { label: 'Finalizada', className: 'operator-status is-active' },
  CANCELLED: { label: 'Cancelada', className: 'operator-status is-failed' },
};

const reserved = (d: PanelProps['departure']) =>
  d.reservations.filter((r) => r.state === 'IN_EXECUTION' || r.state === 'FINISHED').reduce((sum, r) => sum + r.travelers, 0);

// Panel "Salida" of the Mockup: the data of the departure, read only.
export function DeparturePanel({ departure }: PanelProps) {
  const status = STATUS[departure.status];
  const items: [string, string][] = [
    ['Vehículos asignados', departure.vehicles.length ? departure.vehicles.join(', ') : '—'],
    ['Capacidad y cupos', `${departure.capacity} cupos · ${departure.booked} reservados`],
    // the real base: the travelers served out of those reserved by the reservations that run or ran (AC-PT-10.4)
    ...(departure.travelersServed === undefined || departure.reservationsUnavailable
      ? []
      : ([['Atendidos', `${departure.travelersServed} de ${reserved(departure)} reservados`]] as [string, string][])),
    ['Inicio real', showTime(departure.actualStart)],
    ['Finalización real', showTime(departure.actualEnd)],
    // the badge already says that the departure is pending regularization: it is not said twice
    ...(departure.pendingRegularization ? [] : ([['Marca', departure.mark]] as [string, string][])),
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
