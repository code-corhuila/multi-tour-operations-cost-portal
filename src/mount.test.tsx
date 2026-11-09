import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mount } from './mount';
import type { ApiClient, MountProps } from './contract';

const catalog = {
  data: [{ serviceId: 'svc-1', commercialName: 'Cañón del río', configuredCapacity: 12, transportRequired: false }],
  meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
};
const noVehicles = { data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } };
const created = { code: 'SAL-031', status: 'SCHEDULED', scheduledStart: '2026-12-01T13:00:00Z', scheduledEnd: '2026-12-01T19:00:00Z', capacity: 12, booked: 0 };
const listed = {
  data: [{ ...created, serviceId: 'svc-1', pendingRegularization: false, interrupted: false, vehicles: [] }],
  meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
};
const request = () =>
  vi.fn(async (path: string) =>
    path.includes('catalog') ? catalog : path.includes('/vehicles') ? noVehicles : path.startsWith('/api/v1/operations-cost/departures?') ? listed : created,
  ) as unknown as ApiClient['request'] & ReturnType<typeof vi.fn>;

const MANAGE = 'MANAGE_DEPARTURE_EXECUTION';
const props = (roles: string[], apiClient = { request: request() }, permissions: string[] = [MANAGE]): MountProps => ({
  apiClient,
  session: { roles, permissions, open: vi.fn(), close: vi.fn() },
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

  it('U·area_departures_opens_the_list: the side menu entry Salidas draws the list and Operación the operation page', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const unmount = mount(element, { ...props(['TENANT_ADMINISTRATOR']), area: 'departures' });
    expect(await screen.findByRole('heading', { name: 'Salidas' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Operación y costos' })).not.toBeInTheDocument();
    unmount();
  });

  it('U·initial_params_area_opens_the_list: the container hands the area in initialParams, not as a property', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const unmount = mount(element, { ...props(['TENANT_ADMINISTRATOR']), initialParams: { area: 'departures' } });
    expect(await screen.findByRole('heading', { name: 'Salidas' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Operación y costos' })).not.toBeInTheDocument();
    unmount();
  });

  it('C·the_vehicles_section_is_in_the_departures_area_for_the_administrator_and_reads_the_service', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const client = { request: request() };
    const unmount = mount(element, { ...props(['TENANT_ADMINISTRATOR'], client), area: 'departures' });
    expect(await screen.findByRole('heading', { name: 'Vehículos' })).toBeInTheDocument();
    expect(await screen.findByText('Aún no hay vehículos registrados.')).toBeInTheDocument();
    expect(client.request).toHaveBeenCalledWith(expect.stringContaining('/api/v1/operations-cost/vehicles'));
    unmount();
  });

  it('C·the_vehicles_section_is_not_drawn_for_a_role_that_cannot_schedule', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const unmount = mount(element, { ...props(['OPERATIONAL_COLLABORATOR']), area: 'departures' });
    expect(await screen.findByRole('heading', { name: 'Salidas' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Vehículos' })).not.toBeInTheDocument();
    unmount();
  });

  it('U·schedule_flow_goes_list_form_list: the Administrator opens the form and returns with the result line', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const unmount = mount(element, { ...props(['TENANT_ADMINISTRATOR']), area: 'departures' });
    fireEvent.click(await screen.findByRole('button', { name: 'Programar salida' }));
    expect(await screen.findByRole('heading', { name: 'Programar salida' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a salidas' }));
    expect(await screen.findByRole('heading', { name: 'Salidas' })).toBeInTheDocument();
    unmount();
  });

  it('U·a_collaborator_with_the_permission_sees_no_schedule_link: only the Administrator schedules', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const unmount = mount(element, { ...props(['OPERATIONAL_COLLABORATOR']), area: 'departures' });
    expect(await screen.findByRole('heading', { name: 'Salidas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Programar salida' })).not.toBeInTheDocument();
    unmount();
  });

  it('U·hidden_without_the_role: a customer sees no operation data', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    mount(element, props(['FINAL_CUSTOMER']));
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes acceso');
    expect(screen.queryByText('Salidas por preparar')).not.toBeInTheDocument();
  });

  // Spec 006 PT6-04: the container's client reaches the schedule form only.
  it('C·the_schedule_form_calls_the_client_the_container_gave', async () => {
    const apiClient = { request: request() };
    const element = document.createElement('div');
    document.body.appendChild(element);
    const unmount = mount(element, { ...props(['TENANT_ADMINISTRATOR'], apiClient), area: 'departures' });
    fireEvent.click(await screen.findByRole('button', { name: 'Programar salida' }));
    fireEvent.change(await screen.findByLabelText('Tour'), { target: { value: 'svc-1' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Hora de inicio programada'), { target: { value: '08:00' } });
    fireEvent.change(screen.getByLabelText('Hora de finalización estimada'), { target: { value: '14:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar salida' }));
    expect(await screen.findByText(/Salida SAL-031 programada/)).toBeInTheDocument();
    expect(apiClient.request).toHaveBeenCalledWith(
      '/api/v1/operations-cost/departures',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Idempotency-Key': expect.stringMatching(/^schedule:/) },
        body: expect.objectContaining({ serviceId: 'svc-1', scheduledStart: '2026-12-01T13:00:00Z', timeZone: 'America/Bogota' }),
      }),
    );
    unmount();
  });

  it('C·without_the_test_data_the_form_is_still_reachable: a production build has an empty list', async () => {
    vi.stubEnv('DEV', false);
    try {
      const element = document.createElement('div');
      document.body.appendChild(element);
      const unmount = mount(element, { ...props(['TENANT_ADMINISTRATOR']), area: 'departures' });
      expect(await screen.findByRole('heading', { name: 'Salidas' })).toBeInTheDocument();
      expect(screen.queryByText('SAL-018')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Programar salida' }));
      expect(await screen.findByLabelText('Tour')).toBeInTheDocument();
      unmount();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('C·the_list_comes_from_the_service_and_its_rows_have_no_test_data_nor_edit', async () => {
    const apiClient = { request: request() };
    const element = document.createElement('div');
    document.body.appendChild(element);
    const unmount = mount(element, { ...props(['TENANT_ADMINISTRATOR'], apiClient), area: 'departures' });
    expect(await screen.findByRole('heading', { name: 'Salidas' })).toBeInTheDocument();
    expect(await screen.findByText('SAL-031')).toBeInTheDocument();
    expect(screen.queryByText('SAL-018')).not.toBeInTheDocument();
    expect(screen.queryByText('Datos de prueba')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
    expect(apiClient.request).toHaveBeenCalledWith('/api/v1/operations-cost/departures?limit=100&page=1');
    unmount();
  });

  it('C·without_the_permission_the_departures_are_not_offered_even_to_the_administrator', async () => {
    const apiClient = { request: request() };
    const element = document.createElement('div');
    document.body.appendChild(element);
    const unmount = mount(element, { ...props(['TENANT_ADMINISTRATOR'], apiClient, []), area: 'departures' });
    expect(await within(element).findByRole('alert')).toHaveTextContent('No tienes acceso a las salidas');
    expect(screen.queryByRole('heading', { name: 'Salidas' })).not.toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalledWith(expect.stringContaining('/departures'));
    unmount();
  });
});
