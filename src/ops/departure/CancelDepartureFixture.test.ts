import { describe, expect, it } from 'vitest';
import { createDepartureFixture } from './fixture';

// Spec 013 PT13-01 (AC-PT-13.1, -13.4, -13.5): the test data follow the rules of the service, so the development build behaves like it.
describe('the cancellation of a departure on the test data', () => {
  it('U·a_scheduled_departure_is_cancelled_with_its_record_and_the_same_key_answers_the_same', async () => {
    const gateway = createDepartureFixture();
    const input = { code: 'SAL-018', key: 'cancel-key-1' };
    const answered = await gateway.cancelDeparture!(input);
    expect(answered.status).toBe('CANCELLED');
    expect(answered.cancellation).toMatchObject({ cause: 'NOT_ATTRIBUTABLE_TO_CUSTOMER' });
    expect(answered.cancellation?.at).toBeTruthy();
    expect(answered.cancellation?.reason).toBeUndefined();
    expect(await gateway.cancelDeparture!(input)).toEqual(answered);
    expect((await gateway.getDeparture('SAL-018'))?.status).toBe('CANCELLED');
  });

  it('U·a_departure_that_is_not_scheduled_is_refused_and_a_cancelled_one_stays_cancelled', async () => {
    const gateway = createDepartureFixture();
    await expect(gateway.cancelDeparture!({ code: 'SAL-021', key: 'cancel-key-1' })).rejects.toThrow('INVALID_STATUS_TRANSITION');
    expect((await gateway.getDeparture('SAL-021'))?.status).toBe('IN_EXECUTION');
    const again = await gateway.cancelDeparture!({ code: 'SAL-003', key: 'cancel-key-2' });
    expect(again.status).toBe('CANCELLED');
  });

  it('U·not_performed_cancels_a_marked_departure_with_its_cause_and_an_empty_or_long_cause_is_refused', async () => {
    const gateway = createDepartureFixture();
    const base = { code: 'SAL-014', result: 'NOT_DONE' as const, startedAt: '', finishedAt: '', earlyStartMotive: '', interruption: '' };
    await expect(gateway.registerRegularization({ ...base, notDoneCause: '  ', key: 'k-1' })).rejects.toThrow('VALIDATION_ERROR');
    await expect(gateway.registerRegularization({ ...base, notDoneCause: 'r'.repeat(501), key: 'k-2' })).rejects.toThrow('VALIDATION_ERROR');
    const answered = await gateway.registerRegularization({ ...base, notDoneCause: ' Nadie llegó al punto de encuentro ', key: 'k-3' });
    expect(answered.status).toBe('CANCELLED');
    expect(answered.pendingRegularization).toBe(false);
    expect(answered.cancellation).toMatchObject({ cause: 'NOT_CARRIED_OUT', reason: 'Nadie llegó al punto de encuentro' });
  });
});
