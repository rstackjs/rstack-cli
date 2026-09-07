import type { ComponentProps } from 'react';

export function Button({
  type = 'button',
  ...props
}: ComponentProps<'button'>) {
  return <button type={type} {...props} />;
}
