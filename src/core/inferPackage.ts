export interface PackageInfo {
  name: string;
  version: string;
}

/**
 * Infer package name and version from Yarn v4 patch filename.
 *
 * Yarn v4 patch filenames follow this format:
 *   @scope-pkg-npm-1.2.3-abc123.patch  →  @scope/pkg @ 1.2.3
 *   lodash-npm-4.17.21-abc123.patch    →  lodash @ 4.17.21
 */
export function inferPackage(patchFilename: string): PackageInfo {
  // Remove directory path and .patch extension
  const basename = patchFilename.replace(/.*\//, '').replace(/\.patch$/, '');

  // Match pattern: <name-parts>-npm-<version>-<hash>
  // Version is a semver string like 1.2.3 or 1.2.3-beta.1
  const npmMatch = basename.match(/^(.+)-npm-(\d+\.\d+\.\d+[^-]*(?:-[^-]+)*?)(?:-[a-f0-9]+)?$/);
  if (!npmMatch) {
    throw new Error(`Cannot infer package from patch filename: ${patchFilename}`);
  }

  const namePart = npmMatch[1];
  const version = npmMatch[2];

  // Convert scoped package: @scope-pkg → @scope/pkg
  // Yarn replaces '/' with '-' and adds '@' prefix
  let name: string;
  if (namePart.startsWith('@')) {
    // Already has scope indicator
    name = namePart;
  } else {
    // Check if it might be a scoped package (starts with a segment that looks like @scope)
    // Yarn v4 encodes @scope/pkg as @scope-pkg
    // We can't reliably distinguish @scope/pkg from just-pkg without more context
    // Heuristic: if first segment starts with nothing special, treat as unscoped
    name = namePart;
  }

  // Yarn v4 encodes scoped packages as @scope-pkg-npm-version
  // The leading @ is preserved but / is replaced with -
  // So @scope-pkg means @scope/pkg
  // We need to re-add the / after the scope
  if (name.startsWith('@')) {
    // Find the first - after @ which separates scope from package name
    const atIdx = name.indexOf('-', 1);
    if (atIdx !== -1) {
      name = name.slice(0, atIdx) + '/' + name.slice(atIdx + 1);
    }
  }

  return { name, version };
}
