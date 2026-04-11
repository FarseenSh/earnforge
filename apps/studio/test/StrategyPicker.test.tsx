// SPDX-License-Identifier: Apache-2.0
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StrategyPicker } from '@/components/StrategyPicker';

describe('StrategyPicker', () => {
  it('renders all strategy options', () => {
    render(<StrategyPicker value="" onChange={() => {}} />);
    const select = screen.getByTestId('strategy-picker');
    expect(select).toBeInTheDocument();

    const options = select.querySelectorAll('option');
    expect(options.length).toBe(5); // All Vaults + 4 strategies
  });

  it('displays the current value', () => {
    render(<StrategyPicker value="conservative" onChange={() => {}} />);
    const select = screen.getByTestId('strategy-picker') as HTMLSelectElement;
    expect(select.value).toBe('conservative');
  });

  it('calls onChange when a strategy is selected', () => {
    const onChange = vi.fn();
    render(<StrategyPicker value="" onChange={onChange} />);
    const select = screen.getByTestId('strategy-picker');
    fireEvent.change(select, { target: { value: 'max-apy' } });
    expect(onChange).toHaveBeenCalledWith('max-apy');
  });

  it('includes description text for each option', () => {
    render(<StrategyPicker value="" onChange={() => {}} />);
    const select = screen.getByTestId('strategy-picker');
    const options = select.querySelectorAll('option');
    // Check that descriptions are embedded
    const texts = Array.from(options).map((o) => o.textContent);
    expect(texts.some((t) => t?.includes('Stablecoins'))).toBe(true);
    expect(texts.some((t) => t?.includes('Highest APY'))).toBe(true);
    expect(texts.some((t) => t?.includes('Spread across'))).toBe(true);
    expect(texts.some((t) => t?.includes('Risk score'))).toBe(true);
  });

  it('has a label for accessibility', () => {
    render(<StrategyPicker value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Strategy')).toBeInTheDocument();
  });
});
