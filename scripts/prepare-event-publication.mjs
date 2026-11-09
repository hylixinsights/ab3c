/**
 * Refresh the X-Meeting snapshot published at https://ab3c.org/xmeeting27/.
 * Usage: node scripts/prepare-event-publication.mjs [path/to/Xmeeting2027]
 * Builds a temporary allowlisted copy; never changes the source event project.
 * Existing installed dependencies are copied locally. No credentials/.env files
 * or registration preview routes are included in the publication.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(process.argv[2] || join(root, '../Xmeeting2027'));
const output = join(root, 'public/xmeeting27');
const qa = join(root, '.preview/event-publication');
const origin = 'https://ab3c.org';
const base = '/xmeeting27/';
const allowlist = ['src', 'public', 'astro.config.mjs', 'tsconfig.json', 'package.json', 'package-lock.json'];
const excluded = name => name.startsWith('.') || name.endsWith('.map');

async function filesIn(directory, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (excluded(entry.name)) continue;
    const path = join(directory, entry.name);
    const name = join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected source symlink: ${name}`);
    if (entry.isDirectory()) files.push(...await filesIn(path, name));
    else if (entry.isFile()) files.push({ path, name: name.split(sep).join('/') });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

async function sourceDigest() {
  const digest = createHash('sha256');
  for (const entry of allowlist) {
    const path = join(source, entry);
    const info = await fs.lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Unexpected source symlink: ${entry}`);
    const files = info.isDirectory() ? await filesIn(path, entry) : [{ path, name: entry }];
    for (const file of files) digest.update(file.name).update('\0').update(await fs.readFile(file.path));
  }
  return digest.digest('hex');
}

function run(binary, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      stdio: 'inherit',
      env: {
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR || tmpdir(),
        SITE_URL: origin,
        BASE_PATH: base.slice(0, -1),
        PUBLIC_INTEREST_FORM_URL: '',
        REGISTRATION_PREVIEW: 'false',
        ASTRO_TELEMETRY_DISABLED: '1',
        CI: 'true',
      },
    });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Event build failed (${code}).`)));
  });
}

async function validate(build) {
  const files = await filesIn(build);
  const names = new Set(files.map(file => file.name));
  const htmlFiles = files.filter(file => file.name.endsWith('.html'));
  const issues = [];
  let checkedReferences = 0;
  for (const file of htmlFiles) {
    const html = await fs.readFile(file.path, 'utf8');
    const route = file.name === 'index.html' ? '' : file.name.replace(/index\.html$/, '');
    const pageURL = new URL(base + route, origin);
    if (html.includes('/events/2027')) issues.push(`${file.name}: stale event base`);
    if (html.includes('https://www.x-meeting.com/events/2027')) issues.push(`${file.name}: stale canonical`);
    for (const tag of html.matchAll(/<[a-z][^>]*>/gi)) {
      for (const match of tag[0].matchAll(/(?:href|src|poster)=["']([^"']+)["']/g)) {
      const reference = match[1].replaceAll('&amp;', '&');
      if (!reference || reference.startsWith('#') || /^(?:data:|mailto:|tel:|javascript:)/i.test(reference)) continue;
      const url = new URL(reference, pageURL);
      if (url.origin !== origin) continue;
      if (!url.pathname.startsWith(base)) {
        issues.push(`${file.name}: local reference outside ${base}: ${url.pathname}`);
        continue;
      }
      // A 404's canonical names its requested route; it is metadata, not a navigable asset.
      if (/\brel=["']canonical["']/i.test(tag[0])) { checkedReferences++; continue; }
      const name = decodeURIComponent(url.pathname.slice(base.length));
      if (!names.has(name) && !names.has(`${name.replace(/\/$/, '')}/index.html`) && !(name === '' && names.has('index.html'))) {
        issues.push(`${file.name}: missing ${url.pathname}`);
      }
      checkedReferences++;
      }
    }
  }
  if (names.has('registration/preview/index.html')) issues.push('Registration preview must not be published.');
  if (files.some(file => /\.(?:webp|png|jpe?g|avif)\.json$/i.test(file.name))) issues.push('Raster provenance sidecars must not be published.');
  if (!names.has('index.html') || !names.has('registration/index.html')) issues.push('Missing required event pages.');
  if (issues.length) throw new Error(`Invalid event publication:\n${issues.join('\n')}`);
  const bytes = (await Promise.all(files.map(file => fs.stat(file.path)))).reduce((sum, info) => sum + info.size, 0);
  return { files: files.length, bytes, htmlPages: htmlFiles.map(file => file.name), checkedReferences };
}

const astroPackage = JSON.parse(await fs.readFile(join(source, 'node_modules/astro/package.json'), 'utf8'));
const astroBin = typeof astroPackage.bin === 'string' ? astroPackage.bin : astroPackage.bin.astro;
await fs.access(join(source, 'node_modules/astro', astroBin));
const before = await sourceDigest();
await fs.mkdir(qa, { recursive: true });
const temporary = await fs.mkdtemp(join(tmpdir(), 'ab3c-event-publication-'));
const staging = join(qa, `staging-${process.pid}`);
let previous;
try {
  for (const entry of allowlist) {
    await fs.cp(join(source, entry), join(temporary, entry), {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
      filter: path => !excluded(path.slice(path.lastIndexOf(sep) + 1)),
    });
  }
  // A private dependency copy ensures Vite/Astro caches cannot write into the event checkout.
  await fs.cp(join(source, 'node_modules'), join(temporary, 'node_modules'), {
    recursive: true, mode: constants.COPYFILE_FICLONE,
  });
  await run(process.execPath, [join(temporary, 'node_modules/astro', astroBin), 'build'], temporary);
  const report = await validate(join(temporary, 'dist'));
  const after = await sourceDigest();
  if (before !== after) throw new Error('Event source changed during preparation; publication cancelled.');
  await fs.cp(join(temporary, 'dist'), staging, { recursive: true, mode: constants.COPYFILE_FICLONE });
  try {
    await fs.access(output);
    previous = join(qa, `previous-${Date.now()}`);
    await fs.rename(output, previous);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await fs.rename(staging, output); }
  catch (error) {
    if (previous) await fs.rename(previous, output);
    throw error;
  }
  const result = {
    generatedAt: new Date().toISOString(),
    source: relative(root, source),
    sourceSha256: before,
    sourceUnchanged: before === after,
    sourceDefaults: { site: 'https://www.x-meeting.com', base: '/events/2027' },
    publication: { site: origin, base, directory: 'public/xmeeting27', interestFormConfigured: false },
    ...report,
  };
  await fs.writeFile(join(qa, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`Event snapshot ready: ${report.files} files, ${report.bytes.toLocaleString('en-US')} bytes, ${report.checkedReferences} checked local references.`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
  await fs.rm(staging, { recursive: true, force: true });
}
