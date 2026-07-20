import { define } from 'rstack';
import { defineInlineProject } from 'rstack/test';

define.app(async () => {
  const { pluginReact } = await import('@rsbuild/plugin-react');

  return {
    plugins: [pluginReact()],
  };
});

define.test({
  projects: [
    defineInlineProject({
      name: 'ssr',
      include: ['./tests/ssr.test.tsx'],
      testEnvironment: 'node',
    }),
    defineInlineProject({
      name: 'dom',
      include: ['./tests/dom.test.tsx'],
      testEnvironment: 'happy-dom',
    }),
  ],
});
