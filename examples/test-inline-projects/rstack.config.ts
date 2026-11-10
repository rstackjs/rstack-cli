// Configuration guide: https://rstack.rs/config
import { pluginReact } from '@rsbuild/plugin-react';
import { define } from 'rstack';

define.app({
  plugins: [pluginReact()],
});

define.test(async () => {
  const { defineInlineProject } = await import('rstack/test');
  return {
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
  };
});
