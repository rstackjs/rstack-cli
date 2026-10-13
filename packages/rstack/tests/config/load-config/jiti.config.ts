import { define } from 'rstack';

enum Title {
  App = 'jiti config',
}

define.app({ html: { title: Title.App } });
