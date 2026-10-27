/**
 * CVE-2026-111497 ("Node2Shell") is an out-of-bounds write in the Brotli
 * decoder bundled with Node.js, reachable by any code that decompresses
 * attacker-supplied Brotli data via `node:zlib`. Fixed in 22.23.4, 24.22.1 and
 * 26.12.1.
 *
 * This app never decodes Brotli (body-parser only accepts deflate/gzip/identity,
 * and nothing imports zlib), but a VM provisioned with a distro Node package is
 * very likely to be on an affected build. Fail loudly rather than run exposed.
 */
export const PATCHED_NODE = '22.23.4';

export function checkRuntime(): boolean {
  const [major = 0, minor = 0, patch = 0] = process.versions.node.split('.').map(Number);

  const below =
    major < 22 || (major === 22 && (minor < 23 || (minor === 23 && patch < 4)));

  if (below) {
    console.warn(
      [
        '',
        `[thread] WARNING — Node ${process.versions.node} is older than ${PATCHED_NODE}.`,
        '  That release contains the fix for CVE-2026-111497 (Node2Shell), an RCE in the',
        '  bundled Brotli decoder. Thread does not decode Brotli, but do not expose this',
        '  server from an unpatched runtime. Upgrade with nvm, or use the Dockerfile',
        '  in this repository, which is pinned to node:22.23.4.',
        '',
      ].join('\n'),
    );
    return false;
  }

  return true;
}
