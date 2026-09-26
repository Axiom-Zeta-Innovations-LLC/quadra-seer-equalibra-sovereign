import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SimulationVisualizer from './SimulationVisualizer';

vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: { name: 'Test', colors: {} },
    changeTheme: () => {},
    saveCustomTheme: () => {},
    availableThemes: [],
  }),
}));

describe('SimulationVisualizer memory mode', () => {
  it('defaults to retrieval-first rendering and supports click-through detail pane', async () => {
    const recallSimulations = vi.fn().mockResolvedValue([
      {
        id: 'sim-1',
        scenario: 'Investigate anomaly in coastal telemetry stream',
        confidence: 0.87,
        timestamp: 1700000000000,
        content: {
          outcome: 'success',
          timestamp: 1700000000000,
        },
      },
    ]);

    render(
      <SimulationVisualizer
        history={[]}
        messages={[]}
        recallSimulations={recallSimulations}
        simulationWrites={0}
      />,
    );

    await waitFor(() => {
      expect(recallSimulations).toHaveBeenCalledWith('', 60);
    });

    expect(screen.getByTestId('simulation-memory-mode')).toBeTruthy();
    expect(screen.getByText('Investigate anomaly in coastal telemetry stream')).toBeTruthy();

    fireEvent.click(screen.getByText('Investigate anomaly in coastal telemetry stream'));

    expect(screen.getByText('Simulation Detail')).toBeTruthy();
    expect(screen.getByText(/Outcome:/)).toBeTruthy();
    expect(screen.getByText(/Confidence:/)).toBeTruthy();
  });

  it('supports latest/highest-confidence sorting and outcome filtering chips', async () => {
    const recallSimulations = vi.fn().mockResolvedValue([
      {
        id: 'sim-latest-low',
        scenario: 'Recent but low confidence scenario',
        confidence: 0.21,
        timestamp: 1900000000000,
        content: {
          outcome: 'success',
          timestamp: 1900000000000,
        },
      },
      {
        id: 'sim-older-high',
        scenario: 'Older but high confidence scenario',
        confidence: 0.93,
        timestamp: 1800000000000,
        content: {
          outcome: 'failure',
          timestamp: 1800000000000,
        },
      },
    ]);

    const { container } = render(
      <SimulationVisualizer
        history={[]}
        messages={[]}
        recallSimulations={recallSimulations}
        simulationWrites={0}
      />,
    );

    await waitFor(() => {
      expect(recallSimulations).toHaveBeenCalledWith('', 60);
    });

    const firstCardBeforeSort = container.querySelector('[data-testid^="memory-card-"]');
    expect(firstCardBeforeSort?.getAttribute('data-testid')).toBe('memory-card-sim-latest-low');

    fireEvent.click(screen.getByTestId('memory-sort-highest-confidence'));

    const firstCardAfterSort = container.querySelector('[data-testid^="memory-card-"]');
    expect(firstCardAfterSort?.getAttribute('data-testid')).toBe('memory-card-sim-older-high');

    fireEvent.click(screen.getByTestId('memory-filter-failure'));

    await waitFor(() => {
      expect(screen.getByText('Older but high confidence scenario')).toBeTruthy();
    });

    expect(screen.queryByText('Recent but low confidence scenario')).toBeNull();
  });
});
