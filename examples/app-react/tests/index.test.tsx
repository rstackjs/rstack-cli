import { expect, test } from 'rstack/test';
import { render, screen } from '@testing-library/react';
import App from '../src/App';

test('renders the main page', () => {
  render(<App />);

  expect(screen.getByText('Rsbuild with React')).toBeInTheDocument();
});
