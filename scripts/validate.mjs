import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = filename => fs.readFile(path.join(root, filename), 'utf8');

const requiredFiles = [
  'README.md',
  'SKILL.md',
  'skill-tests.yaml',
  'bin/slides.js',
  'lib/browser.js',
  'lib/check.js',
  'lib/export.js',
  'lib/server.js',
  'runtime/slides-editor.js',
  'themes/conference/template/presentation.html',
  'themes/dwmkerr/template/presentation.html',
  'site/index.html',
  'site/demo-pack/index.html',
  'site/demo-pack/slides-editor.js',
  'site/demo-slides/index.html',
  'scripts/build-hero-gif.sh',
  'site/assets/hero.gif',
  'site/assets/demo-preview.png',
  'site/assets/conference-preview.png',
  'site/assets/quantumblack-preview.png'
];

for (const filename of requiredFiles) {
  const stats = await fs.stat(path.join(root, filename));
  assert(stats.isFile(), `${filename} must be a file`);
}

const packageJson = JSON.parse(await read('package.json'));
const manifest = JSON.parse(await read('.github/release-please-manifest.json'));
assert.equal(packageJson.version, manifest['.'], 'package and release-please versions must match');
assert.equal(packageJson.private, true, 'the Node project must not be publishable');
assert(!('files' in packageJson), 'an npm publication file list is unnecessary');
assert(packageJson.dependencies.playwright, 'browser checks and export require Playwright');
assert(packageJson.dependencies['pdf-lib'], 'selected slide export requires pdf-lib');
assert.deepEqual(Object.keys(packageJson.scripts).sort(), [
  'dev',
  'start',
  'test',
  'test:browser',
  'test:unit',
  'validate'
]);

const releaseWorkflow = await read('.github/workflows/release.yaml');
assert(!releaseWorkflow.includes('actions/setup-node'), 'the release workflow must only create GitHub releases');

const readme = await read('README.md');
assert.match(readme, /Create slides in the dwmkerr\.com style/);
assert.match(readme, /To preview or edit a deck, ask:/);
assert.match(readme, /npx skills add \. --global --agent claude-code --yes/);
assert.match(readme, /slides check presentation\.html/);
assert.match(readme, /slides export presentation\.html --slides/);
assert.match(readme, /interactive demo pack/);
assert(
  readme.indexOf('### QuantumBlack-inspired') < readme.indexOf('### Conference') &&
    readme.indexOf('### Conference') < readme.indexOf('### dwmkerr.com'),
  'README examples must lead with QuantumBlack-inspired, conference, then dwmkerr.com'
);

const claudeInstructions = await read('CLAUDE.md');
assert.match(claudeInstructions, /make hero/);

const skill = await read('SKILL.md');
assert.match(skill, /^---\nname: slides\n/);
assert.match(skill, /serve the slides/i);
assert.match(skill, /make the slides editable/i);
assert.match(skill, /without launching a browser or leaving a server running/i);
assert.match(skill, /Cmd\/Ctrl\+Enter/);
assert.match(skill, /GET \/__slides\/events/);
assert.match(skill, /check <deck-path>/);
assert.match(skill, /export <deck-path>/);

const runtime = await read('runtime/slides-editor.js');
assert.match(runtime, /Live editing is disconnected\. Tell your agent: "Serve the slides\."/);
assert.match(runtime, /This deck changed outside the browser/);
assert.match(runtime, /data-slides-editor-original-node/);
assert.match(runtime, /data-editor-action="export"/);
assert.match(runtime, /slides-print-root/);
assert(!runtime.includes("e.key === 's'"), 'the editor must not intercept browser save');
for (const filename of [
  'references/slides-editor.js',
  'site/demo-pack/slides-editor.js',
  'site/demo-slides/slides-editor.js',
  'site/quantumblack/slides-editor.js',
  'themes/conference/template/slides-editor.js',
  'themes/dwmkerr/template/slides-editor.js'
]) {
  assert.equal(await read(filename), runtime, `${filename} must match the shared editor runtime`);
}

const server = await read('lib/server.js');
for (const endpoint of ['/ping', '/source', '/editor.js', '/file', '/comments', '/events']) {
  assert(server.includes(endpoint), `server must implement ${endpoint}`);
}

const ciWorkflow = await read('.github/workflows/ci.yaml');
assert.match(ciWorkflow, /playwright install --with-deps chromium/);

for (const filename of [
  'site/index.html',
  'site/demo-pack/index.html',
  'site/demo-slides/index.html',
  'site/quantumblack/index.html',
  'site/conference/index.html'
]) {
  const html = await read(filename);
  assert(html.includes('G-WFTE4NBDQ1'), `${filename} must use the Signalbox analytics property`);
  assert(html.includes('navigator.doNotTrack'), `${filename} must respect Do Not Track`);
}

const generatedTemplate = await read('themes/dwmkerr/template/presentation.html');
assert(!generatedTemplate.includes('googletagmanager'), 'analytics must not be copied into generated decks');

for (const filename of ['references/qblabs-example-slide.html', 'references/dwmkerr-com-timeline-slide.html']) {
  const html = await read(filename);
  assert(!/Cmd\/Ctrl\s*\+?\s*S/i.test(html), `${filename} must not advertise browser save as a deck shortcut`);
  assert(html.includes('slides-editor.js'), `${filename} must use the shared editor`);
}

console.log('project validation passed');
