import { define } from 'rstack';

define.app({});
define.plugins([{ name: 'discarded', setup() {} }]);
throw new Error('test config error');
