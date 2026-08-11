import { render, screen } from '@solidjs/testing-library';
import { expect, test } from 'rstack/test';
import App from '../src/App';

test('renders the main page', () => {
  render(() => <App />);
  expect(screen.getByText('Rstack with Solid')).toBeInTheDocument();
});
