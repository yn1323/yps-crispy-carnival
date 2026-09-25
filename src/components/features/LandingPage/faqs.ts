import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";

const freeLimits = ORGANIZATION_PLAN_LIMITS.free;

export type LandingFaq = {
  q: string;
  a: string;
};

/** 回答は1行に1文で書く。表示では行ごとに改行し、構造化データには同じ文字列を使う。 */
export const landingFaqs: LandingFaq[] = [
  {
    q: "LINEでシフト管理はできますか？",
    a: `はい、できます。
提出リンクも確定シフトもLINEで届きます。
お店でLINE公式アカウントは不要です。`,
  },
  {
    q: "スタッフはアプリのインストールや会員登録が必要ですか？",
    a: `いいえ、どちらも不要です。
届いたリンクを開くだけで提出できます。`,
  },
  {
    q: "LINEを使っていないスタッフも利用できますか？",
    a: `はい、利用できます。
LINEを使わない人にはメールで届きます。`,
  },
  {
    q: "シフトリでは、どこまでシフト管理できますか？",
    a: `希望シフトの回収から共有までです。
勤怠管理や給与計算の機能はありません。`,
  },
  {
    q: "スマホだけでシフトを作れますか？",
    a: `はい、作成から確定までスマホでできます。
PCでも同じシフト表を開けます。`,
  },
  {
    q: "希望シフトの提出方法は選べますか？",
    a: `はい、店舗ごとに3つから選べます。
時間指定・日付選択・パターン選択です。`,
  },
  {
    q: "紙・Excel・LINEでの運用から、すぐに切り替えられますか？",
    a: `はい。
スタッフを登録すれば始められます。
過去のシフトを移す必要はありません。
今の運用と並行して試せます。`,
  },
  {
    q: "トライアル終了後も無料で使えますか？",
    a: `はい、Freeプランで無料で使えます。
上限は利用人数${freeLimits.maxPeople}名（管理者を含む）です。
店舗は${freeLimits.maxShops}つ、管理者は${freeLimits.maxActiveManagers}名までです。
超える間は、募集などの操作を制限します。
上限内に戻すか有料プランで再開できます。
申し込まない限り、料金はかかりません。`,
  },
];

export function createLandingFaqPageJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: landingFaqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };
}
