import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFixtureGateway } from './fixtureGateway';
import { OperationsPage } from './OperationsPage';

const setup = (gateway = createFixtureGateway()) => {
  const onRegister = vi.fn();
  render(<OperationsPage gateway={gateway} onRegister={onRegister} />);
  return { gateway, onRegister };
};

// Spec 001 PT-03 and PT-04 (RN-OPS-PT-01 to -05): the page of the Mockup admin-operacion.html over the test data.
describe('operations page', () => {
  it('U·upcoming_panel_has_its_columns_and_the_right_action: only confirmed rows can register an execution', async () => {
    const { onRegister } = setup();
    const panel = (await screen.findByRole('heading', { name: 'Salidas por preparar' })).closest('section') as HTMLElement;
    expect(within(panel).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Fecha', 'Servicio', 'Reserva', 'Estado', 'Acción']);
    const buttons = within(panel).getAllByRole('button', { name: 'Registrar ejecución' });
    fireEvent.click(buttons[0]);
    expect(onRegister).toHaveBeenCalledWith('RES-1001');
    expect(within(panel).getByText('Pendiente de confirmar')).toBeInTheDocument();
    expect(within(panel).getAllByText('Pendiente de confirmar')).toHaveLength(1);
  });

  it('U·executions_table_has_its_columns_and_finish_removes_the_action: nothing changes without the button', async () => {
    setup();
    const panel = (await screen.findByRole('heading', { name: 'Ejecuciones registradas' })).closest('section') as HTMLElement;
    expect(within(panel).getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'Reserva', 'Fecha', 'Servicio', 'Reservado', 'Ejecutado', 'Causal', 'Estado', 'Responsable', 'Acción',
    ]);
    expect(within(panel).getByText('En curso')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Finalizar ejecución' }));
    expect(await within(panel).findByText('Finalizada')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Finalizar ejecución' })).not.toBeInTheDocument();
  });

  it('U·operations_has_four_states: loading, error with retry, empty and data', async () => {
    const gateway = createFixtureGateway();
    const upcoming = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce([]);
    render(<OperationsPage gateway={{ ...gateway, listUpcoming: upcoming }} onRegister={vi.fn()} />);
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('Cargando');
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No hay próximas ejecuciones pendientes de preparar.')).toBeInTheDocument();
  });
});
