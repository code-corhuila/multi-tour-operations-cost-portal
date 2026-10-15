// Effective capacity = the lower of the tour capacity and the sum of the vehicles (RN-OPS-PT-52). A tour with
// transport and no vehicle has none; a tour without transport keeps its own.
export function effectiveCapacity(tourCapacity: number, vehicleCapacities: number[], needsTransport: boolean): number {
  if (vehicleCapacities.length === 0) return needsTransport ? 0 : tourCapacity;
  return Math.min(tourCapacity, vehicleCapacities.reduce((sum, capacity) => sum + capacity, 0));
}

// Two scheduled intervals overlap when each starts before the other ends; touching ends do not (RN-OPS-PT-53).
// Wall-clock strings of one format compare in time order.
export function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start < b.end && b.start < a.end;
}
