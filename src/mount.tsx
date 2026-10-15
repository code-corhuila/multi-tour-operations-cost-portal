import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { MountProps } from './contract';
import { createFixtureGateway } from './ops/fixtureGateway';
import { DepartureExecutionPage } from './ops/departure/DepartureExecutionPage';
import { DeparturesPage } from './ops/departures/DeparturesPage';
import type { DeparturesGateway } from './ops/departures/model';
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
// Scheduling, editing and cancelling a departure are the Administrator's (RN-OPS-PT-58).
const SCHEDULE_ROLES = ['TENANT_ADMINISTRATOR'];

interface DepartureFixture {
  gateway: DepartureExecutionGateway;
  departures: DeparturesGateway;
  codeOf: (reservationId: string) => string;
}

function App({ session, area }: MountProps) {
  const gateway = useMemo(createFixtureGateway, []);
  const [departure, setDeparture] = useState<string>();
  const [fixture, setFixture] = useState<DepartureFixture>();
  const [view, setView] = useState<'operation' | 'departures'>(area === 'departures' ? 'departures' : 'operation');
  useEffect(() => setView(area === 'departures' ? 'departures' : 'operation'), [area]);
  // The departure test data travel in the bundle only in development (spec 004 plan D-08, RN-OPS-PT-42).
  useEffect(() => {
    if (import.meta.env.DEV) {
      void Promise.all([import('./ops/departure/fixture'), import('./ops/departures/fixture')]).then(([execution, list]) =>
        setFixture({ gateway: execution.createDepartureFixture(), codeOf: execution.departureCodeOfReservation, departures: list.createDeparturesFixture() }),
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
  if (view === 'departures') {
    if (!fixture) return <p className="operator-copy">Las salidas de prueba no están disponibles en esta versión.</p>;
    const roles = session.roles;
    return (
      <DeparturesPage
        gateway={fixture.departures}
        canSchedule={roles.some((role) => SCHEDULE_ROLES.includes(role))}
        canManage={roles.some((role) => MANAGE_ROLES.includes(role))}
        onOpen={setDeparture}
      />
    );
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
