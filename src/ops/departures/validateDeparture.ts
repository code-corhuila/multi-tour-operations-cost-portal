import { effectiveCapacity, overlaps } from './capacity';
import type { DepartureRow, Tour, Vehicle } from './model';
import { toInstant } from './time';

// What the person types; times are "HH:mm" and the date "YYYY-MM-DD" (the two inputs of the Mockup).
export interface DepartureForm {
  tourId: string;
  date: string;
  start: string;
  end: string;
  vehicleIds: string[];
  // Set when an existing departure is being edited: it does not collide with itself.
  editingCode?: string;
}

export interface Context {
  tours: Tour[];
  vehicles: Vehicle[];
  departures: DepartureRow[];
  // False when the gateway takes no vehicles: the rules of transport do not apply.
  withVehicles?: boolean;
  // The zone the form's hours are in; absent with the test data, whose departures are all in one zone and compare as text.
  timeZone?: string;
}

export const interval = (form: Pick<DepartureForm, 'date' | 'start' | 'end'>) => ({ start: `${form.date}T${form.start}`, end: `${form.date}T${form.end}` });

// Each listed departure is in its own zone and the form in the tenant's: they are compared as instants, never as text of two zones.
const instants = (span: { start: string; end: string }, zone?: string) =>
  zone ? { start: toInstant(span.start, zone), end: toInstant(span.end, zone) } : span;
export function collides(mine: { start: string; end: string }, zone: string | undefined, d: DepartureRow): boolean {
  // with a zone on one side only the hours cannot be compared: it counts as a clash, so the vehicle is not given twice
  if (!zone !== !d.timeZone) return true;
  return overlaps(instants(mine, zone), instants(d, d.timeZone));
}

// The rules of the form as a list of messages, like the Mockup (RN-OPS-PT-50 to -55). The service decides for real.
export function validateDeparture(form: DepartureForm, { tours, vehicles, departures, withVehicles = true, timeZone }: Context): string[] {
  const messages: string[] = [];
  const tour = tours.find((t) => t.id === form.tourId);
  if (!tour) messages.push('Selecciona un tour.');
  if (!form.date) messages.push('Ingresa la fecha de la salida.');
  if (!form.start) messages.push('Ingresa la hora de inicio programada.');
  if (!form.end) messages.push('Ingresa la hora de finalización estimada.');
  if (form.start && form.end && form.end <= form.start) messages.push('La hora de finalización estimada debe ser posterior al inicio.');
  if (tour && tour.capacity < 1) messages.push('El cupo del tour debe ser de al menos 1 viajero.');
  if (withVehicles && tour?.needsTransport && form.vehicleIds.length === 0) messages.push('El tour con transporte asociado requiere al menos un vehículo.');

  const chosen = vehicles.filter((v) => form.vehicleIds.includes(v.id));
  if (form.date && form.start && form.end && form.end > form.start) {
    const mine = interval(form);
    for (const vehicle of chosen) {
      const other = departures.find(
        (d) => d.code !== form.editingCode && d.status !== 'CANCELLED' && d.vehicleIds.includes(vehicle.id) && collides(mine, timeZone, d),
      );
      if (other) messages.push(`El vehículo ${vehicle.name} ya está asignado a ${other.code} en ese horario.`);
    }
  }

  const editing = departures.find((d) => d.code === form.editingCode);
  if (tour && editing && chosen.length > 0) {
    const capacity = effectiveCapacity(
      tour.capacity,
      chosen.map((v) => v.capacity),
      tour.needsTransport,
    );
    if (capacity < editing.booked) messages.push(`La capacidad efectiva (${capacity}) no puede ser menor que los cupos apartados (${editing.booked}).`);
  }
  return messages;
}
