import { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import type { MountProps } from './contract';
import { createFixtureGateway } from './ops/fixtureGateway';
import { OperationsPage } from './ops/OperationsPage';
import './ui/operator.css';
import { ensureStylesheet } from './ui/stylesheet';

// Roles of the token (security.yaml). The screen is chosen by role; the services still refuse every call that is not
// for the role, so this only decides what to show (RN-OPS-PT-01).
const OPERATOR_ROLES = ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER'];

function App({ identifier, navigate, session }: MountProps) {
  const gateway = useMemo(createFixtureGateway, []);
  if (!session.roles.some((role) => OPERATOR_ROLES.includes(role))) {
    return (
      <p role="alert" className="operator-copy">
        No tienes acceso a la operación de este operador.
      </p>
    );
  }
  const base = `/t/${identifier ?? ''}/areas/operations-cost-portal`;
  return <OperationsPage gateway={gateway} onRegister={(reservationId) => navigate?.(`${base}/registrar/${reservationId}`)} />;
}

// The container calls this with its own client and session; the portal never creates either (Annex H).
export function mount(element: HTMLElement, props: MountProps): () => void {
  ensureStylesheet();
  const root = createRoot(element);
  root.render(<App {...props} />);
  return () => root.unmount();
}
