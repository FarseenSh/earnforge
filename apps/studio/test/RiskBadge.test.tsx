// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RiskBadge } from '@/components/RiskBadge';

describe('RiskBadge', () => {
  it('renders a low risk badge with green styling', () => {
    render(<RiskBadge score={8.5} label="low" />);
    const badge = screen.getByTestId('risk-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('8.5');
    expect(badge).toHaveTextContent('low');
    expect(badge.className).toContain('green');
  });

  it('renders a medium risk badge with yellow styling', () => {
    render(<RiskBadge score={5.0} label="medium" />);
    const badge = screen.getByTestId('risk-badge');
    expect(badge).toHaveTextContent('5.0');
    expect(badge).toHaveTextContent('medium');
    expect(badge.className).toContain('yellow');
  });

  it('renders a high risk badge with red styling', () => {
    render(<RiskBadge score={2.0} label="high" />);
    const badge = screen.getByTestId('risk-badge');
    expect(badge).toHaveTextContent('2.0');
    expect(badge).toHaveTextContent('high');
    expect(badge.className).toContain('red');
  });

  it('formats score to one decimal place', () => {
    render(<RiskBadge score={7} label="low" />);
    const badge = screen.getByTestId('risk-badge');
    expect(badge).toHaveTextContent('7.0');
  });

  it('handles boundary score of exactly 7 as green', () => {
    render(<RiskBadge score={7} label="low" />);
    const badge = screen.getByTestId('risk-badge');
    expect(badge.className).toContain('green');
  });

  it('handles boundary score of exactly 4 as yellow', () => {
    render(<RiskBadge score={4} label="medium" />);
    const badge = screen.getByTestId('risk-badge');
    expect(badge.className).toContain('yellow');
  });
});
