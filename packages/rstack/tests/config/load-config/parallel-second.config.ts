import { define } from 'rstack';

define.app({ root: 'second' });
define.lib({});
define.plugins([{ name: 'second', setup() {} }]);
