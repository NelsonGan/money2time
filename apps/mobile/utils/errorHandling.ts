import { I18n } from '~/lib/i18n';

export function getErrorMessage(
  error: unknown,
  fallbackMessage: string = I18n.t('errors.generic_operation_failed'),
): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return fallbackMessage;
}

export function toError(
  error: unknown,
  fallbackMessage: string = I18n.t('errors.generic_operation_failed'),
): Error {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error;
  }
  return new Error(getErrorMessage(error, fallbackMessage));
}
