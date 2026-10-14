import type { PanelProps } from './panelProps';
import { showTime } from './panelProps';

// Panel "Trazabilidad": who did what and when on the departure (spec AC5).
export function HistoryPanel({ departure }: PanelProps) {
  return (
    <section className="operator-panel" aria-labelledby="history-title">
      <p className="operator-eyebrow">Trazabilidad</p>
      <h2 id="history-title">Historial de la salida</h2>
      {departure.history.length === 0 ? (
        <p className="operator-copy">Aún no hay registros.</p>
      ) : (
        <div className="operator-table-wrap">
          <table className="operator-table">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Responsable</th>
                <th>Acción</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {departure.history.map((entry, index) => (
                <tr key={`${entry.at}-${index}`}>
                  <td>{showTime(entry.at)}</td>
                  <td>{entry.who}</td>
                  <td>{entry.action}</td>
                  <td>{entry.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
