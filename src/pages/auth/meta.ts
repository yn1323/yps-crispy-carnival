import { buildMeta } from "@/src/lib/seo";

const buildAuthHead = (title: string) => ({
  // redirectクエリに招待トークンなどを保持するため、認証画面からリファラーへURLを渡さない。
  meta: [...buildMeta({ title, noindex: true }), { name: "referrer", content: "no-referrer" }],
});

export const buildLoginPageHead = () => buildAuthHead("ログイン");
export const buildSignupPageHead = () => buildAuthHead("新規登録");
export const buildForgotPasswordPageHead = () => buildAuthHead("パスワード再設定");
export const buildSsoCallbackPageHead = () => buildAuthHead("認証処理中");
