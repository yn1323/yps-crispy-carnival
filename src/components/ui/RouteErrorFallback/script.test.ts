import { describe, expect, it } from "vitest";
import { extractRouterErrors, formatErrorDetails } from "./script";

describe("エラー画面のRouter補足情報", () => {
  it("error状態のroute識別子と文字列messageだけを取り出す", () => {
    const router = {
      state: {
        matches: [
          { status: "success", routeId: "/", error: new Error("古いエラー") },
          {
            status: "error",
            routeId: "__root__",
            error: new Error("Too many redirects"),
            params: { organizationId: "含めない" },
            search: { token: "含めない" },
          },
          { status: "error", routeId: "/_auth/dashboard", error: { message: "読み込み失敗", cause: "含めない" } },
          { status: "error", routeId: "/account", error: { message: { privateValue: "含めない" } } },
          { status: "error", routeId: 123, error: new Error("識別子が不正") },
          { status: "error", routeId: "/staff", error: undefined },
          null,
        ],
      },
    };

    expect(extractRouterErrors(router)).toEqual([
      { route: "__root__", message: "Too many redirects" },
      { route: "/_auth/dashboard", message: "読み込み失敗" },
    ]);
  });

  it.each([undefined, null, {}, { state: null }, { state: { matches: null } }, { state: { matches: [] } }])(
    "Router情報が利用できないときは補足情報を返さない: %j",
    (router) => {
      expect(extractRouterErrors(router)).toEqual([]);
    },
  );

  it("Routerのプロパティ読み取りが失敗しても例外を伝播させない", () => {
    const router = {
      get state() {
        throw new Error("Routerを読めない");
      },
    };

    expect(extractRouterErrors(router)).toEqual([]);
  });

  it("matchのエラー読み取りが失敗しても例外を伝播させない", () => {
    const router = {
      state: {
        matches: [
          {
            status: "error",
            routeId: "__root__",
            get error() {
              throw new Error("エラーを読めない");
            },
          },
        ],
      },
    };

    expect(extractRouterErrors(router)).toEqual([]);
  });
});

describe("問い合わせ用のエラー詳細", () => {
  it("元のエラーを残し、Router情報の許可された項目だけを追記する", () => {
    const original = new Error("ChakraProviderを取得できませんでした");
    const routerErrors = [{ route: "__root__", message: "Too many redirects", privateValue: "含めない" }];

    const details = formatErrorDetails(original, routerErrors);

    expect(details).toBe(
      'ChakraProviderを取得できませんでした\n\nルーター内のエラー:\n[\n  {\n    "route": "__root__",\n    "message": "Too many redirects"\n  }\n]',
    );
  });

  it("補足情報がなければ元のエラーだけを表示する", () => {
    expect(formatErrorDetails(new Error("元のエラー"), [])).toBe("元のエラー");
    expect(formatErrorDetails("文字列のエラー", [])).toBe("文字列のエラー");
  });

  it("元のエラーを読めなくても復旧案内用のメッセージを返す", () => {
    const error = {
      get message() {
        throw new Error("messageを読めない");
      },
    };

    expect(formatErrorDetails(error, [])).toBe("エラーの詳細を取得できませんでした。");
  });

  it("補足情報の整形に失敗しても元のエラーを表示する", () => {
    const routerErrors = [
      {
        route: "__root__",
        get message(): string {
          throw new Error("補足情報を読めない");
        },
      },
    ];

    expect(formatErrorDetails(new Error("元のエラー"), routerErrors)).toBe("元のエラー");
  });
});
