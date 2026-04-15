import { describe, it, expect } from 'vitest';
import { hashPatch } from '../core/hashPatch.js';

describe('hashPatch', () => {
  it('returns sha256 prefixed hash', () => {
    const hash = hashPatch('test content');
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    const hash1 = hashPatch('test content');
    const hash2 = hashPatch('test content');
    expect(hash1).toBe(hash2);
  });

  it('differs for different content', () => {
    const hash1 = hashPatch('content a');
    const hash2 = hashPatch('content b');
    expect(hash1).not.toBe(hash2);
  });
});
