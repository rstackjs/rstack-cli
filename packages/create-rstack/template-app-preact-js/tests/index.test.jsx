import { render, screen } from '@testing-library/preact';
import { expect, test } from 'rstack/test';
import App from '../src/App';

test('renders the main page', () => {
  render(<App />);
  expect(screen.getByText('Rstack with Preact')).toBeInTheDocument();
});
