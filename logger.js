// logger.js
import { DEBUG_MODE } from './config.js';

/**
 * Logger module provides log-level methods.
 */
export const Logger = {
    debug: (...args) => {
        if (DEBUG_MODE) {
            console.debug('[DEBUG]', ...args);
        }
    },
    info: (...args) => {
        console.info('[INFO]', ...args);
    },
    warn: (...args) => {
        console.warn('[WARN]', ...args);
    },
    error: (...args) => {
        console.error('[ERROR]', ...args);
    },
};
