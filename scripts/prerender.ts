/**
 * Post-build prerender script
 *
 * vite build が生成した dist/ に対して、指定ルートをヘッドレス Chromium で
 * レンダリングし、完成後の HTML を静的ファイルとして書き出す。
 *
 * SEO 対象: /, /privacy, /terms
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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { chromium } from "playwright";

const DIST_DIR = "dist";
const DIST_ABS = resolve(DIST_DIR);
const ROUTES = ["/", "/privacy", "/terms"] as const;

const GOTO_TIMEOUT_MS = 30_000;
const RENDER_WAIT_TIMEOUT_MS = 15_000;
const MIN_HTML_BYTES = 2_000;
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
  // TanStack Router の head() が少なくとも1つ <title> を追加していれば、
  // index.html の静的 <title> と合わせて2つ以上になるはず
  const titleCount = (html.match(/<title\b/gi) ?? []).length;
  if (titleCount < 2) {
    throw new Error(
      `[prerender] ${route} produced HTML with only ${titleCount} <title> tag(s) — TanStack Router head() likely did not run`,
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
  // 1. 元の空シェルを起動時に一度だけ読み込んでキャッシュ
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
    for (const route of ROUTES) {
      const url = `${baseUrl}${route}`;
      console.log(`[prerender] Rendering ${route}`);

      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });

      // React が #app に描画し、かつ TanStack Router の HeadContent が
      // <title> を 1 つ以上追加するまで待機
      // (Convex の WebSocket が networkidle を妨げるため DOM ベースで待機)
      await page.waitForFunction(
        () => {
          const app = document.getElementById("app");
          const appReady = app !== null && app.children.length > 0;
          const headHasExtraTitle = document.querySelectorAll("head > title").length > 1;
          return appReady && headHasExtraTitle;
        },
        { timeout: RENDER_WAIT_TIMEOUT_MS },
      );

      // Emotion の speedy mode は CSSStyleSheet.insertRule で CSSOM に直接ルールを挿入するため、
      // <style> 要素の textContent は空のまま page.content() でシリアライズすると CSS が消える。
      // HTML 取得前に CSSOM の中身を textContent に書き戻す。
      await page.evaluate(() => {
        for (const sheet of Array.from(document.styleSheets)) {
          const node = sheet.ownerNode as HTMLStyleElement | null;
          if (!node || node.tagName !== "STYLE") continue;
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
