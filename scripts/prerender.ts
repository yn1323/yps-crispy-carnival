/**
 * Post-build prerender script
 *
 * vite build が生成した dist/ に対して、指定ルートをヘッドレス Chromium で
 * レンダリングし、完成後の HTML を静的ファイルとして書き出す。
 *
 * SEO 対象: 固定公開ページ + ArticleSite の記事詳細・カテゴリ詳細
 *
 * 使い方: pnpm prerender  (vite build 後に呼び出す)
 *
 * 注意:
 * - vite の生成した dist/index.html は空シェル (`<div id="app"></div>`)。
 *   src/main.tsx は `!rootElement.innerHTML` のとき React を mount する。
 * - prerender 実行中に dist/index.html を上書きしてしまうと、後続ルートの
 *   リクエストで既にレンダリング済みの HTML が返り React が mount しなくなる。
 * - そのため「サーバーは起動時にキャッシュしたオリジナル index.html を常に返し、
 *   最終出力は `fs.writeFile` で直接書き込む」方式にしている。
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { chromium, type Page } from "playwright";

const DIST_DIR = "dist";
const DIST_ABS = resolve(DIST_DIR);
const ARTICLE_CONTENT_DIR = join("src", "components", "features", "ArticleSite", "content");
const STATIC_ROUTES = [
  "/",
  "/features",
  "/faq",
  "/articles",
  "/privacy",
  "/terms",
  "/demo/shiftboard",
  "/demo/flow",
] as const;

const GOTO_TIMEOUT_MS = 30_000;
const RENDER_WAIT_TIMEOUT_MS = 15_000;
const MIN_HTML_BYTES = 2_000;
const MAX_PAGE_EVENTS = 20;
// Emotion (Chakra UI) は本番ビルドで CSSStyleSheet.insertRule を使うため、
// ダンプ後のインライン <style> は最低でもこの程度のサイズになるはず
const MIN_INLINE_STYLE_BYTES = 5_000;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const ROUTE_MANAGED_META_NAMES = ["description", "robots", "twitter:title", "twitter:description"];
const ROUTE_MANAGED_META_PROPERTIES = ["og:title", "og:description", "og:url"];

async function serveStaticFile(res: ServerResponse, pathname: string): Promise<boolean> {
  // Path traversal 防御: 解決後のパスが必ず dist/ 配下であることを確認
  const filePath = resolve(join(DIST_DIR, pathname));
  if (filePath !== DIST_ABS && !filePath.startsWith(`${DIST_ABS}${sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }
  try {
    const data = await readFile(filePath);
    const mime = MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function createShellHandler(shell: Buffer) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    // 拡張子付き（アセット）は dist/ から配信
    if (extname(pathname)) {
      const served = await serveStaticFile(res, pathname);
      if (served) return;
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    // ルートパスはすべてキャッシュ済み空シェルを返し、クライアント側 React / Router に任せる
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(shell);
  };
}

function routeToOutputPath(route: string): string {
  return route === "/" ? join(DIST_DIR, "index.html") : join(DIST_DIR, route.replace(/^\//, ""), "index.html");
}

function recordPageEvent(events: string[], event: string): void {
  events.push(event.length > 1_000 ? `${event.slice(0, 1_000)}...` : event);
  if (events.length > MAX_PAGE_EVENTS) {
    events.shift();
  }
}

async function buildPageDiagnostics(route: string, page: Page, events: string[]): Promise<string> {
  let snapshot = "unavailable";

  try {
    snapshot = JSON.stringify(
      await page.evaluate(() => {
        const app = document.getElementById("app");
        return {
          url: window.location.href,
          titleCount: document.querySelectorAll("head > title").length,
          h1Count: document.querySelectorAll("h1").length,
          appChildCount: app?.children.length ?? null,
          appText: app?.textContent?.trim().slice(0, 300) ?? null,
          headTags: Array.from(
            document.head.querySelectorAll('title, meta[name], meta[property], link[rel="canonical"]'),
          )
            .map((node) => node.outerHTML)
            .slice(0, 30),
        };
      }),
      null,
      2,
    );
  } catch (err) {
    snapshot = `failed to read page snapshot: ${err instanceof Error ? err.message : String(err)}`;
  }

  return [
    `[prerender] ${route} did not become ready before timeout.`,
    "[prerender] Page snapshot:",
    snapshot,
    "[prerender] Recent page events:",
    events.length > 0 ? events.join("\n") : "(none)",
  ].join("\n");
}

async function listContentSlugs(kind: "articles" | "categories"): Promise<string[]> {
  const contentDir = join(ARTICLE_CONTENT_DIR, kind);
  const entries = await readdir(contentDir, { withFileTypes: true });
  const slugs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          await readFile(join(contentDir, entry.name, "index.md"));
          return entry.name;
        } catch {
          return undefined;
        }
      }),
  );

  return slugs.filter((slug): slug is string => Boolean(slug)).sort((a, b) => a.localeCompare(b));
}

async function collectPrerenderRoutes(): Promise<string[]> {
  const [articleSlugs, categorySlugs] = await Promise.all([
    listContentSlugs("articles"),
    listContentSlugs("categories"),
  ]);

  return Array.from(
    new Set([
      ...STATIC_ROUTES,
      ...articleSlugs.map((slug) => `/articles/${slug}`),
      ...categorySlugs.map((slug) => `/articles/categories/${slug}`),
    ]),
  );
}

/**
 * レンダリング結果が "空の殻" のまま抜けていないか最低限のサニティチェックを行う。
 * 何かが決定的に壊れている場合 (Clerk 初期化失敗で return null 等) はビルドを失敗させて
 * 不完全な HTML を CF Pages にデプロイするのを防ぐ。
 */
