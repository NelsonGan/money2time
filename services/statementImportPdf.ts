import type { ParsedStatement } from '~/features/settings/lib/statementImport';

export type StatementPdfErrorCode =
  | 'password_required'
  | 'incorrect_password'
  | 'pro_required'
  | 'limit_reached'
  | 'pdf_too_large'
  | 'invalid_pdf'
  | 'too_many_pages'
  | 'statement_too_long'
  | 'encrypted_scan_unreadable'
  | 'mixed_currency'
  | 'network'
  | 'server';

export class StatementPdfError extends Error {
  constructor(public code: StatementPdfErrorCode) {
    super(code);
  }
}

export interface ParsedPdfResponse extends ParsedStatement {
  quota: { used: number; limit: number };
}

export async function parseStatementPdf(_args: {
  uri: string;
  appUserId: string;
  password?: string;
  accountName: string;
  currency: string;
  categories: string[];
}): Promise<ParsedPdfResponse> {
  throw new StatementPdfError('server');
}
