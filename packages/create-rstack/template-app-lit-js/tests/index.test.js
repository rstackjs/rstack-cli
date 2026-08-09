import { expect, test } from 'rstack/test';
import { MyElement } from '../src/my-element';

test('renders the main page', async () => {
  customElements.define('my-element', MyElement);
  const element = document.createElement('my-element');
  document.body.append(element);

  await element.updateComplete;

  expect(element.shadowRoot?.textContent).toContain('Rstack with Lit');
});
