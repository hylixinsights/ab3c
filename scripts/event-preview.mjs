import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const eventDirectory = fileURLToPath(new URL('../../Xmeeting2027/dist/', import.meta.url));
const publishedEventDirectory = fileURLToPath(new URL('../public/xmeeting27/', import.meta.url));
const mountPath = '/xmeeting27';
const textExtensions = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.xml', '.ics']);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

function insideRoot(file, root) {
  return file === root || file.startsWith(`${root}${sep}`);
}

function respond(request, response, status, message) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(request.method === 'HEAD' ? undefined : message);
}

/**
 * Development fallback when the published event snapshot is absent. The built
 * preview always serves dist/, so a clone works without the sibling project.
 */
export function eventPreview() {
  async function serveEvent(request, response, next) {
    const rawUrl = request.url ?? '/';
    const queryStart = rawUrl.indexOf('?');
    const rawPath = queryStart < 0 ? rawUrl : rawUrl.slice(0, queryStart);
    if (rawPath !== mountPath && !rawPath.startsWith(`${mountPath}/`)) return next();
    try {
      if ((await stat(publishedEventDirectory)).isDirectory()) return next();
    } catch { /* Use the read-only sibling build when no snapshot exists yet. */ }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      return respond(request, response, 405, 'Método não permitido. / Method not allowed.');
    }

    let pathname;
    try {
      pathname = decodeURIComponent(rawPath);
    } catch {
      return respond(request, response, 400, 'Endereço inválido. / Invalid address.');
    }
    // Reject traversal before resolving, including encoded separators and dots.
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) {
      return respond(request, response, 403, 'Acesso não permitido. / Access denied.');
    }
    if (pathname === mountPath) {
      response.statusCode = 307;
      response.setHeader('Location', `${mountPath}/${queryStart < 0 ? '' : rawUrl.slice(queryStart)}`);
      response.end();
      return;
    }

    let root;
    try {
      root = await realpath(eventDirectory);
      if (!(await stat(root)).isDirectory()) throw new Error('Missing build directory');
    } catch {
      return respond(request, response, 503,
        'A prévia local do X-Meeting está indisponível porque o build do evento não foi encontrado. ' +
        'O site institucional continua disponível em /.\n\n' +
        'The local X-Meeting preview is unavailable because the event build was not found. ' +
        'The institutional website remains available at /.');
    }

    try {
      let file = resolve(root, pathname.slice(mountPath.length + 1));
      if (!insideRoot(file, root)) return respond(request, response, 403, 'Acesso não permitido. / Access denied.');
      file = await realpath(file);
      if (!insideRoot(file, root)) return respond(request, response, 403, 'Acesso não permitido. / Access denied.');
      if ((await stat(file)).isDirectory()) {
        if (!pathname.endsWith('/')) {
          response.statusCode = 307;
          response.setHeader('Location', `${rawPath}/${queryStart < 0 ? '' : rawUrl.slice(queryStart)}`);
          response.end();
          return;
        }
        file = await realpath(resolve(file, 'index.html'));
        // Check index symlinks as well as the requested path's symlinks.
        if (!insideRoot(file, root)) return respond(request, response, 403, 'Acesso não permitido. / Access denied.');
      }
      if (!(await stat(file)).isFile()) return respond(request, response, 404, 'Página do evento não encontrada. / Event page not found.');

      const extension = extname(file).toLowerCase();
      let body = await readFile(file);
      if (textExtensions.has(extension)) {
        body = Buffer.from(body.toString('utf8').replace(/\/events\/2027(?=\/|["'?#]|$)/g, mountPath));
      }
      response.statusCode = 200;
      response.setHeader('Content-Type', contentTypes[extension] ?? 'application/octet-stream');
      response.setHeader('Content-Length', body.byteLength);
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      const status = ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500;
      return respond(request, response, status, status === 404
        ? 'Página do evento não encontrada. / Event page not found.'
        : 'Não foi possível carregar a prévia do evento. / Unable to load the event preview.');
    }
  }

  return {
    name: 'ab3c-local-event-preview',
    configureServer(server) { server.middlewares.use(serveEvent); },
  };
}
