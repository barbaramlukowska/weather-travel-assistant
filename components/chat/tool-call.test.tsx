import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Cloud } from 'lucide-react';
import { MemoryToolCall, ToolCall } from './message-item';
import type { ToolOutput, ToolPart } from './types';

// A minimal stand-in output: real cards render their own fields, but the
// state machine (loading → card → not-found → error) doesn't care which
// tool it's wrapping — that's the whole point of testing it in isolation.
type FakeOutput = { found: true; label: string } | { found: false; city: string };

function renderToolCall(part: ToolPart<FakeOutput & ToolOutput>) {
  return render(
    <ToolCall
      part={part}
      icon={Cloud}
      loadingLabel="Loading weather for"
      errorLabel="Weather lookup failed"
      renderCard={(output) => <div data-testid="card">{output.label}</div>}
    />,
  );
}

describe('ToolCall state machine', () => {
  it('shows a loading chip while input is streaming', () => {
    renderToolCall({ state: 'input-streaming', input: { city: 'Lisbon' } });
    expect(screen.getByText(/Loading weather for/)).toBeInTheDocument();
    expect(screen.getByText(/Lisbon/)).toBeInTheDocument();
  });

  it('shows a loading chip once input is available', () => {
    renderToolCall({ state: 'input-available', input: { city: 'Lisbon' } });
    expect(screen.getByText(/Loading weather for/)).toBeInTheDocument();
  });

  it('renders the card when the tool found a result', () => {
    renderToolCall({
      state: 'output-available',
      input: { city: 'Lisbon' },
      output: { found: true, label: 'Lisbon, Portugal' },
    });
    expect(screen.getByTestId('card')).toHaveTextContent('Lisbon, Portugal');
  });

  it('shows a "not found" chip when the tool found nothing', () => {
    renderToolCall({
      state: 'output-available',
      input: { city: 'Xyzzyville' },
      output: { found: false, city: 'Xyzzyville' },
    });
    expect(screen.getByText(/Couldn.t find/)).toBeInTheDocument();
    expect(screen.getByText(/Xyzzyville/)).toBeInTheDocument();
    expect(screen.queryByTestId('card')).not.toBeInTheDocument();
  });

  it('shows an error chip when the tool call failed', () => {
    renderToolCall({ state: 'output-error', input: { city: 'Lisbon' }, errorText: 'boom' });
    expect(screen.getByText('Weather lookup failed')).toBeInTheDocument();
  });
});

describe('MemoryToolCall states', () => {
  const labels = { pendingLabel: 'Remembering…', errorLabel: "Couldn't save that preference" };

  it('shows a pending chip while the call is in flight', () => {
    render(<MemoryToolCall part={{ state: 'input-available' }} {...labels} />);
    expect(screen.getByText('Remembering…')).toBeInTheDocument();
  });

  it('shows the memory card once the browser saved the fact', () => {
    render(
      <MemoryToolCall
        part={{
          state: 'output-available',
          output: { saved: true, category: 'climate', value: { maxComfortC: 28 } },
        }}
        {...labels}
      />,
    );
    expect(screen.getByText('Climate — comfortable up to 28 °C')).toBeInTheDocument();
  });

  it('shows an error chip when the browser could not save', () => {
    render(<MemoryToolCall part={{ state: 'output-error', errorText: 'blocked' }} {...labels} />);
    expect(screen.getByText("Couldn't save that preference")).toBeInTheDocument();
  });

  it('shows the memory card for a saved note', () => {
    render(
      <MemoryToolCall
        part={{ state: 'output-available', output: { saved: true, category: 'notes', value: { text: 'vegetarian' } } }}
        {...labels}
      />,
    );
    expect(screen.getByText('Note — vegetarian')).toBeInTheDocument();
  });
});
