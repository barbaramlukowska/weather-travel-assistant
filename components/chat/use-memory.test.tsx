import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { saveFact } from '@/lib/memory';
import { useMemory } from './use-memory';

function Probe() {
  const memory = useMemory();
  return <span data-testid="probe">{memory.homeCity ?? 'none'}</span>;
}

beforeEach(() => {
  localStorage.clear();
});

describe('useMemory', () => {
  it('reads what is saved in this browser', () => {
    saveFact('homeCity', 'Kraków');
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('Kraków');
  });

  it('re-renders when memory changes', () => {
    render(<Probe />);
    act(() => {
      saveFact('homeCity', 'Gdańsk');
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('Gdańsk');
  });

  // Review Focus 5: the server has no localStorage. Rendering the empty
  // server snapshot there keeps the server HTML and the first client render
  // identical, so hydration never mismatches.
  it('renders empty memory on the server', () => {
    saveFact('homeCity', 'Kraków');
    expect(renderToString(<Probe />)).toContain('none');
  });
});
