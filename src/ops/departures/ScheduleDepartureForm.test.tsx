import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDeparturesFixture } from './fixture';
import { ScheduleDepartureForm } from './ScheduleDepartureForm';

const setup = (editCode?: string) => {
  const gateway = createDeparturesFixture();
  const onBack = vi.fn();
  const onSaved = vi.fn();
  render(<ScheduleDepartureForm gateway={gateway} editCode={editCode} onBack={onBack} onSaved={onSaved} />);
  return { gateway, onBack, onSaved };
};

// Spec 005 PT-11 (AC6 to AC8, RN-OPS-PT-52, -53, -56): the form of the Mockup admin-programar-salida.html.
describe('schedule departure form (spec 005)', () => {
  it('U·form_has_its_two_sections: header, fields, vehicles and the test-data label', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Programar salida' })).toBeInTheDocument();
    expect(screen.getByText('RF-020 · Solo Administrador del tenant')).toBeInTheDocument();
    expect(screen.getByText('Datos de prueba')).toBeInTheDocument();
    for (const label of ['Tour', 'Fecha', 'Hora de inicio programada', 'Hora de finalización estimada', 'Cupo del tour (viajeros)', 'Estado']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Estado')).toHaveValue('Programada');
    expect(screen.getByRole('checkbox', { name: /Bus Andino 01 · 30 viajeros/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a salidas' })).toBeInTheDocument();
  });

  it('U·capacity_line_follows_tour_and_vehicles: the lower of the tour quota and the vehicles', async () => {
    setup();
    fireEvent.change(await screen.findByLabelText('Tour'), { target: { value: 'T-1' } });
    expect(screen.getByLabelText('Cupo del tour (viajeros)')).toHaveValue(12);
    fireEvent.click(screen.getByRole('checkbox', { name: /Bus Andino 01/ }));
    expect(screen.getByText('Capacidad efectiva de la salida: 12 viajeros = menor entre el cupo del tour (12) y la capacidad acumulada de los vehículos (30)')).toBeInTheDocument();
  });

  it('U·occupied_vehicle_is_marked: the vehicle of an overlapping departure shows its code', async () => {
    setup();
    fireEvent.change(await screen.findByLabelText('Fecha'), { target: { value: '2026-10-18' } });
    fireEvent.change(screen.getByLabelText('Hora de inicio programada'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Hora de finalización estimada'), { target: { value: '12:00' } });
    expect(screen.getByRole('checkbox', { name: /Van VAN-204 · 12 viajeros · ocupado en SAL-018/ })).toBeInTheDocument();
  });

  it('U·invalid_form_shows_the_messages_and_saves_nothing: the list of the Mockup', async () => {
    const { gateway, onSaved } = setup();
    const spy = vi.spyOn(gateway, 'scheduleDeparture');
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar salida' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Selecciona un tour.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('U·valid_form_schedules_and_returns: the result line with the effective capacity', async () => {
    const { gateway, onSaved } = setup();
    const spy = vi.spyOn(gateway, 'scheduleDeparture');
    fireEvent.change(await screen.findByLabelText('Tour'), { target: { value: 'T-1' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('Hora de inicio programada'), { target: { value: '08:00' } });
    fireEvent.change(screen.getByLabelText('Hora de finalización estimada'), { target: { value: '14:00' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Bus Andino 01/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar salida' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(onSaved.mock.calls[0][0]).toBe('Salida SAL-026 programada (Caminata al cañón del río, 2026-11-02 08:00). Capacidad efectiva: 12. Ya se puede reservar.');
  });

  it('U·reserved_departure_locks_date_and_tour: editing SAL-018 (8 booked) locks them and says why', async () => {
    setup('SAL-018');
    expect(await screen.findByRole('heading', { name: 'Editar salida SAL-018' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tour')).toBeDisabled();
    expect(screen.getByLabelText('Fecha')).toBeDisabled();
    expect(screen.getByLabelText('Hora de inicio programada')).toBeDisabled();
    expect(screen.getByText(/tiene reservas: para cambiar fecha, horas o tour, cancélala y programa una nueva/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Van VAN-204/ })).toBeEnabled();
  });

  it('U·fixture_guards_edit_and_schedule: only a scheduled departure is edited and a reserved one keeps date and tour', async () => {
    const gateway = createDeparturesFixture();
    const base = { tourId: 'T-1', start: '2026-10-21T08:00', end: '2026-10-21T14:00', vehicleIds: ['V-4'], key: 'k-edit' };
    await expect(gateway.updateDeparture({ ...base, code: 'SAL-021' })).rejects.toThrow('INVALID_STATUS_TRANSITION');
    await expect(gateway.updateDeparture({ ...base, code: 'SAL-018' })).rejects.toThrow('BUSINESS_RULE_VIOLATION');
    await expect(gateway.updateDeparture({ ...base, code: 'SAL-099' })).rejects.toThrow('NOT_FOUND');
  });
});
