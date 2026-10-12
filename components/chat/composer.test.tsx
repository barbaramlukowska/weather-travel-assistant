import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MAX_INPUT_CHARS } from '@/lib/limits';
import { Composer } from './composer';

function renderComposer(props: { disabled?: boolean; input?: string } = {}) {
  render(
    <Composer
      input={props.input ?? 'Hi'}
      isBusy={false}
      disabled={props.disabled}
      onInputChange={vi.fn()}
      onSubmit={vi.fn()}
      onStop={vi.fn()}
    />,
  );
}

describe('Composer', () => {
  it('caps one message at 2000 characters', () => {
    renderComposer();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveAttribute('maxlength', String(MAX_INPUT_CHARS));
  });

  // The server-rendered skeleton: nothing can be sent before the chat loads.
  it('can be switched off entirely', () => {
    renderComposer({ disabled: true });
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
