import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Refused } from '../departures/model';
import { CostsPanel } from './CostsPanel';
import { createDepartureFixture } from './fixture';
import type { CostInput, CostLine, CostSheet, Departure, DepartureExecutionGateway } from './gateway';

const line = (extra: Partial<CostLine> = {}): CostLine => ({
  costId: 'c-1',
  concept: 'Barco y guía',
  amountCents: 8_400_000_000,
  mode: 'CALCULATED',
  unitCostCents: 2_100_000_000,
  travelersServed: 4,
  withoutParametrization: false,
  recordedAt: '2026-12-01T15:00:00Z',
  ...extra,
});

const sheet = (extra: Partial<CostSheet> = {}): CostSheet => ({ lines: [], totalCents: 0, travelersServed: 4, baseCostCents: 2_100_000_000, ...extra });

// The fixture gateway with the costs the test chooses: the panel only talks to the two methods of the costs.
function gatewayWith(read: () => Promise<CostSheet>, record: (input: CostInput) => Promise<CostLine> = async () => line()): DepartureExecutionGateway {
  return { ...createDepartureFixture(), getCosts: read, recordCost: record };
}

async function open(code: string, gateway: DepartureExecutionGateway, canManage = true) {
  const departure = (await gateway.getDeparture(code)) as Departure;
  render(<CostsPanel departure={departure} gateway={gateway} canManage={canManage} onChanged={vi.fn()} />);
}

const panel = async () => (await screen.findByRole('heading', { name: 'Registro real de la ejecución' })).closest('section') as HTMLElement;

// Spec 011 PT11-02 (AC-PT-11.1 to -11.7): the panel of the operational costs of a departure.
describe('the list of costs (AC-PT-11.1)', () => {
  it('U·the_panel_shows_the_lines_the_origin_the_justification_and_the_total', async () => {
    const lines = [line(), line({ costId: 'c-2', concept: 'Combustible', amountCents: 5_000_000, mode: 'MANUAL', unitCostCents: undefined, travelersServed: undefined, withoutParametrization: true, justification: 'Pagado en el muelle' })];
    await open('SAL-021', gatewayWith(async () => sheet({ lines, totalCents: 8_405_000_000 })));
    const root = await panel();
    expect(await within(root).findByText('Barco y guía')).toBeInTheDocument();
    expect(within(root).getByText('Calculado')).toBeInTheDocument();
    expect(within(root).getByText('Gasto real')).toBeInTheDocument();
    expect(within(root).getByText('Pagado en el muelle')).toBeInTheDocument();
    expect(within(root).getByText(/Total:.*84\.050\.000/)).toBeInTheDocument();
    expect(within(root).getByText(/Viajeros atendidos: 4/)).toBeInTheDocument();
  });

  it('U·the_panel_is_not_drawn_before_the_start_it_only_says_when_it_will_be_available', async () => {
    const read = vi.fn(async () => sheet());
    await open('SAL-018', gatewayWith(read));
    expect(await screen.findByText('Disponible cuando la salida haya iniciado.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Concepto')).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

  it('U·the_panel_has_its_four_states: loading, error with retry, empty and data', async () => {
    let attempt = 0;
    await open('SAL-021', gatewayWith(async () => (++attempt === 1 ? Promise.reject(new Error('network')) : sheet({ lines: [] }))));
    const root = await panel();
    expect(within(root).getByRole('status')).toHaveTextContent('Cargando');
    fireEvent.click(await within(root).findByRole('button', { name: 'Reintentar' }));
    expect(await within(root).findByText('Aún no hay costos registrados para esta salida.')).toBeInTheDocument();
  });

  it('U·the_panel_is_not_offered_without_the_permission', async () => {
    await open('SAL-021', gatewayWith(async () => sheet()), false);
    expect(screen.queryByRole('heading', { name: 'Registro real de la ejecución' })).not.toBeInTheDocument();
  });
});

describe('recording a real expense (AC-PT-11.2)', () => {
  it('U·the_amount_is_turned_into_minor_units_from_the_text_typed_and_a_bad_one_is_refused_beside_the_field', async () => {
    const record = vi.fn(async (_: CostInput) => line({ mode: 'MANUAL' }));
    await open('SAL-021', gatewayWith(async () => sheet(), record));
    const root = await panel();
    fireEvent.change(await within(root).findByLabelText('Concepto'), { target: { value: 'Combustible' } });
    for (const bad of ['', 'abc', '0', '1,234']) {
      fireEvent.change(within(root).getByLabelText('Valor'), { target: { value: bad } });
      fireEvent.click(within(root).getByRole('button', { name: 'Registrar costo' }));
      expect(await within(root).findByText('Escribe un valor mayor a $0 (por ejemplo 12500 o 12500,50).')).toBeInTheDocument();
    }
    expect(record).not.toHaveBeenCalled();
    fireEvent.change(within(root).getByLabelText('Valor'), { target: { value: '12500,50' } });
    fireEvent.click(within(root).getByRole('button', { name: 'Registrar costo' }));
    expect(await within(root).findByText(/Costo registrado y asociado a la salida SAL-021/)).toBeInTheDocument();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ code: 'SAL-021', concept: 'Combustible', mode: 'MANUAL', amountCents: 1250050 }));
  });

  it('U·the_concept_is_required', async () => {
    const record = vi.fn(async (_: CostInput) => line());
    await open('SAL-021', gatewayWith(async () => sheet(), record));
    const root = await panel();
    fireEvent.change(await within(root).findByLabelText('Valor'), { target: { value: '5000' } });
    fireEvent.click(within(root).getByRole('button', { name: 'Registrar costo' }));
    expect(await within(root).findByText('Escribe el concepto del costo.')).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
  });
});

