import { expect, test } from 'rstack/test';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App';

test('renders the web app with the shared UI package', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Web' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Shared button' }),
  ).toBeInTheDocument();
});
