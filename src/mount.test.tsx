import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mount } from './mount';
import type { MountProps } from './contract';

const props = (roles: string[]): MountProps => ({
  apiClient: { request: vi.fn() },
  session: { roles, open: vi.fn(), close: vi.fn() },
});

// Spec 001 PT-01 and PT-03: the container mounts the portal and the page is shown only to the operator roles.
describe('operations portal mount (RN-OPS-PT-01)', () => {
  it('U·mount_renders_and_unmounts: the page title appears and the unmount function removes it', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const unmount = mount(element, props(['TENANT_ADMINISTRATOR']));
    expect(await screen.findByRole('heading', { name: 'Operación y costos' })).toBeInTheDocument();
    unmount();
    await waitFor(() => expect(element).toBeEmptyDOMElement());
  });

  it('U·hidden_without_the_role: a customer sees no operation data', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    mount(element, props(['FINAL_CUSTOMER']));
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes acceso');
    expect(screen.queryByText('Salidas por preparar')).not.toBeInTheDocument();
  });
});
