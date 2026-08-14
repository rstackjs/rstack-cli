import { expect, test } from 'rstack/test';
import { renderToString } from 'react-dom/server';
import App from '../src/App';

test('renders the app on the server', () => {
  const html = renderToString(<App />);

  expect(html).toContain('Rstack React SSR');
  expect(html).toContain('Rendered on the server');
});
