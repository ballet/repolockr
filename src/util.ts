export function atos(s: string | undefined): string {
  if (!s) {
    return '';
  } else {
    return Buffer.from(s, 'base64').toString('utf-8');
  }
}
