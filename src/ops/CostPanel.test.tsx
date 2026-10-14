import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CostPanel } from './CostPanel';
import { createFixtureGateway } from './fixtureGateway';

// Spec 003 PT-07 (RN-OPS-PT-20 to -26): the cost form of the Mockup, tied to a registered execution.
describe('cost panel', () => {
  it('U·cost_form_has_its_fields_and_needs_an_execution: nothing is sent without one', async () => {
    const gateway = createFixtureGateway();
    const spy = vi.spyOn(gateway, 'recordCost');
    render(<CostPanel gateway={gateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar costo' }));
    expect(screen.getByLabelText('Concepto')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Registrar costo' })[1]);
    expect(await screen.findByText('Selecciona una ejecución registrada para asociar el costo.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('U·cost_is_sent_in_minor_units_from_the_typed_text: 1.234,50 becomes 123450', async () => {
    const gateway = createFixtureGateway();
    const spy = vi.spyOn(gateway, 'recordCost');
    render(<CostPanel gateway={gateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar costo' }));
    fireEvent.change(await screen.findByLabelText('Ejecución asociada'), { target: { value: 'RES-0990' } });
    fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Transporte' } });
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '1.234,50' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Registrar costo' })[1]);
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ reservationId: 'RES-0990', concept: 'Transporte', amountCents: 123450 }));
    expect(await screen.findByText('Costo registrado.')).toBeInTheDocument();
  });
});
