# Smart statement import Worker

This Worker accepts a PDF and an account from the app, checks the user's RevenueCat Pro entitlement, and extracts transactions with the same primary and backup OpenRouter models as receipt scanning. It reserves one of 100 monthly scans before calling the model and releases the reservation if the call fails. A successful response contains transactions for the app's review screen; the Worker does not save the PDF.

Requests are capped at 15 MB, PDFs at 10 MB and 20 pages, and extracted text at 120,000 characters. Statements above the text limit return an error before inference so later transactions are not silently omitted.

## Setup

The Worker shares the receipt scanner's D1 database and entitlement cache. Apply `../../d1/statement-import/schema.sql` before deploying. Configure these Worker secrets with the same values used by the receipt scanner:

- `OPENROUTER_API_KEY`
- `REVENUECAT_SECRET_KEY`
- `MONEY2TIME_REQUEST_SIGNING_KEY` when request signing is enabled in the app

The app needs `EXPO_PUBLIC_MONEY2TIME_WORKERS_STATEMENT_IMPORT` set to the Worker URL. PR previews receive the preview Worker URL from GitHub Actions. Production and development builds need the production URL in their Expo environment.

## Verification

Run `npm ci`, `npm run typecheck`, and `npm test` here. The integration test uses sample and password-locked PDFs with a local model stub. `npx wrangler deploy --dry-run` verifies the Cloudflare bundle. A live scan with a Pro account is still required after the secrets are installed.

Password-protected PDFs are unlocked in the Worker. Extracted text or decoded page images go to OpenRouter; the password and encrypted PDF are never sent. Protected, image-only PDFs are supported when PDF.js can decode a full-page image from each page. A locked PDF whose images cannot be decoded returns `encrypted_scan_unreadable`. Unprotected image-only PDFs use OpenRouter's PDF OCR parser.
