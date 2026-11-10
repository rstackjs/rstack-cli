// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app(async () => {
  const { pluginReact } = await import('@rsbuild/plugin-react');
  return {
    plugins: [pluginReact()],
    html: { title: 'Web | Rstack' },
    server: { port: 3000 },
  };
});

define.test({
  setupFiles: ['./tests/rstest.setup.ts'],
});
