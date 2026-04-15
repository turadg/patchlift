import { createHash } from 'node:crypto';

export function hashPatch(content: string): string {
  const hash = createHash('sha256').update(content, 'utf-8').digest('hex');
  return `sha256:${hash}`;
}
