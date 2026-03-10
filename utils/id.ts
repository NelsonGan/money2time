export function newId(): string {
  // React Native-safe UUID generator (no crypto.getRandomValues dependency).
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function newAppUserId(): string {
  return `m2t_${newId()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
