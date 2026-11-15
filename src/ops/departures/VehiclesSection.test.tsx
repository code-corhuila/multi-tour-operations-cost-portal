import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDeparturesFixture } from './fixture';
import { FieldError, Forbidden, Refused, Unavailable, type DeparturesGateway, type Vehicle } from './model';
import { VehiclesSection } from './VehiclesSection';

// Portal spec 007, task PT7-01 (AC-PT-07.1, -07.2, RN-OPS-PT-70): the section "Vehículos" of the departures page.

const van: Vehicle = { id: 'v-1', name: 'Van VAN-204', capacity: 12 };

function gatewayOf(patch: Partial<DeparturesGateway>): DeparturesGateway {
  return {
    ...createDeparturesFixture(),
    connected: true,
    listVehicles: async () => [van],
    createVehicle: async (i) => ({ id: 'v-9', name: i.name, capacity: i.capacity }),
    ...patch,
  };
}

const fill = (name: string, capacity: string) => {
  fireEvent.change(screen.getByLabelText('Nombre del vehículo'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Capacidad (viajeros)'), { target: { value: capacity } });
};
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Registrar vehículo' }));

describe('the vehicles section', () => {
  it('C·the_vehicles_of_the_tenant_are_listed_with_their_capacity', async () => {
    render(<VehiclesSection gateway={gatewayOf({})} />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando');
    expect(await screen.findByText(/Van VAN-204/)).toHaveTextContent('12 viajeros');
  });

  it('C·the_section_shows_its_empty_and_error_states_with_a_retry', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce([]);
    render(<VehiclesSection gateway={gatewayOf({ listVehicles: list })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los vehículos');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Aún no hay vehículos registrados.')).toBeInTheDocument();
  });

  it('C·a_new_vehicle_appears_in_the_list_and_the_form_is_cleared', async () => {
    const create = vi.fn(async (i: { name: string; capacity: number }) => ({ id: 'v-9', name: i.name, capacity: i.capacity }));
    render(<VehiclesSection gateway={gatewayOf({ createVehicle: create })} />);
    await screen.findByText(/Van VAN-204/);
    fill('  Bus Andino 01 ', '30');
    save();
    expect(await screen.findByText(/Bus Andino 01/)).toHaveTextContent('30 viajeros');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bus Andino 01', capacity: 30 }));
    expect(screen.getByLabelText('Nombre del vehículo')).toHaveValue('');
    expect(screen.getByText('Vehículo registrado.')).toBeInTheDocument();
  });

  it('C·a_name_or_a_capacity_out_of_range_is_refused_beside_the_field_before_sending', async () => {
    const create = vi.fn();
    render(<VehiclesSection gateway={gatewayOf({ createVehicle: create })} />);
    await screen.findByText(/Van VAN-204/);
    fill('', '0');
    save();
    expect(screen.getByLabelText('Nombre del vehículo')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Capacidad (viajeros)')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Escribe el nombre del vehículo.')).toBeInTheDocument();
    expect(screen.getByText('La capacidad es un número entero de 1 a 100.')).toBeInTheDocument();
    fill('Van', '101');
    save();
    fill('Van', '12.5');
    save();
    expect(create).not.toHaveBeenCalled();
  });

  it('C·a_used_name_shows_beside_the_field_and_the_data_stays', async () => {
    const create = vi.fn().mockRejectedValue(new Refused('BUSINESS_RULE_VIOLATION'));
    render(<VehiclesSection gateway={gatewayOf({ createVehicle: create })} />);
    await screen.findByText(/Van VAN-204/);
    fill('Van VAN-204', '12');
    save();
    expect(await screen.findByText('Ya existe un vehículo con ese nombre.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del vehículo')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Nombre del vehículo')).toHaveValue('Van VAN-204');
  });

  it('C·a_400_of_the_service_goes_beside_the_field_it_names', async () => {
    const create = vi.fn().mockRejectedValue(new FieldError([{ field: 'capacity', message: 'x' }]));
    render(<VehiclesSection gateway={gatewayOf({ createVehicle: create })} />);
    await screen.findByText(/Van VAN-204/);
    fill('Van 2', '12');
    save();
    await waitFor(() => expect(screen.getByLabelText('Capacidad (viajeros)')).toHaveAttribute('aria-invalid', 'true'));
  });

  it('C·a_service_that_does_not_answer_or_forbids_says_so_and_nothing_is_lost', async () => {
    const create = vi.fn().mockRejectedValueOnce(new Unavailable()).mockRejectedValueOnce(new Forbidden());
    render(<VehiclesSection gateway={gatewayOf({ createVehicle: create })} />);
    await screen.findByText(/Van VAN-204/);
    fill('Van 2', '12');
    save();
    expect(await screen.findByText(/El servicio no responde/)).toBeInTheDocument();
    save();
    expect(await screen.findByText(/No tienes permiso/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del vehículo')).toHaveValue('Van 2');
  });

  it('C·a_retry_of_the_same_data_reuses_its_key_and_new_data_gets_another', async () => {
    const keys: string[] = [];
    const create = vi.fn(async (i: { name: string; capacity: number; key: string }) => {
      keys.push(i.key);
      if (keys.length === 1) throw new Unavailable();
      return { id: `v-${keys.length}`, name: i.name, capacity: i.capacity };
    });
    render(<VehiclesSection gateway={gatewayOf({ createVehicle: create })} />);
    await screen.findByText(/Van VAN-204/);
    fill('Van 2', '12');
    save();
    await screen.findByText(/El servicio no responde/);
    save();
    await screen.findByText(/Van 2 ·/);
    fill('Van 3', '12');
    save();
    await screen.findByText(/Van 3 ·/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('C·the_button_is_disabled_while_sending_so_one_request_goes_out', async () => {
    let release!: () => void;
    const create = vi.fn(() => new Promise<Vehicle>((resolve) => (release = () => resolve({ id: 'v-9', name: 'Van 2', capacity: 12 }))));
    render(<VehiclesSection gateway={gatewayOf({ createVehicle: create })} />);
    await screen.findByText(/Van VAN-204/);
    fill('Van 2', '12');
    save();
    const button = await screen.findByRole('button', { name: 'Registrando…' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(create).toHaveBeenCalledTimes(1);
    release();
    await screen.findByText(/Van 2 ·/);
  });

  it('C·nothing_is_drawn_when_the_gateway_cannot_register: the test data', () => {
    const { container } = render(<VehiclesSection gateway={createDeparturesFixture()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('C·the_list_keeps_its_order_by_name_after_a_registration', async () => {
    render(<VehiclesSection gateway={gatewayOf({})} />);
    await screen.findByText(/Van VAN-204/);
    fill('Bote 02', '10');
    save();
    await screen.findByText(/Bote 02/);
    const items = within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items[0]).toContain('Bote 02');
    expect(items[1]).toContain('Van VAN-204');
  });

  it('C·only_the_rule_code_of_a_used_name_says_the_name_is_used: any other refusal is a general error', async () => {
    const create = vi.fn().mockRejectedValue(new Refused('INVALID_STATUS_TRANSITION'));
    render(<VehiclesSection gateway={gatewayOf({ createVehicle: create })} />);
    await screen.findByText(/Van VAN-204/);
    fill('Van 2', '12');
    save();
    expect(await screen.findByText('No pudimos registrar el vehículo. Tus datos siguen aquí.')).toBeInTheDocument();
    expect(screen.queryByText('Ya existe un vehículo con ese nombre.')).not.toBeInTheDocument();
  });

  it('C·the_list_is_sorted_by_name_also_when_it_is_first_drawn', async () => {
    const list = async () => [van, { id: 'v-0', name: 'Bote 02', capacity: 10 }];
    render(<VehiclesSection gateway={gatewayOf({ listVehicles: list })} />);
    await screen.findByText(/Van VAN-204/);
    const items = within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items[0]).toContain('Bote 02');
  });

  it('C·a_vehicle_registered_while_the_list_is_still_loading_is_not_lost', async () => {
    let releaseFirst!: (v: Vehicle[]) => void;
    const list = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Vehicle[]>((resolve) => (releaseFirst = resolve)))
      .mockResolvedValue([van, { id: 'v-9', name: 'Van 2', capacity: 12 }]);
    render(<VehiclesSection gateway={gatewayOf({ listVehicles: list })} />);
    fill('Van 2', '12');
    save();
    await screen.findByText('Vehículo registrado.');
    releaseFirst([van]);
    expect(await screen.findByText(/Van 2 ·/)).toBeInTheDocument();
  });
});