function assertRenderedHtml(route: string, html: string): void {
  if (html.length < MIN_HTML_BYTES) {
    throw new Error(`[prerender] ${route} produced suspiciously small HTML (${html.length} bytes < ${MIN_HTML_BYTES})`);
  }
  if (!/<h1[\s>]/i.test(html)) {
    throw new Error(`[prerender] ${route} produced HTML without any <h1> — app likely failed to mount`);
  }
  // Page-specific <title> is managed by TanStack Router's HeadContent.
  // When a route does not provide head tags, the fallback tags from index.html should remain.
  const titleCount = (html.match(/<title\b/gi) ?? []).length;
  if (titleCount !== 1) {
    throw new Error(
      `[prerender] ${route} produced HTML with ${titleCount} <title> tag(s) — expected exactly one title`,
    );
  }
  const routeManagedMetaCounts: Record<string, number> = {
    description: (html.match(/<meta\b[^>]*\bname=["']description["'][^>]*>/gi) ?? []).length,
    "og:title": (html.match(/<meta\b[^>]*\bproperty=["']og:title["'][^>]*>/gi) ?? []).length,
    "og:description": (html.match(/<meta\b[^>]*\bproperty=["']og:description["'][^>]*>/gi) ?? []).length,
    "twitter:title": (html.match(/<meta\b[^>]*\bname=["']twitter:title["'][^>]*>/gi) ?? []).length,
    "twitter:description": (html.match(/<meta\b[^>]*\bname=["']twitter:description["'][^>]*>/gi) ?? []).length,
    canonical: (html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi) ?? []).length,
  };
  const requiredMeta = ["description", "og:title", "og:description", "twitter:title", "twitter:description"] as const;
  const invalidRequiredMeta = requiredMeta.find((name) => routeManagedMetaCounts[name] !== 1);
  if (invalidRequiredMeta) {
    throw new Error(
      `[prerender] ${route} produced ${routeManagedMetaCounts[invalidRequiredMeta]} ${invalidRequiredMeta} meta tags — expected exactly one`,
    );
  }
  const duplicatedOptionalMeta = Object.entries(routeManagedMetaCounts).find(([, count]) => count > 1);
  if (duplicatedOptionalMeta) {
    const [name, count] = duplicatedOptionalMeta;
    throw new Error(`[prerender] ${route} produced ${count} ${name} meta tags — expected at most one`);
  }
  // GTM が prerender 中に起動すると、注入されたタグ (Clarity / GA4 等) が焼き込まれて
  // 実行時に二重初期化される (initGTM は isPrerendering() で起動を抑止している)。
  // 計測スクリプトの混入をビルド失敗として検出し、再発を防ぐ。
  if (/googletagmanager\.com|clarity\.ms/i.test(html)) {
    throw new Error(
      `[prerender] ${route} contains baked analytics scripts (googletagmanager.com / clarity.ms) — GTM must not run while prerendering`,
    );
  }
  // Emotion (Chakra UI) の動的注入スタイルが textContent にダンプされているか確認
  const styleBytes = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ?? []).reduce((sum, s) => sum + s.length, 0);
  if (styleBytes < MIN_INLINE_STYLE_BYTES) {
    throw new Error(
      `[prerender] ${route} produced HTML with only ${styleBytes} bytes of inline <style> — Emotion CSS likely missing (CSSOM dump failed?)`,
    );
  }
}

async function main(): Promise<void> {
  // 1. 元のシェルを起動時に一度だけ読み込んでキャッシュ
  const shellPath = join(DIST_DIR, "index.html");
  const shell = await readFile(shellPath);
  const handler = createShellHandler(shell);

  // 2. ミニ HTTP サーバーを起動
  const server = createServer((req, res) => {
    handler(req, res).catch((err: unknown) => {
      console.error("[prerender] request handler error:", err);
      if (!res.headersSent) res.writeHead(500);
      res.end("Internal error");
    });
  });

  const port = await new Promise<number>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolveListen(address.port);
      } else {
        rejectListen(new Error("Failed to obtain server port"));
      }
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[prerender] Serving dist/ at ${baseUrl}`);
  const routes = await collectPrerenderRoutes();
  console.log(`[prerender] Rendering ${routes.length} route(s)`);

  // 3. ヘッドレス Chromium でルートを訪問し HTML を取得
  const browser = await chromium.launch();
  const context = await browser.newContext();
  // page スクリプト実行前に __PRERENDER__ フラグを注入
  await context.addInitScript(() => {
    (window as unknown as { __PRERENDER__: boolean }).__PRERENDER__ = true;
  });

  // 結果を一度メモリに貯めてから最後にまとめて書き出す
  // (途中で失敗した場合に dist/ を中途半端な状態で残さない)
  const rendered: { outPath: string; html: string }[] = [];

  try {
    for (const route of routes) {
      const url = `${baseUrl}${route}`;
      console.log(`[prerender] Rendering ${route}`);

      const page = await context.newPage();
      const pageEvents: string[] = [];
      page.on("pageerror", (err) => {
        recordPageEvent(pageEvents, `[pageerror] ${err.message}`);
      });
      page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") {
          recordPageEvent(pageEvents, `[console:${msg.type()}] ${msg.text()}`);
        }
      });
      page.on("requestfailed", (request) => {
        if (request.url().startsWith(baseUrl)) {
          recordPageEvent(
            pageEvents,
            `[requestfailed] ${request.url()} ${request.failure()?.errorText ?? "unknown failure"}`,
          );
        }
      });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });

      // React が #app に描画し、head の更新が落ち着くまで待機
      // (Convex の WebSocket が networkidle を妨げるため DOM ベースで待機)
      try {
        await page.waitForFunction(
          () => {
            const app = document.getElementById("app");
            const appReady = app !== null && app.querySelector("h1") !== null;
            const headHasTitle = document.querySelectorAll("head > title").length > 0;
            if (!appReady || !headHasTitle) return false;

            const stateKey = "__PRERENDER_HEAD_STABILITY__";
            const state = window as unknown as {
              [stateKey]?: { snapshot: string; stableSince: number };
            };
            const snapshot = Array.from(
              document.head.querySelectorAll('title, meta[name], meta[property], link[rel="canonical"]'),
            )
              .map((node) => node.outerHTML)
              .join("\n");
            const now = performance.now();
            if (!state[stateKey] || state[stateKey].snapshot !== snapshot) {
              state[stateKey] = { snapshot, stableSince: now };
              return false;
            }
            return now - state[stateKey].stableSince >= 100;
          },
          { timeout: RENDER_WAIT_TIMEOUT_MS },
        );
      } catch (err) {
        throw new Error(
          `${await buildPageDiagnostics(route, page, pageEvents)}\n[prerender] Original wait error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      await page.evaluate(
        ({ routeManagedMetaNames, routeManagedMetaProperties }) => {
          const titleTags = Array.from(document.head.querySelectorAll("title"));
          const lastTitle = titleTags.at(-1)?.textContent?.trim();
          if (titleTags[0] && lastTitle) {
            titleTags[0].textContent = lastTitle;
          }
          for (const node of titleTags.slice(1)) {
            node.remove();
          }

          const canonicalLinks = Array.from(document.head.querySelectorAll('link[rel="canonical"]'));
          const lastCanonical = canonicalLinks.at(-1)?.getAttribute("href");
          if (canonicalLinks[0] && lastCanonical) {
            canonicalLinks[0].setAttribute("href", lastCanonical);
          }
          for (const node of canonicalLinks.slice(1)) {
            node.remove();
          }
          const metaTags = Array.from(document.head.querySelectorAll("meta"));

          for (const name of routeManagedMetaNames) {
            const matches = metaTags.filter((tag) => tag.getAttribute("name")?.toLowerCase() === name);
            const lastContent = matches.at(-1)?.getAttribute("content");
            if (matches[0] && lastContent !== undefined && lastContent !== null) {
              matches[0].setAttribute("content", lastContent);
            }
            for (const node of matches.slice(1)) {
              node.remove();
            }
          }
          for (const property of routeManagedMetaProperties) {
            const matches = metaTags.filter((tag) => tag.getAttribute("property")?.toLowerCase() === property);
            const lastContent = matches.at(-1)?.getAttribute("content");
            if (matches[0] && lastContent !== undefined && lastContent !== null) {
              matches[0].setAttribute("content", lastContent);
            }
            for (const node of matches.slice(1)) {
              node.remove();
            }
          }

          const titleMeta =
            document.head.querySelector('meta[name="twitter:title"]') ??
            document.head.querySelector('meta[property="og:title"]');
          const title = titleMeta?.getAttribute("content")?.trim();
          if (title) {
            document.title = title;
          }
        },
        {
          routeManagedMetaNames: ROUTE_MANAGED_META_NAMES,
          routeManagedMetaProperties: ROUTE_MANAGED_META_PROPERTIES,
        },
      );

      // Emotion の speedy mode は CSSStyleSheet.insertRule で CSSOM に直接ルールを挿入するため、
      // <style> 要素の textContent は空のまま page.content() でシリアライズすると CSS が消える。
      // HTML 取得前に CSSOM の中身を textContent に書き戻す。
      await page.evaluate(() => {
        for (const sheet of Array.from(document.styleSheets)) {
          const node = sheet.ownerNode as HTMLStyleElement | null;
          if (node?.tagName !== "STYLE") continue;
          if (node.textContent && node.textContent.length > 0) continue;
          try {
            const css = Array.from(sheet.cssRules)
              .map((r) => r.cssText)
              .join("");
            node.textContent = css;
          } catch {
            // クロスオリジンシートには触れない
          }
        }
      });

      const html = await page.content();
      await page.close();

      assertRenderedHtml(route, html);
      rendered.push({ outPath: routeToOutputPath(route), html });
    }

    // 4. すべてのルートが正常にレンダリングできてから dist/ へ書き出す
    for (const { outPath, html } of rendered) {
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, html, "utf-8");
      console.log(`[prerender] Wrote ${outPath} (${html.length.toLocaleString()} bytes)`);
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }

  console.log("[prerender] Done");
}

main().catch((err: unknown) => {
  console.error("[prerender] Failed:", err);
  process.exit(1);
});
