import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DepartureExecutionPage } from './DepartureExecutionPage';
import { createDepartureFixture } from './fixture';
import type { DepartureExecutionGateway } from './gateway';

const setup = (code: string, gateway: DepartureExecutionGateway = createDepartureFixture()) => {
  render(<DepartureExecutionPage gateway={gateway} code={code} canManage onBack={vi.fn()} />);
  return gateway;
};

const section = async (name: string) => (await screen.findByRole('heading', { name })).closest('section') as HTMLElement;

// Spec 004 PT-08 (RN-OPS-PT-34 to -37, -40, -41): novelties of an executing departure.
describe('novelties (RN-OPS-PT-36)', () => {
  it('U·novelty_requires_text_and_emergency_has_affected_travelers: the text, then the integer from 1 to the reserved', async () => {
    const gateway = setup('SAL-021');
    const spy = vi.spyOn(gateway, 'registerNovelty');
    const panel = await section('Novedades y emergencia personal del cliente');
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar novedad' }));
    expect(await within(panel).findByText('Ingresa la novedad.')).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText('Novedad'), { target: { value: 'Pinchazo de llanta' } });
    expect(within(panel).queryByLabelText('Viajeros afectados')).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByLabelText(/Emergencia personal del cliente/));
    fireEvent.change(within(panel).getByLabelText('Viajeros afectados'), { target: { value: '9' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar novedad' }));
    expect(await within(panel).findByText('Ingresa un número entero de 1 a 4.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(within(panel).getByLabelText('Viajeros afectados'), { target: { value: '2' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar novedad' }));
    expect(await within(panel).findByText('Emergencia personal')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
