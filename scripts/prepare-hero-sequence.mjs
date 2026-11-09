/**
 * Reproducible delivery assets for the approved MP4. No browser rendering.
 * Usage: node scripts/prepare-hero-sequence.mjs [path/to/source.mp4]
 * Requires FFmpeg, ffprobe and cwebp on PATH (or FFMPEG/FFPROBE/CWEBP overrides).
 * Source stays in Images/. Temporary RGB PNGs are removed after WebP encoding.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(process.argv[2] || join(root, 'Images/Video_logo.mp4'));
const delivery = join(root, 'public/ab3c/hero-sequence');
const qa = join(root, '.preview/hero-sequence-qa');
const publicRoot = 'ab3c/hero-sequence';
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const ffprobe = process.env.FFPROBE || 'ffprobe';
const cwebp = process.env.CWEBP || 'cwebp';
const settings = [
  { name: 'desktop', maxWidth: 1280, fps: 12, quality: 80, posterQuality: 82 },
  { name: 'mobile', maxWidth: 768, fps: 8, quality: 76, posterQuality: 80 },
];

function run(binary, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(binary, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    process.stdout.on('data', chunk => stdout += chunk);
    process.stderr.on('data', chunk => stderr += chunk);
    process.on('error', reject);
    process.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${binary} exited ${code}\n${stderr}`)));
  });
}
async function concurrent(items, limit, job) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) { const item = items[index++]; await job(item); }
  }));
}
const number = value => Number(value) || 0;
const rate = value => { const [a, b = 1] = String(value).split('/').map(Number); return a / b; };
const pad = index => String(index).padStart(4, '0');
const sourceInfo = JSON.parse((await run(ffprobe, ['-v','error','-select_streams','v:0','-count_frames','-show_streams','-show_format','-of','json',source])).stdout);
const stream = sourceInfo.streams[0];
if (!stream || !number(stream.width) || !number(stream.height)) throw new Error('Source contains no readable video stream.');
const sourceFrameCount = number(stream.nb_read_frames) || number(stream.nb_frames);
const sourceFps = rate(stream.avg_frame_rate || stream.r_frame_rate);
if (!sourceFrameCount || !Number.isFinite(sourceFps) || sourceFps <= 0) throw new Error('Cannot determine actual source frames and sampling rate.');
const duration = number(stream.duration) || number(sourceInfo.format.duration);
// This source uses an SD/BT.601 YCbCr matrix, BT.709 primaries and an sRGB transfer.
// Decode the declared limited-range YCbCr matrix to full-range RGB. Do not replace
// its matrix with BT.709 or apply a second gamma transform. Untagged RGB PNG/WebP
// is interpreted as sRGB by the browser, matching these source primaries/transfer.
const matrixMap = { smpte170m: 'bt601', bt470bg: 'bt601', bt709: 'bt709', fcc: 'fcc', smpte240m: 'smpte240m', bt2020nc: 'bt2020' };
const inputMatrix = matrixMap[stream.color_space];
if (!inputMatrix) throw new Error(`Unsupported/unknown input matrix ${stream.color_space}; inspect the source before conversion.`);
if (!['iec61966-2-1','bt709',undefined].includes(stream.color_transfer) || !['bt709',undefined].includes(stream.color_primaries)) {
  throw new Error('Source gamut/transfer differs from the approved SDR source; inspect and explicitly update colour handling.');
}
const inputRange = stream.color_range === 'pc' ? 'pc' : 'tv';
await fs.mkdir(delivery, { recursive: true });
await fs.mkdir(qa, { recursive: true });
const temporary = await fs.mkdtemp(join(tmpdir(), 'ab3c-hero-sequence-'));
const staging = join(delivery, '.preparing');
await fs.rm(staging, { recursive: true, force: true });
await fs.mkdir(staging, { recursive: true });
const manifest = {
  version: 1,
  source: {
    file: relative(root, source).split('\\').join('/'),
    sha256: createHash('sha256').update(await fs.readFile(source)).digest('hex'),
    bytes: (await fs.stat(source)).size,
    width: stream.width, height: stream.height, duration, fps: sourceFps,
    frameCount: sourceFrameCount,
    color: { matrix: stream.color_space, range: stream.color_range, transfer: stream.color_transfer, primaries: stream.color_primaries },
  },
  poster: null,
  variants: {},
  composition: {
    fit: 'contain', aspectRatio: stream.width / stream.height,
    desktop: { objectPosition: '50% 50%', crop: false },
    mobile: { objectPosition: '50% 50%', crop: false, copyAboveArtwork: true },
  },
  preparation: {
    tools: ['ffmpeg', 'cwebp'],
    colorConversion: `Declared ${stream.color_space}/${inputRange} YCbCr → full-range sRGB pixels; no grade, gamma effect, interpolation or camera transform.`,
    audio: 'discarded',
    finalFrame: 'Exact last decoded source frame appended after the regular samples.',
    numbering: 'Zero-based and contiguous; urls and frameCount are derived from actual files.',
  },
};
try {
  for (const variant of settings) {
    const width = Math.min(variant.maxWidth, stream.width);
    const height = Math.round(width * stream.height / stream.width);
    const pngDirectory = join(temporary, variant.name);
    const outputDirectory = join(staging, variant.name);
    await fs.mkdir(pngDirectory, { recursive: true });
    await fs.mkdir(outputDirectory, { recursive: true });
    const conversion = `scale=${width}:${height}:flags=lanczos:in_color_matrix=${inputMatrix}:in_range=${inputRange}:out_range=pc,format=rgb24`;
    console.log(`Preparing ${variant.name}: ${width}×${height}, ${variant.fps} fps, WebP q${variant.quality}.`);
    // fps samples existing footage only; no optical flow or motion interpolation.
    await run(ffmpeg, ['-v','error','-i',source,'-map','0:v:0','-an','-vf',`fps=${variant.fps}:start_time=0:round=near,${conversion}`,'-start_number','0','-y',join(pngDirectory,'frame-%04d.png')]);
    const regular = (await fs.readdir(pngDirectory)).filter(file => /^frame-\d{4}\.png$/.test(file)).sort();
    if (!regular.length) throw new Error(`No ${variant.name} frames were extracted.`);
    // Explicitly use the first and final decoded frames, not seek approximations.
    await run(ffmpeg, ['-v','error','-i',source,'-map','0:v:0','-an','-vf',`select=eq(n\\,0),${conversion}`,'-frames:v','1','-y',join(pngDirectory,'frame-0000.png')]);
    await run(ffmpeg, ['-v','error','-i',source,'-map','0:v:0','-an','-vf',`select=eq(n\\,${sourceFrameCount-1}),${conversion}`,'-frames:v','1','-y',join(pngDirectory,`frame-${pad(regular.length)}.png`)]);
    const pngFiles = (await fs.readdir(pngDirectory)).filter(file => /^frame-\d{4}\.png$/.test(file)).sort();
    await concurrent(pngFiles, 4, async file => {
      await run(cwebp, ['-quiet','-q',String(variant.quality),'-m','6','-sharp_yuv',join(pngDirectory,file),'-o',join(outputDirectory,file.replace('.png','.webp'))]);
    });
    const files = (await fs.readdir(outputDirectory)).filter(file => /^frame-\d{4}\.webp$/.test(file)).sort();
    if (files.length !== pngFiles.length || !files.every((file, i) => file === `frame-${pad(i)}.webp`)) throw new Error('Unexpected output numbering.');
    const posterFile = `poster-${variant.name}.webp`;
    await run(cwebp, ['-quiet','-q',String(variant.posterQuality),'-m','6','-sharp_yuv',join(pngDirectory,'frame-0000.png'),'-o',join(staging,posterFile)]);
    const totalBytes = (await Promise.all(files.map(file => fs.stat(join(outputDirectory,file))))).reduce((sum, info) => sum + info.size, 0);
    const posterBytes = (await fs.stat(join(staging,posterFile))).size;
    manifest.variants[variant.name] = {
      directory: `${publicRoot}/${variant.name}`, pattern: 'frame-%04d.webp', indexBase: 0, indexPadding: 4,
      frameCount: files.length, width, height, fps: variant.fps,
      quality: variant.quality, totalBytes, poster: `${publicRoot}/${posterFile}`, posterBytes,
      urls: files.map(file => `${publicRoot}/${variant.name}/${file}`),
    };
    if (variant.name === 'desktop') manifest.poster = { url: `${publicRoot}/${posterFile}`, width, height, bytes: posterBytes };
    // Keep three lossless decoder references for honest comparison, outside public/.
    const sampleIndices = [0, Math.floor((files.length - 1) / 2), files.length - 1];
    const comparisons = [];
    for (const index of sampleIndices) {
      const png = join(pngDirectory, `frame-${pad(index)}.png`);
      const webp = join(outputDirectory, `frame-${pad(index)}.webp`);
      await fs.copyFile(png, join(qa,`${variant.name}-reference-${pad(index)}.png`));
      await fs.copyFile(webp, join(qa,`${variant.name}-encoded-${pad(index)}.webp`));
      const comparison = await run(ffmpeg, ['-hide_banner','-i',png,'-i',webp,'-lavfi','[0:v]format=gbrp[reference];[1:v]format=gbrp[encoded];[reference][encoded]ssim','-frames:v','1','-f','null','-']);
      comparisons.push({ index, ssim: comparison.stderr.match(/SSIM[^\n]+/)?.[0] || 'See visual comparison files.' });
    }
    manifest.variants[variant.name].representativeQuality = comparisons;
    console.log(`${variant.name}: ${files.length} frames, ${totalBytes.toLocaleString('en-US')} bytes; poster ${posterBytes.toLocaleString('en-US')} bytes.`);
  }
  for (const { name } of settings) {
    await fs.rm(join(delivery, name), { recursive: true, force: true });
    await fs.rename(join(staging, name), join(delivery, name));
    await fs.rename(join(staging,`poster-${name}.webp`),join(delivery,`poster-${name}.webp`));
  }
  const json = JSON.stringify(manifest, null, 2) + '\n';
  await fs.writeFile(join(delivery,'manifest.json.tmp'), json);
  await fs.rename(join(delivery,'manifest.json.tmp'), join(delivery,'manifest.json'));
  await fs.writeFile(join(qa,'preparation-report.json'), json);
  console.log(`Manifest: ${join(delivery,'manifest.json')}`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
  await fs.rm(staging, { recursive: true, force: true });
}
