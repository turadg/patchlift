import { describe, it, expect } from 'vitest';
import { inferPackage } from '../core/inferPackage.js';

describe('inferPackage', () => {
  it('infers unscoped package', () => {
    const result = inferPackage('lodash-npm-4.17.21-abc123def4.patch');
    expect(result.name).toBe('lodash');
    expect(result.version).toBe('4.17.21');
  });

  it('infers scoped package', () => {
    const result = inferPackage('@scope-pkg-npm-1.2.3-abc123.patch');
    expect(result.name).toBe('@scope/pkg');
    expect(result.version).toBe('1.2.3');
  });

  it('handles full path', () => {
    const result = inferPackage('.yarn/patches/lodash-npm-4.17.21-abc123def4.patch');
    expect(result.name).toBe('lodash');
    expect(result.version).toBe('4.17.21');
  });

  it('throws for unrecognized format', () => {
    expect(() => inferPackage('unknown.patch')).toThrow();
  });
});
