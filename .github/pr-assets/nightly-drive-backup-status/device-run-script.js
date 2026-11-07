(() => {
  const mods = globalThis.__r.getModules();
  const find = (re) => {
    for (const [id, m] of mods) if (re.test(m.verboseName || '')) return m.publicModule.exports;
  };
  const auth = find(/autoBackupProviders\/googleDriveAuth\.ts$/);
  const an = find(/services\/analytics\.native\.ts$/);
  const backup = find(/services\/autoBackup\.native\.ts$/);
  const settings = find(/lib\/repositories\/settingsRepository\.ts$/);
  globalThis.__nightly = { events: [], fetches: [], result: null, error: null };
  auth.isGoogleDriveConfigured = () => true;
  auth.ensureGoogleSession = async () => true;
  auth.getGoogleAccessToken = async () => 'fake-token-for-test';
  const realTrack = an.trackEvent;
  an.trackEvent = async (name, props) => {
    globalThis.__nightly.events.push({ name, props });
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('googleapis.com')) {
      globalThis.__nightly.fetches.push(
        ((init && init.method) || 'GET') + ' ' + String(url).split('?')[0],
      );
      return new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'Request had insufficient authentication scopes.',
            errors: [
              {
                message: 'Insufficient Permission',
                domain: 'global',
                reason: 'insufficientPermissions',
              },
            ],
            status: 'PERMISSION_DENIED',
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return realFetch(url, init);
  };
  settings.settingsRepository.updateSettings({ autoBackupTarget: 'googleDrive' });
  backup
    .runAutoBackupIfDue({ force: true })
    .then(
      (r) => {
        globalThis.__nightly.result = {
          skipped: r.skipped,
          written: r.written.length,
          errors: r.errors,
        };
      },
      (e) => {
        globalThis.__nightly.error = String(e);
      },
    )
    .finally(() => {
      an.trackEvent = realTrack;
      globalThis.fetch = realFetch;
    });
  return 'started';
})();
