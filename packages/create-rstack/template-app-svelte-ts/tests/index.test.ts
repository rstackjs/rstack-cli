import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'rstack/test';
import App from '../src/App.svelte';

test('renders the main page', () => {
  render(App, {
    tool: 'Rstack',
    framework: 'Svelte',
  });
  expect(screen.getByText('Rstack with Svelte')).toBeInTheDocument();
});
