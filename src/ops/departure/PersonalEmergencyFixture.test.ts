import { describe, expect, it } from 'vitest';
import { createDepartureFixture } from './fixture';

// Spec 014 PT14-01 (AC-PT-14.1, -14.2, -14.4): the test data follow the rules of the service, so the development build behaves like it.
const emergency = (code: string, reservationId: string, extra: Partial<{ affected: number; detail: string; key: string }> = {}) => ({
  code,
  reservationId,
  detail: 'Un viajero se desmayó en el sendero',
  emergency: true,
  affected: 1,
  key: 'emergency-key-1',
  ...extra,
});

describe('the personal emergency on the test data', () => {
  it('U·an_emergency_is_recorded_on_a_reservation_in_execution_and_the_reservation_stays_in_execution', async () => {
    const gateway = createDepartureFixture();
    const answered = await gateway.registerNovelty(emergency('SAL-021', 'RES-1002', { affected: 2, detail: '  Se lastimó una pierna  ' }));
    expect(answered.novelties).toHaveLength(1);
    expect(answered.novelties[0]).toMatchObject({ type: 'Emergencia personal', detail: 'Se lastimó una pierna', reservationId: 'RES-1002', affected: 2 });
    expect(answered.novelties[0].at).toBeTruthy();
    expect(answered.reservations.find((r) => r.reservationId === 'RES-1002')?.state).toBe('IN_EXECUTION');
    expect(await gateway.registerNovelty(emergency('SAL-021', 'RES-1002', { affected: 2, detail: '  Se lastimó una pierna  ' }))).toEqual(answered);
  });

  it('U·travelers_out_of_range_or_a_bad_detail_are_refused_and_nothing_is_recorded', async () => {
    const gateway = createDepartureFixture();
    await expect(gateway.registerNovelty(emergency('SAL-021', 'RES-1002', { affected: 0 }))).rejects.toThrow('VALIDATION_ERROR');
    await expect(gateway.registerNovelty(emergency('SAL-021', 'RES-1002', { detail: '  ' }))).rejects.toThrow('VALIDATION_ERROR');
    await expect(gateway.registerNovelty(emergency('SAL-021', 'RES-1002', { detail: 'd'.repeat(1001) }))).rejects.toThrow('VALIDATION_ERROR');
    await expect(gateway.registerNovelty(emergency('SAL-021', 'RES-1002', { affected: 5 }))).rejects.toThrow('BUSINESS_RULE_VIOLATION');
    expect((await gateway.getDeparture('SAL-021'))?.novelties).toHaveLength(0);
  });

  it('U·a_reservation_has_one_emergency_and_only_a_departure_in_execution_takes_one', async () => {
    const gateway = createDepartureFixture();
    await gateway.registerNovelty(emergency('SAL-021', 'RES-1002'));
    await expect(gateway.registerNovelty(emergency('SAL-021', 'RES-1002', { key: 'emergency-key-2' }))).rejects.toThrow('BUSINESS_RULE_VIOLATION');
    await expect(gateway.registerNovelty(emergency('SAL-021', 'RES-9999', { key: 'emergency-key-3' }))).rejects.toThrow('BUSINESS_RULE_VIOLATION');
    await expect(gateway.registerNovelty(emergency('SAL-018', 'RES-1001', { key: 'emergency-key-4' }))).rejects.toThrow('INVALID_STATUS_TRANSITION');
  });
});