describe('the calculation and the missing parametrization (AC-PT-11.3 to -11.5)', () => {
  it('U·the_calculation_shows_both_figures_and_sends_only_the_concept', async () => {
    const record = vi.fn(async (_: CostInput) => line());
    await open('SAL-021', gatewayWith(async () => sheet(), record));
    const root = await panel();
    expect(await within(root).findByText(/Costo parametrizado × viajeros atendidos/)).toHaveTextContent(/21\.000.*4.*84\.000/);
    fireEvent.change(within(root).getByLabelText('Concepto'), { target: { value: 'Barco y guía' } });
    fireEvent.click(within(root).getByRole('button', { name: 'Calcular con la parametrización' }));
    await within(root).findByText(/Costo registrado y asociado a la salida SAL-021/);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ mode: 'CALCULATED', concept: 'Barco y guía' }));
    expect(record.mock.calls[0][0].amountCents).toBe(0);
  });

  it('U·without_travelers_served_the_calculation_is_not_offered', async () => {
    await open('SAL-021', gatewayWith(async () => sheet({ travelersServed: 0 })));
    const root = await panel();
    expect(await within(root).findByText('Registra los servicios prestados para calcular el costo.')).toBeInTheDocument();
    expect(within(root).queryByRole('button', { name: 'Calcular con la parametrización' })).not.toBeInTheDocument();
  });

  it('U·without_a_catalogued_cost_the_justification_is_required_and_the_calculation_is_not_offered', async () => {
    const record = vi.fn(async (_: CostInput) => line({ mode: 'MANUAL' }));
    await open('SAL-021', gatewayWith(async () => sheet({ baseCostCents: undefined }), record));
    const root = await panel();
    expect(await within(root).findByText('Este tour no tiene costo parametrizado: justifica el valor.')).toBeInTheDocument();
    expect(within(root).queryByRole('button', { name: 'Calcular con la parametrización' })).not.toBeInTheDocument();
    fireEvent.change(within(root).getByLabelText('Concepto'), { target: { value: 'Combustible' } });
    fireEvent.change(within(root).getByLabelText('Valor'), { target: { value: '5000' } });
    fireEvent.click(within(root).getByRole('button', { name: 'Registrar costo' }));
    expect(await within(root).findByText('Justifica el valor: el tour no tiene costo parametrizado.')).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
    fireEvent.change(within(root).getByLabelText('Justificación'), { target: { value: 'Pagado en el muelle' } });
    fireEvent.click(within(root).getByRole('button', { name: 'Registrar costo' }));
    await within(root).findByText(/Costo registrado/);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ mode: 'MANUAL', justification: 'Pagado en el muelle' }));
  });

  it('U·with_a_catalogued_cost_no_justification_is_asked_nor_sent', async () => {
    const record = vi.fn(async (_: CostInput) => line({ mode: 'MANUAL' }));
    await open('SAL-021', gatewayWith(async () => sheet(), record));
    const root = await panel();
    expect(await within(root).findByLabelText('Concepto')).toBeInTheDocument();
    expect(within(root).queryByLabelText('Justificación')).not.toBeInTheDocument();
  });
});

describe('sending (AC-PT-11.6)', () => {
  it('U·a_retry_keeps_the_key_changed_data_gets_a_new_one_and_a_refusal_keeps_the_data', async () => {
    const keys: string[] = [];
    let mode: 'network' | 'refused' | 'ok' = 'network';
    const record = vi.fn(async (input: CostInput) => {
      keys.push(input.key);
      if (mode === 'network') throw new Error('network');
      if (mode === 'refused') throw new Refused('BUSINESS_RULE_VIOLATION');
      return line({ mode: 'MANUAL' });
    });
    await open('SAL-021', gatewayWith(async () => sheet(), record));
    const root = await panel();
    fireEvent.change(await within(root).findByLabelText('Concepto'), { target: { value: 'Combustible' } });
    fireEvent.change(within(root).getByLabelText('Valor'), { target: { value: '5000' } });
    fireEvent.click(within(root).getByRole('button', { name: 'Registrar costo' }));
    mode = 'ok';
    fireEvent.click(await within(root).findByRole('button', { name: 'Reintentar' }));
    await within(root).findByText(/Costo registrado/);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    mode = 'refused';
    fireEvent.change(within(root).getByLabelText('Concepto'), { target: { value: 'Peaje' } });
    fireEvent.change(within(root).getByLabelText('Valor'), { target: { value: '7000' } });
    fireEvent.click(within(root).getByRole('button', { name: 'Registrar costo' }));
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[2]).not.toBe(keys[0]);
    expect(await within(root).findByRole('alert')).toHaveTextContent('Tus datos siguen aquí');
    expect(within(root).getByLabelText('Concepto')).toHaveValue('Peaje');
    expect(within(root).getByLabelText('Valor')).toHaveValue('7000');
  });

  it('U·the_button_is_disabled_while_the_send_is_pending', async () => {
    let finish: (l: CostLine) => void = () => {};
    const record = vi.fn(() => new Promise<CostLine>((resolve) => (finish = resolve)));
    await open('SAL-021', gatewayWith(async () => sheet(), record));
    const root = await panel();
    fireEvent.change(await within(root).findByLabelText('Concepto'), { target: { value: 'Combustible' } });
    fireEvent.change(within(root).getByLabelText('Valor'), { target: { value: '5000' } });
    fireEvent.click(within(root).getByRole('button', { name: 'Registrar costo' }));
    await waitFor(() => expect(within(root).getByRole('button', { name: 'Registrar costo' })).toBeDisabled());
    finish(line({ mode: 'MANUAL' }));
    await within(root).findByText(/Costo registrado/);
  });
});
