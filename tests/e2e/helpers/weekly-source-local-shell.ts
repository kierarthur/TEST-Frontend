/**
 * WP-12 (Gate 10) — the REAL Office shell, served entirely locally.
 *
 * Why this exists. The Gate 10 proofs must run against the real Office assets
 * (`index.html`, `js/main.js`, the real stylesheets and the real Weekly Source
 * renderers), not against a fragment. The existing Bulk entry specs reach the
 * real shell by pointing the browser at the DEPLOYED TEST origin, which this
 * work package is forbidden to touch: Plan 6.2 rule 5 is local Docker only, no
 * hosted TEST and no LIVE.
 *
 * So the shell is served from disk on a synthetic origin, every request is
 * intercepted, and anything not explicitly served is ABORTED. Nothing leaves
 * the machine. The assets are byte-for-byte the ones the browser would load in
 * production; only the broker behind them is a deterministic local stub.
 */
import { readFileSync } from 'node:fs';
import { resolve, extname, normalize, sep } from 'node:path';
import type { Page, Route } from '@playwright/test';

export const ORIGIN = 'https://office.weekly-source.localtest';
export const BROKER = `${ORIGIN}/__broker`;

const ROOT = resolve(__dirname, '../../..');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function readAsset(pathname: string): { body: Buffer; contentType: string } | null {
  const relative = pathname.replace(/^\/+/, '') || 'index.html';
  const absolute = resolve(ROOT, relative);
  // Never serve anything outside the frontend worktree.
  if (!normalize(absolute + sep).startsWith(normalize(ROOT + sep))) return null;
  try {
    const body = readFileSync(absolute);
    return { body, contentType: CONTENT_TYPES[extname(absolute).toLowerCase()] || 'application/octet-stream' };
  } catch {
    return null;
  }
}

export type BrokerStub = (
  pathname: string,
  method: string,
  body: unknown,
  route: Route
) => Promise<unknown> | unknown;

export const OFFICE_USER = Object.freeze({
  id: 'd1000000-0000-4000-8000-000000000001',
  email: 'office.local@example.invalid',
  role: 'admin',
  display_name: 'WP-12 local Office',
  first_name: 'WP-12',
  last_name: 'Local'
});

/**
 * Default broker answers. Deliberately dull: an empty, well-formed payload for
 * anything the shell asks for that a given proof does not care about, so the
 * shell boots without any network access and without pretending to hold data it
 * has not been given.
 */
function defaultBrokerAnswer(pathname: string): unknown {
  if (pathname.endsWith('/auth/login')) {
    return { ok: true, accessToken: 'local-only-not-a-secret', user: OFFICE_USER, exp: Date.now() + 3_600_000 };
  }
  if (pathname.endsWith('/auth/refresh')) {
    return { ok: true, accessToken: 'local-only-not-a-secret', user: OFFICE_USER, exp: Date.now() + 3_600_000 };
  }
  if (pathname.endsWith('/api/me')) return { ok: true, user: OFFICE_USER };
  if (pathname.includes('grid-prefs')) return { grid: {} };
  if (pathname.includes('/api/timesheets/bulk-process-dataset')) return { rows: [], counts: {} };
  if (pathname.includes('/api/timesheets/bulk-authorise-dataset')) return { rows: [], counts: {} };
  if (/\/api\/(clients|candidates|contracts|timesheets|invoices|umbrellas|hospitals|users)(\b|\/|\?)/.test(pathname)) {
    return { ok: true, rows: [], items: [], data: [], total: 0, counts: {} };
  }
  return { ok: true };
}

export async function mountOfficeShell(page: Page, options: { broker?: BrokerStub } = {}): Promise<void> {
  const seenExternal: string[] = [];

  await page.addInitScript(({ broker, user }) => {
    // The shell picks its broker from the hostname unless told otherwise.
    (window as any).BROKER_BASE_URL = broker;
    try {
      localStorage.setItem('cloudtms.session', JSON.stringify({
        accessToken: 'local-only-not-a-secret',
        user,
        exp: Date.now() + 3_600_000
      }));
    } catch {}
  }, { broker: BROKER, user: OFFICE_USER });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const inOrigin = `${url.protocol}//${url.host}` === ORIGIN;

    if (!inOrigin) {
      // Absolutely no external network in a Gate 10 proof.
      seenExternal.push(url.href);
      return route.abort();
    }

    // Most Office routes use the configured broker prefix. A small number of
    // self-contained feature modules intentionally call same-origin `/api/*`
    // routes, which the deployed Office host forwards to the same broker. The
    // local shell must model both real entry paths or it would return a fake
    // static-file 404 for an otherwise valid integrated modal.
    if (url.pathname.startsWith('/__broker') || url.pathname.startsWith('/api/')) {
      const pathname = url.pathname.replace(/^\/__broker/, '') + url.search;
      let parsed: unknown = null;
      try {
        const raw = request.postData();
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = request.postData();
      }
      let answer: unknown;
      if (options.broker) {
        answer = await options.broker(pathname, request.method(), parsed, route);
        if (answer === undefined) answer = defaultBrokerAnswer(pathname);
      } else {
        answer = defaultBrokerAnswer(pathname);
      }
      if (answer === null) return; // the stub fulfilled the route itself
      return route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        headers: {
          'access-control-allow-origin': ORIGIN,
          'access-control-allow-credentials': 'true',
          'cache-control': 'no-store'
        },
        body: JSON.stringify(answer)
      });
    }

    const asset = readAsset(url.pathname);
    if (!asset) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({
      status: 200,
      contentType: asset.contentType,
      headers: { 'cache-control': 'no-store' },
      body: asset.body
    });
  });

  (page as any).__weeklySourceExternalRequests = seenExternal;
  await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'domcontentloaded' });
}

export function externalRequests(page: Page): string[] {
  return ((page as any).__weeklySourceExternalRequests as string[]) || [];
}
