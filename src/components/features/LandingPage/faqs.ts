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
LINEを連携したスタッフには、提出リンク、催促、確定シフトがLINEで届きます。
お店でLINE公式アカウントを用意する必要はありません。`,
  },
  {
    q: "スタッフはアプリのインストールや会員登録が必要ですか？",
    a: `いいえ、どちらも不要です。
届いたリンクを開くだけで提出できます。`,
  },
  {
    q: "LINEを使っていないスタッフも利用できますか？",
    a: `はい、利用できます。
LINEを使わないスタッフには、メールで届きます。`,
  },
  {
    q: "シフトリでは、どこまでシフト管理できますか？",
    a: `希望シフトの募集から、催促、シフト作成、確定シフトの共有までです。
勤怠管理や給与計算の機能はありません。`,
  },
  {
    q: "スマホだけでシフトを作れますか？",
    a: `はい、作成から確定までスマホでできます。
PCでも同じシフト表を開けます。`,
  },
  {
    q: "希望シフトの提出方法は選べますか？",
    a: `はい、時間指定・日付選択・パターン選択から店舗ごとに選べます。`,
  },
  {
    q: "紙・Excel・LINEでの運用から、すぐに切り替えられますか？",
    a: `はい。
スタッフを登録すれば、次のシフト募集から始められます。
過去のシフトを移す必要はなく、今の運用と並行して試せます。`,
  },
  {
    q: "トライアル終了後も無料で使えますか？",
    a: `はい、利用人数${freeLimits.maxPeople}名（管理者を含む）・${freeLimits.maxShops}店舗・管理者${freeLimits.maxActiveManagers}名までなら、Freeプランで無料です。
トライアル中はカード登録が不要で、有料プランを申し込まない限り料金はかかりません。`,
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
