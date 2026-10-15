import { describe, expect, it } from 'vitest';
import { createDeparturesFixture } from './fixture';
import { validateDeparture, type DepartureForm } from './validateDeparture';

const context = async () => {
  const gateway = createDeparturesFixture();
  const [tours, vehicles, departures] = await Promise.all([gateway.listTours(), gateway.listVehicles(), gateway.listDepartures()]);
  return { tours, vehicles, departures };
};

const valid: DepartureForm = { tourId: 'T-1', date: '2026-11-02', start: '08:00', end: '14:00', vehicleIds: ['V-4'] };

// Spec 005 PT-11 (RN-OPS-PT-50 to -55): the rules of the form as a list of messages, like the Mockup.
describe('validateDeparture', () => {
  it('U·schedule_requires_date_start_and_end_after_start: each missing field and an end before the start', async () => {
    const ctx = await context();
    expect(validateDeparture({ ...valid, tourId: '', date: '', start: '', end: '' }, ctx)).toEqual([
      'Selecciona un tour.',
      'Ingresa la fecha de la salida.',
      'Ingresa la hora de inicio programada.',
      'Ingresa la hora de finalización estimada.',
    ]);
    expect(validateDeparture({ ...valid, start: '14:00', end: '14:00' }, ctx)).toEqual(['La hora de finalización estimada debe ser posterior al inicio.']);
    expect(validateDeparture(valid, ctx)).toEqual([]);
  });

  it('U·transport_tour_needs_a_vehicle: a tour with transport and no vehicle is refused, one without it is not', async () => {
    const ctx = await context();
    expect(validateDeparture({ ...valid, vehicleIds: [] }, ctx)).toEqual(['El tour con transporte asociado requiere al menos un vehículo.']);
    expect(validateDeparture({ ...valid, tourId: 'T-3', vehicleIds: [] }, ctx)).toEqual([]);
  });

  it('U·tour_capacity_is_at_least_one: a tour without capacity is refused', async () => {
    const ctx = await context();
    const tours = ctx.tours.map((t) => (t.id === 'T-3' ? { ...t, capacity: 0 } : t));
    expect(validateDeparture({ ...valid, tourId: 'T-3', vehicleIds: [] }, { ...ctx, tours })).toEqual(['El cupo del tour debe ser de al menos 1 viajero.']);
  });

  it('U·overlapping_vehicle_is_refused: the vehicle of SAL-018 on the same day and hour, but not when it touches', async () => {
    const ctx = await context();
    expect(validateDeparture({ ...valid, date: '2026-10-18', start: '10:00', end: '16:00', vehicleIds: ['V-1'] }, ctx)).toEqual([
      'El vehículo Van VAN-204 ya está asignado a SAL-018 en ese horario.',
    ]);
    expect(validateDeparture({ ...valid, date: '2026-10-18', start: '14:00', end: '18:00', vehicleIds: ['V-1'] }, ctx)).toEqual([]);
  });

  it('U·editing_does_not_collide_with_itself: the departure being edited keeps its own vehicles', async () => {
    const ctx = await context();
    expect(validateDeparture({ ...valid, date: '2026-10-18', start: '08:00', end: '14:00', vehicleIds: ['V-1'], editingCode: 'SAL-018' }, ctx)).toEqual([]);
  });

  it('U·capacity_cannot_fall_under_booked_seats: editing SAL-018 (8 booked) with a vehicle of 5 seats', async () => {
    const ctx = await context();
    const vehicles = [...ctx.vehicles, { id: 'V-9', name: 'Microbús MIC-05', capacity: 5 }];
    expect(
      validateDeparture({ tourId: 'T-1', date: '2026-10-18', start: '08:00', end: '14:00', vehicleIds: ['V-9'], editingCode: 'SAL-018' }, { ...ctx, vehicles }),
    ).toEqual(['La capacidad efectiva (5) no puede ser menor que los cupos apartados (8).']);
  });
});
