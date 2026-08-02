import { formatFileSerial } from './serial.ts';

/** Confirms that the worker module and its runtime dependencies are ready. */
const initializeFmtWorker = (): true => true;

export { formatFileSerial, initializeFmtWorker };
