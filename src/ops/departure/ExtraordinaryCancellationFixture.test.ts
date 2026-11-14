import { describe, expect, it } from 'vitest';
import { createDepartureFixture } from './fixture';

// Spec 012 PT12-01 (AC-PT-12.1, -12.3, -12.4): the test data follow the rules of the service, so the development build behaves like it.
describe('the extraordinary cancellation on the test data', () => {
  it('U·a_reservation_in_execution_is_cancelled_with_its_justification_and_the_others_are_untouched', async () => {
    const gateway = createDepartureFixture();
    const answered = await gateway.recordExtraordinaryCancellation({
      code: 'SAL-021',
      reservationId: 'RES-1002',
      justification: ' Una emergencia médica ',
      key: 'cancel-key-1',
    });
    expect(answered.reservations[0].extraordinaryCancellation).toMatchObject({ justification: 'Una emergencia médica' });
    expect(answered.reservations[0].extraordinaryCancellation?.recordedAt).toBeTruthy();
    expect(answered.reservations[1].extraordinaryCancellation).toBeUndefined();
    const read = await gateway.getDeparture('SAL-021');
    expect(read?.reservations[0].extraordinaryCancellation?.justification).toBe('Una emergencia médica');
  });

  it('U·the_same_key_answers_the_same_and_a_second_cancellation_of_the_reservation_is_refused', async () => {
    const gateway = createDepartureFixture();
    const input = { code: 'SAL-021', reservationId: 'RES-1002', justification: 'Una emergencia', key: 'cancel-key-1' };
    const first = await gateway.recordExtraordinaryCancellation(input);
    expect(await gateway.recordExtraordinaryCancellation(input)).toEqual(first);
    await expect(gateway.recordExtraordinaryCancellation({ ...input, key: 'cancel-key-2' })).rejects.toThrow('BUSINESS_RULE_VIOLATION');
  });

  it('U·a_departure_not_in_execution_a_reservation_not_in_execution_or_an_empty_justification_is_refused', async () => {
    const gateway = createDepartureFixture();
    await expect(
      gateway.recordExtraordinaryCancellation({ code: 'SAL-018', reservationId: 'RES-1001', justification: 'x', key: 'cancel-key-1' }),
    ).rejects.toThrow('INVALID_STATUS_TRANSITION');
    // the body is judged before the state, as the service does
    await expect(
      gateway.recordExtraordinaryCancellation({ code: 'SAL-018', reservationId: 'RES-1001', justification: '', key: 'cancel-key-0' }),
    ).rejects.toThrow('VALIDATION_ERROR');
    await expect(
      gateway.recordExtraordinaryCancellation({ code: 'SAL-021', reservationId: 'RES-1002', justification: 'j'.repeat(501), key: 'cancel-key-5' }),
    ).rejects.toThrow('VALIDATION_ERROR');
    await expect(
      gateway.recordExtraordinaryCancellation({ code: 'SAL-021', reservationId: 'RES-9999', justification: 'x', key: 'cancel-key-2' }),
    ).rejects.toThrow('BUSINESS_RULE_VIOLATION');
    await expect(
      gateway.recordExtraordinaryCancellation({ code: 'SAL-021', reservationId: 'RES-1002', justification: '   ', key: 'cancel-key-3' }),
    ).rejects.toThrow('VALIDATION_ERROR');
  });
});
