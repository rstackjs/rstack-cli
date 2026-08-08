import { expect, test } from 'rstack/test';
import { render, screen } from '@testing-library/vue';
import Button from '../src/Button.vue';

test('The button should have correct background color', async () => {
  render(Button, {
    props: {
      backgroundColor: '#ccc',
      label: 'Demo Button',
    },
  });
  const button = screen.getByText('Demo Button');
  expect(button).toHaveStyle({
    backgroundColor: '#ccc',
  });
});
