import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DepartureExecutionPage } from './DepartureExecutionPage';
import { createDepartureFixture } from './fixture';
import type { Departure, DepartureExecutionGateway } from './gateway';

const setup = (code: string, gateway: DepartureExecutionGateway = createDepartureFixture()) => {
  render(<DepartureExecutionPage gateway={gateway} code={code} canManage onBack={vi.fn()} />);
  return gateway;
};

const section = async (name: string) => (await screen.findByRole('heading', { name })).closest('section') as HTMLElement;

// Spec 010 PT10-02 (AC-PT-10.1 to -10.5): travelers served, no-show, the real base and the reservations that could not be read.
describe('travelers served of a reservation (AC-PT-10.2)', () => {
  it('U·served_cannot_exceed_the_reserved_and_a_missing_traveler_needs_a_cause', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'registerServices');
    const panel = await section('Lo reservado y lo efectivamente prestado');
    const served = within(panel).getByLabelText('Viajeros atendidos');
    fireEvent.change(served, { target: { value: '5' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar servicios' }));
    expect(await within(panel).findByText('Los viajeros atendidos van de 1 a 4.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(served, { target: { value: '3' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar servicios' }));
    expect(await within(panel).findByText('Indica la causal de los viajeros que no se atendieron.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(within(panel).getByLabelText('Causal si no se prestó'), { target: { value: 'Uno se quedó en el hotel' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar servicios' }));
    expect(await within(panel).findByText(/Servicios guardados/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [expect.objectContaining({ travelersServed: 3, noShow: false, cause: 'Uno se quedó en el hotel' })] }),
    );
  });

  it('U·a_no_show_is_not_delivered_and_the_service_stays_charged', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'registerServices');
    const panel = await section('Lo reservado y lo efectivamente prestado');
    fireEvent.click(within(panel).getByLabelText('No se presentó sin aviso oportuno'));
    expect(within(panel).getByLabelText('Resultado')).toHaveValue('NOT_DELIVERED');
    expect(within(panel).getByLabelText('Viajeros atendidos')).toHaveValue(0);
    expect(within(panel).getByLabelText('Viajeros atendidos')).toBeDisabled();
    expect(within(panel).getByText('El servicio se mantiene cobrado.')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar servicios' }));
    expect(await within(panel).findByText('La causal es obligatoria para un servicio no prestado.')).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText('Causal si no se prestó'), { target: { value: 'No llegó, sin aviso' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar servicios' }));
    expect(await within(panel).findByText(/Servicios guardados/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [expect.objectContaining({ result: 'NOT_DELIVERED', travelersServed: 0, noShow: true, cause: 'No llegó, sin aviso' })],
      }),
    );
  });

  it('U·a_retry_with_the_same_data_keeps_the_key_and_changed_data_gets_a_new_one', async () => {
    const gateway = setup('SAL-021');
    const original = gateway.registerServices.bind(gateway);
    const keys: string[] = [];
    let fail = true;
    vi.spyOn(gateway, 'registerServices').mockImplementation(async (input) => {
      keys.push(input.key);
      if (fail) {
        fail = false;
        throw new Error('network');
      }
      return original(input);
    });
    const panel = await section('Lo reservado y lo efectivamente prestado');
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar servicios' }));
    fireEvent.click(await within(panel).findByRole('button', { name: 'Reintentar' }));
    await within(panel).findByText(/Servicios guardados/);
    fireEvent.change(within(panel).getByLabelText('Viajeros atendidos'), { target: { value: '2' } });
    fireEvent.change(within(panel).getByLabelText('Causal si no se prestó'), { target: { value: 'Dos se quedaron' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar servicios' }));
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });
});

describe('the real base and the reservations that could not be read', () => {
  const withService = (patch: (d: Departure) => Departure): DepartureExecutionGateway => {
    const gateway = createDepartureFixture();
    const read = gateway.getDeparture.bind(gateway);
    gateway.getDeparture = async (code) => {
      const d = await read(code);
      return d && patch(d);
    };
    return gateway;
  };

  it('U·the_departure_panel_shows_served_of_reserved', async () => {
    setup('SAL-021', withService((d) => ({ ...d, travelersServed: 3 })));
    const panel = await section('SAL-021');
    expect(within(panel).getByText('Atendidos')).toBeInTheDocument();
    expect(within(panel).getByText('3 de 4 reservados')).toBeInTheDocument();
  });

  it('U·without_reservations_the_panel_says_they_could_not_be_read_and_offers_a_retry', async () => {
    let unreadable = true;
    const gateway = withService((d) => (unreadable ? { ...d, reservations: [], reservationsUnavailable: true } : d));
    setup('SAL-021', gateway);
    const panel = await section('Lo reservado y lo efectivamente prestado');
    expect(within(panel).getByText('No se pudieron leer las reservas de esta salida.')).toBeInTheDocument();
    expect(within(panel).queryByText('Esta salida no tiene reservas.')).not.toBeInTheDocument();
    unreadable = false;
    fireEvent.click(within(panel).getByRole('button', { name: 'Reintentar' }));
    expect(await within(panel).findByText(/#RES-1002 · Cliente de prueba · 4 viajeros/)).toBeInTheDocument();
  });
});
