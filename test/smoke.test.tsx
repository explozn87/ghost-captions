import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { App } from '../src/ui/App';

// Smoke test for the scaffold (task 1.2): confirms that Vitest, the jsdom
// environment, React Testing Library and fast-check are all wired correctly.
describe('scaffold smoke test', () => {
  it('renders the app shell under jsdom', () => {
    render(<App />);
    expect(screen.getByText('Ghost Captions')).toBeInTheDocument();
  });

  it('runs fast-check property tests', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
    );
  });
});
