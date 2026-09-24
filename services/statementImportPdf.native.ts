import { File } from 'expo-file-system/next';
import { sha256 } from 'js-sha256';

import type { ParsedStatement } from '~/features/settings/lib/statementImport';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

export type StatementPdfErrorCode =
  | 'password_required'
  | 'incorrect_password'
  | 'pro_required'
  | 'limit_reached'
  | 'pdf_too_large'
  | 'invalid_pdf'
  | 'too_many_pages'
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

export async function parseStatementPdf(args: {
  uri: string;
  appUserId: string;
  password?: string;
  accountName: string;
  currency: string;
  categories: string[];
}): Promise<ParsedPdfResponse> {
  const base = process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_STATEMENT_IMPORT?.trim()?.replace(
    /\/+$/,
    '',
  );
  if (!base) throw new StatementPdfError('server');
  const file = new File(args.uri);
  if (!file.exists) throw new StatementPdfError('invalid_pdf');
  if (file.size > MAX_FILE_BYTES) throw new StatementPdfError('pdf_too_large');
  const pdf = await file.base64();
  if (pdf.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 8)
    throw new StatementPdfError('pdf_too_large');

  const signingKey = process.env.EXPO_PUBLIC_REQUEST_SIGNING_KEY?.trim();
  const timestamp = Date.now().toString();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signingKey) {
    headers['X-Timestamp'] = timestamp;
    headers['X-Signature'] = sha256.hmac(signingKey, `${timestamp}.${args.appUserId}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${base}/parse`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        appUserId: args.appUserId,
        pdf,
        password: args.password,
        accountName: args.accountName,
        currency: args.currency,
        categories: args.categories,
      }),
    });
  } catch {
    throw new StatementPdfError('network');
  } finally {
    clearTimeout(timer);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new StatementPdfError('server');
  }
  if (!response.ok) {
    const code = (payload as { error?: string })?.error;
    const known: StatementPdfErrorCode[] = [
      'password_required',
      'incorrect_password',
      'pro_required',
      'limit_reached',
      'pdf_too_large',
      'invalid_pdf',
      'too_many_pages',
      'encrypted_scan_unreadable',
      'mixed_currency',
    ];
    throw new StatementPdfError(
      known.includes(code as StatementPdfErrorCode) ? (code as StatementPdfErrorCode) : 'server',
    );
  }
  const result = payload as ParsedPdfResponse;
  if (!Array.isArray(result?.transactions) || !result.quota) throw new StatementPdfError('server');
  return result;
}
