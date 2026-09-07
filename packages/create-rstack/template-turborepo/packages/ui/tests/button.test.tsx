import { expect, test } from 'rstack/test';
import { render, screen } from '@testing-library/react';
import { Button } from '../src/button';

test('defaults to a non-submitting button and forwards props', () => {
  render(<Button disabled>Save</Button>);
  const button = screen.getByRole('button', { name: 'Save' });
  expect(button).toHaveAttribute('type', 'button');
  expect(button).toBeDisabled();
});

test('allows a submit button', () => {
  render(<Button type="submit">Submit</Button>);
  expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute(
    'type',
    'submit',
  );
});
