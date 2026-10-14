import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { MountProps } from './contract';
import { createFixtureGateway } from './ops/fixtureGateway';
import { DepartureExecutionPage } from './ops/departure/DepartureExecutionPage';
import type { DepartureExecutionGateway } from './ops/departure/gateway';
import { OperationsPage } from './ops/OperationsPage';
import './ui/operator.css';
import { ensureStylesheet } from './ui/stylesheet';

// Roles of the token (security.yaml). The screen is chosen by role; the services still refuse every call that is not
// for the role, so this only decides what to show (RN-OPS-PT-01).
const OPERATOR_ROLES = ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER'];
// shortcut: the permission "Gestionar ejecución de salidas" is not in the token yet; these roles stand for it until the
// contract of the service says otherwise (spec 004 RN-OPS-PT-30).
const MANAGE_ROLES = ['TENANT_ADMINISTRATOR', 'MANAGER'];

interface DepartureFixture {
  gateway: DepartureExecutionGateway;
  codeOf: (reservationId: string) => string;
}

function App({ session }: MountProps) {
  const gateway = useMemo(createFixtureGateway, []);
  const [departure, setDeparture] = useState<string>();
  const [fixture, setFixture] = useState<DepartureFixture>();
  // The departure test data travel in the bundle only in development (spec 004 plan D-08, RN-OPS-PT-42).
  useEffect(() => {
    if (import.meta.env.DEV) {
      void import('./ops/departure/fixture').then((m) =>
        setFixture({ gateway: m.createDepartureFixture(), codeOf: m.departureCodeOfReservation }),
      );
    }
  }, []);
  if (!session.roles.some((role) => OPERATOR_ROLES.includes(role))) {
    return (
      <p role="alert" className="operator-copy">
        No tienes acceso a la operación de este operador.
      </p>
    );
  }
  // The portal keeps its own view: the container routes to the area, not inside it.
  if (departure && fixture) {
    const canManage = session.roles.some((role) => MANAGE_ROLES.includes(role));
    return <DepartureExecutionPage gateway={fixture.gateway} code={departure} canManage={canManage} onBack={() => setDeparture(undefined)} />;
  }
  return <OperationsPage gateway={gateway} onRegister={(reservationId) => fixture && setDeparture(fixture.codeOf(reservationId))} />;
}

// The container calls this with its own client and session; the portal never creates either (Annex H).
export function mount(element: HTMLElement, props: MountProps): () => void {
  ensureStylesheet();
  const root = createRoot(element);
  root.render(<App {...props} />);
  return () => root.unmount();
}
