import type { ReactNode } from 'react';
import type { Execution, OperationsGateway, UpcomingDeparture } from './gateway';
import { CostPanel } from './CostPanel';
import { useAsync, type AsyncState } from './useAsync';

export interface OperationsPageProps {
  gateway: OperationsGateway;
  onRegister: (reservationId: string) => void;
}

const UPCOMING_STATUS: Record<UpcomingDeparture['status'], { label: string; className: string }> = {
  CONFIRMED: { label: 'Confirmada', className: 'operator-status is-confirmed' },
  PENDING: { label: 'Pendiente de confirmar', className: 'operator-status is-pending' },
};

const EXECUTION_STATUS: Record<Execution['status'], { label: string; className: string }> = {
  IN_PROGRESS: { label: 'En curso', className: 'operator-status is-pending' },
  FINISHED: { label: 'Finalizada', className: 'operator-status is-confirmed' },
};

// The four states of a list: loading, error with retry, empty and data.
function View<T>({ state, retry, empty, children }: { state: AsyncState<T[]>; retry: () => void; empty: string; children: (rows: T[]) => ReactNode }) {
  if (state.kind === 'loading') return <p role="status">Cargando…</p>;
  if (state.kind === 'error') {
    return (
      <div role="alert">
        <p className="operator-copy">No pudimos cargar la información.</p>
        <button type="button" className="operator-outline" onClick={retry}>
          Reintentar
        </button>
      </div>
    );
  }
  if (state.data.length === 0) return <p className="operator-copy">{empty}</p>;
  return <>{children(state.data)}</>;
}

// Page of the Mockup admin-operacion.html (spec 001 PT-03 and PT-04) over the test data of the gateway port.
export function OperationsPage({ gateway, onRegister }: OperationsPageProps) {
  const upcoming = useAsync(gateway.listUpcoming);
  const executions = useAsync(gateway.listExecutions);

  async function finalize(reservationId: string) {
    const done = await gateway.finalizeExecution(reservationId);
    if (executions.state.kind === 'data') {
      executions.set(executions.state.data.map((e) => (e.reservationId === done.reservationId ? done : e)));
    }
  }

  return (
    <div className="operator-content">
      <header className="operator-topbar">
        <div>
          <p className="operator-eyebrow">Seguimiento real</p>
          <h1>Operación y costos</h1>
        </div>
      </header>
      <section className="operator-hero operator-hero-compact">
        <div>
          <p className="operator-eyebrow">Antes de la salida</p>
          <h2>Lo reservado y lo prestado deben mantenerse diferenciados.</h2>
        </div>
        <p>Registra servicios prestados, novedades y costos reales sin alterar la proyección comercial.</p>
        <p className="operator-eyebrow">Datos de prueba</p>
      </section>

      <section className="operator-panel" aria-labelledby="ops-upcoming">
        <div className="operator-panel-head">
          <div>
            <p className="operator-eyebrow">Próximas ejecuciones</p>
            <h2 id="ops-upcoming">Salidas por preparar</h2>
          </div>
        </div>
        <View state={upcoming.state} retry={upcoming.retry} empty="No hay próximas ejecuciones pendientes de preparar.">
          {(rows) => (
            <div className="operator-table-wrap">
              <table className="operator-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Servicio</th>
                    <th>Reserva</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.reservationId}>
                      <td>{row.date}</td>
                      <td>{row.service}</td>
                      <td>{row.reservationId}</td>
                      <td>
                        <span className={UPCOMING_STATUS[row.status].className}>{UPCOMING_STATUS[row.status].label}</span>
                      </td>
                      <td>
                        {row.status === 'CONFIRMED' && (
                          <button type="button" className="operator-outline" onClick={() => onRegister(row.reservationId)}>
                            Registrar ejecución
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </View>
      </section>

      <section className="operator-panel" aria-labelledby="ops-executions">
        <div className="operator-panel-head">
          <div>
            <p className="operator-eyebrow">Trazabilidad</p>
            <h2 id="ops-executions">Ejecuciones registradas</h2>
          </div>
        </div>
        <View state={executions.state} retry={executions.retry} empty="Aún no se han registrado ejecuciones.">
          {(rows) => (
            <div className="operator-table-wrap">
              <table className="operator-table">
                <thead>
                  <tr>
                    <th>Reserva</th>
                    <th>Fecha</th>
                    <th>Servicio</th>
                    <th>Reservado</th>
                    <th>Ejecutado</th>
                    <th>Causal</th>
                    <th>Estado</th>
                    <th>Responsable</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.reservationId}>
                      <td>{row.reservationId}</td>
                      <td>{row.date}</td>
                      <td>{row.service}</td>
                      <td>{row.reserved}</td>
                      <td>{row.executed}</td>
                      <td>{row.cause}</td>
                      <td>
                        <span className={EXECUTION_STATUS[row.status].className}>{EXECUTION_STATUS[row.status].label}</span>
                      </td>
                      <td>{row.responsible}</td>
                      <td>
                        {row.status === 'IN_PROGRESS' && (
                          <button type="button" className="operator-outline" onClick={() => void finalize(row.reservationId)}>
                            Finalizar ejecución
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </View>
      </section>

      <CostPanel gateway={gateway} />
    </div>
  );
}
