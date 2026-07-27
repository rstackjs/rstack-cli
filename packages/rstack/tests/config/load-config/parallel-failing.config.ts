import { define } from 'rstack';

define.app({ root: 'failing' });
throw new Error('parallel config error');
