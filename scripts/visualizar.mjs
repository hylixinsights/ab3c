import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const astro = resolve(root, 'node_modules/astro/bin/astro.mjs');
const url = 'http://127.0.0.1:4310/';
const child = spawn(process.execPath, [astro, 'dev', '--host', '127.0.0.1', '--port', '4310'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
let output = '';
child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => {
  if (code !== 0) { process.exitCode = code ?? 1; return; }
  const actualUrl = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0] ?? url;
  console.log(`\nPrévia com atualização automática: ${actualUrl}`);
  console.log('Para encerrar: npx astro dev stop');
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'google-chrome';
  const args = process.platform === 'darwin' ? ['-a', 'Google Chrome', actualUrl] : process.platform === 'win32' ? ['/c', 'start', 'chrome', actualUrl] : [actualUrl];
  const browser = spawn(command, args, { detached: true, stdio: 'ignore' });
  browser.on('error', () => console.log(`Abra o Google Chrome e acesse ${actualUrl}`));
  browser.unref();
});
