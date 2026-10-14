import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFixtureGateway } from './fixtureGateway';
import { parseMoney } from './money';
import { RegisterExecutionForm } from './RegisterExecutionForm';

const setup = (gateway = createFixtureGateway()) => {
  const onBack = vi.fn();
  render(<RegisterExecutionForm gateway={gateway} reservationId="RES-1001" onBack={onBack} />);
  return { gateway, onBack };
};

// Spec 002 PT-06 (RN-OPS-PT-10 to -16): the page of the Mockup admin-registrar-ejecucion.html over test data.
describe('register execution form', () => {
  it('U·reserved_data_is_read_only_and_labelled', async () => {
    setup();
    const code = await screen.findByLabelText('Reserva');
    expect(code).toHaveAttribute('readonly');
    expect(code).toHaveValue('RES-1001');
    expect(screen.getByLabelText('Viajeros reservados')).toHaveAttribute('readonly');
  });

  it('U·result_is_required_and_causal_is_required_when_not_served: the error is next to the field', async () => {
    const { gateway } = setup();
    const spy = vi.spyOn(gateway, 'registerExecution');
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar ejecución' }));
    expect(await screen.findByText('Selecciona si el servicio se prestó.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: 'no' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ejecución' }));
    expect(await screen.findByText('La causal de no prestación es obligatoria.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('U·registered_execution_appears_in_the_list_and_returns: one call, then back to the operation', async () => {
    const { gateway, onBack } = setup();
    const spy = vi.spyOn(gateway, 'registerExecution');
    fireEvent.change(await screen.findByLabelText('Resultado'), { target: { value: 'si' } });
    fireEvent.change(screen.getByLabelText('Viajeros ejecutados'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ejecución' }));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await gateway.listExecutions()).some((e) => e.reservationId === 'RES-1001' && e.executed === 4)).toBe(true);
  });
});

describe('parseMoney (RN-OPS-PT-20 to -26)', () => {
  it.each([
    ['1000', 100000],
    ['1.234,50', 123450],
    ['0,07', 7],
    ['12', 1200],
  ])('converts "%s" to %i minor units without floats', (text, cents) => {
    expect(parseMoney(text)).toBe(cents);
  });
  it.each(['', '0', '-5', 'abc', '1,234'])('rejects "%s"', (text) => {
    expect(parseMoney(text)).toBeUndefined();
  });
});
