import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";

const freeLimits = ORGANIZATION_PLAN_LIMITS.free;

export type LandingFaq = {
  q: string;
  a: string;
};

export const landingFaqs: LandingFaq[] = [
  {
    q: "スタッフはアプリのインストールや会員登録が必要ですか？",
    a: `いいえ、スタッフによるアプリのインストールや会員登録は不要です。
管理者から届いたURLを開くだけで、スマートフォンから希望シフトを提出できます。`,
  },
  {
    q: "LINEを使っていないスタッフも利用できますか？",
    a: `はい、利用できます。
LINEを利用するスタッフにはLINEで、利用しないスタッフにはメールでお知らせできます。
同じ店舗内でLINEとメールを併用できます。`,
  },
  {
    q: "シフトリでは、どこまでシフト管理できますか？",
    a: `希望シフトの募集、提出状況の確認、未提出者への催促、シフトの調整・確定、スタッフへの共有まで行えます。
勤怠管理や給与計算ではなく、シフト希望の回収から確定・共有までをシンプルにするサービスです。`,
  },
  {
    q: "紙・Excel・LINEでの運用から、すぐに切り替えられますか？",
    a: `はい。
スタッフを登録して、次回のシフト募集を作成するところから始められます。
過去のシフトを移し替える必要はなく、現在の運用と併用しながら試すこともできます。`,
  },
  {
    q: "トライアル終了後も無料で使えますか？",
    a: `はい、管理者を含む${freeLimits.maxPeople}名・${freeLimits.maxShops}店舗までなら、Freeプランで無料のまま使い続けられます。
トライアル中はクレジットカードの登録も不要で、有料プランを申し込まない限り料金は発生しません。
人数や店舗数が上限を超える場合は、上限内へ整理するか有料プランを選ぶと、引き続き利用できます。`,
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
