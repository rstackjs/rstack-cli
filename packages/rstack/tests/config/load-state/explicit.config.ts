import { define } from 'rstack';
import { title } from './explicit-dependency.ts';

define.app({
  html: {
    title,
  },
});
