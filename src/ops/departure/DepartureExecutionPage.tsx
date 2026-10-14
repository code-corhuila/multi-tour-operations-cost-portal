import { useMemo, type ComponentType } from 'react';
import { useAsync } from '../useAsync';
import { DeparturePanel } from './DeparturePanel';
import type { DepartureExecutionGateway } from './gateway';
import { HistoryPanel } from './HistoryPanel';
import { panelsFor, type PanelId } from './panels';
import type { PanelProps } from './panelProps';
import { StartPanel } from './StartPanel';

// Panels already drawn; each task adds its own entries (a panel the status asks for and not drawn yet is skipped).
const DRAWN: Partial<Record<PanelId, ComponentType<PanelProps>>> = {
  departure: DeparturePanel,
  start: StartPanel,
  history: HistoryPanel,
};

interface Props {
  gateway: DepartureExecutionGateway;
  code: string;
  canManage: boolean;
  onBack: () => void;
}

// Page of the Mockup admin-registrar-ejecucion.html (spec 004): the whole life of one departure in one place.
export function DepartureExecutionPage({ gateway, code, canManage, onBack }: Props) {
  const load = useMemo(() => () => gateway.getDeparture(code), [gateway, code]);
  const { state, retry, set } = useAsync(load);

  let body;
  if (state.kind === 'loading') body = <p role="status">Cargando…</p>;
  else if (state.kind === 'error') {
    body = (
      <div role="alert">
        <p className="operator-copy">No pudimos cargar la salida.</p>
        <button type="button" className="operator-outline" onClick={retry}>
          Reintentar
        </button>
      </div>
    );
  } else if (!state.data) body = <p className="operator-copy">No encontramos esta salida.</p>;
  else {
    const departure = state.data;
    body = panelsFor(departure.status).map((id) => {
      const Panel = DRAWN[id];
      return Panel && <Panel key={id} departure={departure} gateway={gateway} canManage={canManage} onChanged={set} />;
    });
  }

  return (
    <div className="operator-content">
      <header className="operator-topbar">
        <div>
          <p className="operator-eyebrow">RF-007 · RN-EJE-001</p>
          <h1>Registrar ejecución de salida</h1>
        </div>
        <button type="button" className="operator-outline" onClick={onBack}>
          Volver a salidas
        </button>
      </header>
      <p className="operator-eyebrow">Datos de prueba</p>
      {!canManage && (
        <p className="operator-access-note">
          Tu usuario no tiene el permiso Gestionar ejecución de salidas: puedes consultar la salida, pero no registrar inicio,
          finalización, novedades ni regularizaciones.
        </p>
      )}
      {body}
    </div>
  );
}
