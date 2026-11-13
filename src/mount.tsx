import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { MountProps } from './contract';
import { createFixtureGateway } from './ops/fixtureGateway';
import { DepartureExecutionPage } from './ops/departure/DepartureExecutionPage';
import { createExecutionGateway } from './ops/departure/execution';
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
// "Gestionar ejecución de salidas": the claim `permissions` of the token carries it as this code (spec 008 plan D-04). The
// Administrator holds it by profile; a collaborator holds it when an Administrator granted it.
const MANAGE_DEPARTURE_EXECUTION = 'MANAGE_DEPARTURE_EXECUTION';
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
  // The code of the departure open on its page, and where it comes from: a row of the real list reads the service, a row of the
  // test data of the operation page reads the test data (spec 008 plan D-02).
  const [departure, setDeparture] = useState<{ code: string; real: boolean }>();
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
  // The list, the new departure and the vehicles go to the service; the edit and the cancellation stay on the test data (HU-OPS-006).
  const testDepartures = fixture?.departures ?? noDepartures;
  // The container hands one stable client for the life of the mount; a new object per render would reload the form.
  const scheduling = useMemo(() => createDeparturesGateway(apiClient, testDepartures), [apiClient, testDepartures]);
  const execution = useMemo(() => createExecutionGateway(apiClient), [apiClient]);
  const canManage = (session.permissions ?? []).includes(MANAGE_DEPARTURE_EXECUTION);
  if (!session.roles.some((role) => OPERATOR_ROLES.includes(role))) {
    return (
      <p role="alert" className="operator-copy">
        No tienes acceso a la operación de este operador.
      </p>
    );
  }
  // The portal keeps its own view: the container routes to the area, not inside it.
  if (departure && (departure.real || fixture)) {
    return (
      <DepartureExecutionPage
        gateway={departure.real ? execution : fixture!.gateway}
        code={departure.code}
        canManage={canManage}
        onBack={() => setDeparture(undefined)}
      />
    );
  }
  if (view === 'departures') {
    if (!canManage) {
      return (
        <p role="alert" className="operator-copy">
          No tienes acceso a las salidas.
        </p>
      );
    }
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
        gateway={scheduling}
        canSchedule={canSchedule}
        canManage={canManage}
        onOpen={(code) => setDeparture({ code, real: true })}
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
  return <OperationsPage gateway={gateway} onRegister={(reservationId) => fixture && setDeparture({ code: fixture.codeOf(reservationId), real: false })} />;
}

// The container calls this with its own client and session; the portal never creates either (Annex H).
export function mount(element: HTMLElement, props: MountProps): () => void {
  ensureStylesheet();
  const root = createRoot(element);
  root.render(<App {...props} />);
  return () => root.unmount();
}
