// Build first. Check the actual npm publication inventory, then checksum the archive.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const npmCLI = process.env.npm_execpath;
assert.ok(npmCLI, 'Run this tool with npm run pack:checked');
if (process.env.GITHUB_REF_TYPE === 'tag') {
  assert.equal(process.env.GITHUB_REF_NAME, `v${manifest.version}`, 'Release tag must match package.json');
}
const destination = path.join(root, 'artifacts');
fs.mkdirSync(destination, { recursive: true });
const packed = spawnSync(process.execPath, [npmCLI, 'pack', '--ignore-scripts', '--json', '--pack-destination', destination], {
  cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024,
});
assert.ifError(packed.error);
assert.equal(packed.status, 0, packed.stderr);
const [report] = JSON.parse(packed.stdout);
const expected = new Set([
  'package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'ASSETS-LICENSE.md', 'FONT-LICENSES.md',
  'cordis.patch.yml', 'locale/en.json', 'locale/zh.json',
  'lib/index.js', 'lib/client.js', 'lib/remote.js', 'lib/typert.host.js',
  'assets/icon.svg', 'assets/fonts/bubble-en.woff2', 'assets/fonts/bubble-zh.woff2',
  'assets/fonts/OFL-Fredoka.txt', 'assets/fonts/OFL-ZCOOL-KuaiLe.txt',
]);
assert.deepEqual(new Set(report.files.map(file => file.path)), expected, 'Unexpected or missing runtime/package license files');
assert.equal(report.name, manifest.name);
assert.equal(report.version, manifest.version);
assert.ok(report.size < 16 * 1024 * 1024, 'Compressed package exceeds the 16 MiB size budget');
assert.ok(report.unpackedSize < 21 * 1024 * 1024, 'Unpacked package exceeds the 21 MiB size budget');
for (const target of Object.values(manifest.exports)) {
  assert.ok(expected.has(target.replace(/^\.\//, '')), `Export missing from archive: ${target}`);
}
const filename = `${manifest.name}-${manifest.version}.tgz`;
assert.equal(report.filename, filename);
const archive = fs.readFileSync(path.join(destination, filename));
assert.equal(archive.length, report.size);
const digest = createHash('sha256').update(archive).digest('hex');
fs.writeFileSync(path.join(destination, `${filename}.sha256`), `${digest}  ${filename}\n`);
fs.writeFileSync(path.join(destination, 'package-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Checked ${report.entryCount} package files: ${report.size} compressed / ${report.unpackedSize} unpacked bytes`);
console.log(`SHA-256 ${digest}  ${filename}`);
