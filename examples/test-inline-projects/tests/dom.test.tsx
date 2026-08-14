import { expect, test } from 'rstack/test';
import { render, screen } from '@testing-library/react';
import App from '../src/App';

test('renders the app in a DOM environment', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: 'Rstack React SSR' })).toBeTruthy();
});
