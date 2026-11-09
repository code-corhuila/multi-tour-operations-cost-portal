import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { MountProps } from './contract';
import { createFixtureGateway } from './ops/fixtureGateway';
import { DepartureExecutionPage } from './ops/departure/DepartureExecutionPage';
import { DeparturesPage } from './ops/departures/DeparturesPage';
import { ScheduleDepartureForm } from './ops/departures/ScheduleDepartureForm';
import { VehiclesSection } from './ops/departures/VehiclesSection';
import type { DeparturesGateway } from './ops/departures/model';
import { createDeparturesGateway } from './ops/departures/scheduling';
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

// What the list and the edit use where the test data do not travel (a production build): nothing, and nothing is saved.
const noDepartures: DeparturesGateway = {
  listDepartures: async () => [],
  listTours: async () => [],
  listVehicles: async () => [],
  scheduleDeparture: () => Promise.reject(new Error('NOT_AVAILABLE')),
  updateDeparture: () => Promise.reject(new Error('NOT_AVAILABLE')),
  cancelDeparture: () => Promise.reject(new Error('NOT_AVAILABLE')),
};

interface DepartureFixture {
  gateway: DepartureExecutionGateway;
  departures: DeparturesGateway;
  codeOf: (reservationId: string) => string;
}

function App({ session, area: areaProp, initialParams, apiClient }: MountProps) {
  const area = areaProp ?? (initialParams?.area === 'departures' || initialParams?.area === 'operation' ? initialParams.area : undefined);
  const gateway = useMemo(createFixtureGateway, []);
  const [departure, setDeparture] = useState<string>();
  const [fixture, setFixture] = useState<DepartureFixture>();
  const [view, setView] = useState<'operation' | 'departures'>(area === 'departures' ? 'departures' : 'operation');
  // The form of a departure is a state of the Salidas area: new (editing undefined) or editing a code.
  const [form, setForm] = useState<{ code?: string }>();
  const [notice, setNotice] = useState<string>();
  useEffect(() => {
    setView(area === 'departures' ? 'departures' : 'operation');
    // A menu click leaves the execution page and the form: the entry of the side menu always shows its own page.
    setDeparture(undefined);
    setForm(undefined);
    setNotice(undefined);
  }, [area]);
  // The departure test data travel in the bundle only in development (spec 004 plan D-08, RN-OPS-PT-42).
  useEffect(() => {
    if (import.meta.env.DEV) {
      void Promise.all([import('./ops/departure/fixture'), import('./ops/departures/fixture')]).then(([execution, list]) =>
        setFixture({ gateway: execution.createDepartureFixture(), codeOf: execution.departureCodeOfReservation, departures: list.createDeparturesFixture() }),
      );
    }
  }, []);
  // The list and the edit stay on the test data (spec 006 G-2, G-5); only the new departure goes to the service.
  const testDepartures = fixture?.departures ?? noDepartures;
  // The container hands one stable client for the life of the mount; a new object per render would reload the form.
  const scheduling = useMemo(() => createDeparturesGateway(apiClient, testDepartures), [apiClient, testDepartures]);
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
    if (import.meta.env.DEV && !fixture) return <p role="status">Cargando…</p>;
    const roles = session.roles;
    const canSchedule = roles.some((role) => SCHEDULE_ROLES.includes(role));
    // Only the Administrator reaches the form; anyone else keeps the list (RN-OPS-PT-58).
    if (form && canSchedule) {
      return (
        <ScheduleDepartureForm
          gateway={form.code ? testDepartures : scheduling}
          editCode={form.code}
          onBack={() => setForm(undefined)}
          onSaved={(line) => {
            setNotice(line);
            setForm(undefined);
          }}
        />
      );
    }
    return (
      <DeparturesPage
        key={notice}
        gateway={testDepartures}
        canSchedule={canSchedule}
        canManage={roles.some((role) => MANAGE_ROLES.includes(role))}
        onOpen={setDeparture}
        onSchedule={() => {
          setNotice(undefined);
          setForm({});
        }}
        onEdit={(code) => {
          setNotice(undefined);
          setForm({ code });
        }}
        notice={notice}
      >
        {canSchedule && <VehiclesSection gateway={scheduling} />}
      </DeparturesPage>
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
