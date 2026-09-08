// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteErrorFallback } from ".";

const initialRouterDescriptor = Object.getOwnPropertyDescriptor(window, "__TSR_ROUTER__");

afterEach(() => {
  cleanup();
  if (initialRouterDescriptor) {
    Object.defineProperty(window, "__TSR_ROUTER__", initialRouterDescriptor);
  } else {
    Reflect.deleteProperty(window, "__TSR_ROUTER__");
  }
});

describe("エラー画面とブラウザのRouter情報の接続", () => {
  it("SSR中はRouterを読まず、hydrate後にクライアントの補足情報を追記する", () => {
    const readRouter = vi.fn(() => ({
      state: { matches: [{ status: "error", routeId: "__root__", error: new Error("Too many redirects") }] },
    }));
    Object.defineProperty(window, "__TSR_ROUTER__", { configurable: true, get: readRouter });
    const error = new Error("元の描画エラー");

    const serverHtml = renderToString(<RouteErrorFallback error={error} />);

    expect(readRouter).not.toHaveBeenCalled();
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    expect(container.querySelector("pre")?.textContent).toBe(error.message);

    render(<RouteErrorFallback error={error} />, { container, hydrate: true });

    expect(readRouter).toHaveBeenCalledOnce();
    expect(container.querySelector("pre")?.textContent).toContain(error.message);
    expect(container.querySelector("pre")?.textContent).toContain('"message": "Too many redirects"');
  });

  it("ブラウザにRouterがない場合も元のエラーを残す", () => {
    Reflect.deleteProperty(window, "__TSR_ROUTER__");

    const { container } = render(<RouteErrorFallback error={new Error("元の描画エラー")} />);

    expect(container.querySelector("pre")?.textContent).toBe("元の描画エラー");
  });

  it("グローバルの読み取りで例外が発生しても元のエラーを残す", () => {
    const readRouter = vi.fn(() => {
      throw new Error("グローバルを読めない");
    });
    Object.defineProperty(window, "__TSR_ROUTER__", { configurable: true, get: readRouter });

    const { container } = render(<RouteErrorFallback error={new Error("元の描画エラー")} />);

    expect(readRouter).toHaveBeenCalledOnce();
    expect(container.querySelector("pre")?.textContent).toBe("元の描画エラー");
  });

  it("表示対象のエラーが変わったときだけRouter情報を取り直す", () => {
    const readRouter = vi.fn(() => ({
      state: { matches: [{ status: "error", routeId: "__root__", error: new Error("最初のRouterエラー") }] },
    }));
    Object.defineProperty(window, "__TSR_ROUTER__", { configurable: true, get: readRouter });
    const error = new Error("最初の描画エラー");
    const { container, rerender } = render(<RouteErrorFallback error={error} />);

    rerender(<RouteErrorFallback error={error} />);
    expect(readRouter).toHaveBeenCalledOnce();
    readRouter.mockReturnValue({
      state: { matches: [{ status: "error", routeId: "__root__", error: new Error("次のRouterエラー") }] },
    });
    rerender(<RouteErrorFallback error={new Error("次の描画エラー")} />);

    expect(readRouter).toHaveBeenCalledTimes(2);
    expect(container.querySelector("pre")?.textContent).toContain("次の描画エラー");
    expect(container.querySelector("pre")?.textContent).toContain("次のRouterエラー");
    expect(container.querySelector("pre")?.textContent).not.toContain("最初のRouterエラー");
  });

  it("表示用propsが指定されていればブラウザのRouterを参照しない", () => {
    const readRouter = vi.fn(() => {
      throw new Error("参照しない");
    });
    Object.defineProperty(window, "__TSR_ROUTER__", { configurable: true, get: readRouter });

    const { container } = render(<RouteErrorFallback error={new Error("元の描画エラー")} routerErrors={[]} />);

    expect(readRouter).not.toHaveBeenCalled();
    expect(container.querySelector("pre")?.textContent).toBe("元の描画エラー");
  });
});
