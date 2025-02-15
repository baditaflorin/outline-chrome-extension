// asyncWrapper.js
import { Logger } from './logger.js';
import { handleError as defaultHandleError } from './errorHandler.js';

/**
 * Wraps an async function, catching errors and passing them to a provided error handler.
 *
 * @param {Function} asyncFn - The asynchronous function to wrap.
 * @param {object} [context] - Optional context object (e.g., tab) for error handling.
 * @param {Function} [customErrorHandler] - Optional custom error handler function.
 * @returns {Function} A wrapped function that returns a promise.
 */
export function asyncWrapper(asyncFn, context, customErrorHandler) {
    return async (...args) => {
        try {
            return await asyncFn(...args);
        } catch (error) {
            Logger.error("Async function error:", error);
            if (context) {
                (customErrorHandler || defaultHandleError)(context, error);
            }
            throw error;
        }
    };
}
