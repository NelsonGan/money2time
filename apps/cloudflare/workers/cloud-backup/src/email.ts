// The sign-in code email. Plain and short: the code is the whole message, and
// it says plainly what to do if the reader did not ask for it.

export function signInCodeEmail(code: string) {
  const subject = `${code} is your Money2Time sign-in code`;
  const text = [
    `Your Money2Time sign-in code is ${code}.`,
    '',
    'It expires in 10 minutes. If you did not try to sign in, you can ignore this email.',
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#FCFAF5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1A2E2A">
<div style="max-width:440px;margin:0 auto;padding:32px 24px">
<p style="font-size:15px;margin:0 0 16px">Your Money2Time sign-in code:</p>
<p style="font-size:34px;font-weight:800;letter-spacing:8px;margin:0 0 20px;color:#B1525F">${code}</p>
<p style="font-size:13px;color:#6B7A77;margin:0">It expires in 10 minutes. If you did not try to sign in, you can ignore this email.</p>
</div></body></html>`;
  return { subject, text, html };
}
