import { expect, test } from 'rstack/test';
import { render, screen } from '@testing-library/vue';
import App from '../src/App.vue';

test('renders the main page', () => {
  render(App);
  expect(screen.getByText('Rstack with Vue')).toBeInTheDocument();
});
