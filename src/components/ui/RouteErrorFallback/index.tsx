import { LuRotateCw, LuTriangleAlert } from "react-icons/lu";
import styles from "./styles.css?inline";

type Props = {
  error: unknown;
  onRefresh?: () => void;
};

function getErrorMessage(error: unknown): string {
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message) {
    return error.message;
  }
  return "エラーの詳細を取得できませんでした。";
}

function reloadPage(): void {
  window.location.reload();
}

/** Providerや通常のstylesheetが利用できない場合にも表示する。 */
export function RouteErrorFallback({ error, onRefresh = reloadPage }: Props) {
  return (
    <div className="route-error">
      <style>{styles}</style>
      <main className="route-error__content">
        <div className="route-error__intro">
          <div className="route-error__symbol">
            <LuTriangleAlert aria-hidden="true" size={22} />
          </div>
          <h1>ページを表示できませんでした</h1>
          <p>
            ご不便をおかけして申し訳ありません。
            <br />
            次の方法を順にお試しください。
          </p>
        </div>
        <ol className="route-error__steps">
          <li>
            <span className="route-error__number" aria-hidden="true">
              1
            </span>
            <div>
              <h2>ページを再読み込みする</h2>
              <p>まずは、このページの再読み込みをお試しください。</p>
              <button className="route-error__reload" type="button" onClick={onRefresh}>
                <LuRotateCw aria-hidden="true" size={16} />
                再読み込みする
              </button>
              <div className="route-error__desktop-help">
                <p className="route-error__key-help">
                  パソコンのChromeでは、次のキーでキャッシュを使わずに再読み込みできます。
                </p>
                <div className="route-error__shortcuts">
                  <span>
                    Windows <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd>
                  </span>
                  <span>
                    Mac <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd>
                  </span>
                </div>
              </div>
              <p className="route-error__mobile-help route-error__key-help">
                LINEから開いている場合は、SafariやChromeで同じページを開き直す方法もお試しください。
              </p>
            </div>
          </li>
          <li>
            <span className="route-error__number" aria-hidden="true">
              2
            </span>
            <div>
              <h2>改善しない場合</h2>
              <p>1〜2時間ほど時間をおいてから、あらためてログインしてお試しください。</p>
            </div>
          </li>
          <li>
            <span className="route-error__number" aria-hidden="true">
              3
            </span>
            <div>
              <h2>それでも改善しない場合</h2>
              <p>エラーの詳細を表示し、内容をコピーしてお問い合わせの本文に貼り付けてお送りください。</p>
              <details className="route-error__details">
                <summary>
                  <span className="route-error__chevron" aria-hidden="true">
                    ›
                  </span>
                  <span className="route-error__show-details">エラーの詳細を表示</span>
                  <span className="route-error__hide-details">エラーの詳細を閉じる</span>
                </summary>
                <div className="route-error__error-box">
                  <p>以下の内容をすべてコピーしてください。</p>
                  <pre data-clarity-mask="true">
                    <code>{getErrorMessage(error)}</code>
                  </pre>
                </div>
              </details>
              <p>
                <a
                  className="route-error__contact-link"
                  href="https://shiftori.app/contact"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  お問い合わせフォーム（別タブ）
                </a>
              </p>
            </div>
          </li>
        </ol>
      </main>
    </div>
  );
}

/** root documentも失われる最上位の例外では、Routerのhead処理を再利用しない。 */
export function DocumentErrorFallback({ error }: { error: unknown }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>ページを表示できませんでした｜シフトリ</title>
      </head>
      <body style={{ margin: 0 }}>
        <RouteErrorFallback error={error} />
      </body>
    </html>
  );
}
