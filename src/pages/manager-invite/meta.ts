import { buildMeta } from "@/src/lib/seo";

export function buildManagerInvitationPageHead() {
  const meta = buildMeta({ title: "管理者招待", noindex: true });
  return {
    // 招待トークンを同一オリジンの画像や外部リソースへのリファラーへ含めない。
    meta: [...meta, { name: "referrer", content: "no-referrer" }],
  };
}
