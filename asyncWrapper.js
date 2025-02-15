// asyncWrapper.js
// Utility function to wrap async functions for uniform error handling.
import { Logger } from './logger.js';
import { handleError } from './errorHandler.js';

/**
 * Wraps an async function, catching errors and passing them to a provided error handler.
 *
 * @param {Function} asyncFn - The asynchronous function to wrap.
 * @param {object} [context] - Optional context object (e.g., tab) for error handling.
 * @returns {Function} A wrapped function that returns a promise.
 */
export function asyncWrapper(asyncFn, context) {
    return async (...args) => {
        try {
            return await asyncFn(...args);
        } catch (error) {
            Logger.error("Async function error:", error);
            if (context) {
                handleError(context, error);
            }
            throw error;
        }
    };
}
