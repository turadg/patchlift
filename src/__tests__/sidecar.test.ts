import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, unlink } from 'node:fs/promises';
import { readSidecar, writeSidecar, sidecarPath, resolveSidecarStatus } from '../core/sidecar.js';
import type { SidecarData } from '../core/sidecar.js';

const TEST_PATCH = 'test-patch-sidecar-test.patch';

const sampleSidecar: SidecarData = {
  schemaVersion: 1,
  patchFile: TEST_PATCH,
  patchHash: 'sha256:abc123',
  package: { name: 'lodash', version: '4.17.21' },
  upstream: { repo: 'lodash/lodash', issue: null, pr: null },
  status: 'untracked',
  notes: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('sidecar', () => {
  beforeEach(async () => {
    await writeFile(TEST_PATCH, 'patch content');
  });

  afterEach(async () => {
    const sidecar = sidecarPath(TEST_PATCH);
    try { await unlink(TEST_PATCH); } catch {}
    try { await unlink(sidecar); } catch {}
  });

  it('sidecarPath appends .patchlift.json', () => {
    expect(sidecarPath('foo.patch')).toBe('foo.patch.patchlift.json');
  });

  it('readSidecar returns null when no sidecar exists', async () => {
    const result = await readSidecar(TEST_PATCH);
    expect(result).toBeNull();
  });

  it('writeSidecar and readSidecar round-trip', async () => {
    await writeSidecar(TEST_PATCH, sampleSidecar);
    const result = await readSidecar(TEST_PATCH);
    expect(result).toEqual(sampleSidecar);
  });

  it('resolveSidecarStatus returns untracked for null', () => {
    expect(resolveSidecarStatus(null)).toBe('untracked');
  });

  it('resolveSidecarStatus returns status from sidecar', () => {
    expect(resolveSidecarStatus({ ...sampleSidecar, status: 'proposed' })).toBe('proposed');
  });
});
