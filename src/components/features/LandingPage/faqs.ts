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
シフト募集を作ると、LINEを連携したスタッフには提出リンクがLINEで届き、スマートフォンから希望シフトを提出できます。
未提出の人への催促と、確定シフトのお知らせもLINEで受け取れます。
お店でLINE公式アカウントを用意する必要はありません。`,
  },
  {
    q: "スタッフはアプリのインストールや会員登録が必要ですか？",
    a: `いいえ、どちらも不要です。
管理者から届いたURLを開くだけで、スマートフォンから希望シフトを提出できます。`,
  },
  {
    q: "LINEを使っていないスタッフも利用できますか？",
    a: `はい、利用できます。
LINEを利用するスタッフにはLINEで、利用しないスタッフにはメールでお知らせできます。`,
  },
  {
    q: "シフトリでは、どこまでシフト管理できますか？",
    a: `希望シフトの募集、提出状況の確認、未提出者への催促、シフトの調整・確定、スタッフへの共有まで行えます。
勤怠管理や給与計算の機能はありません。`,
  },
  {
    q: "スマホだけでシフトを作れますか？",
    a: `はい、スマホからもシフト表の作成、下書き保存、確定ができます。
PCでも同じシフト表を開けるので、場所に合わせて使い分けられます。`,
  },
  {
    q: "希望シフトの提出方法は選べますか？",
    a: `はい、時間指定・日付選択・パターン選択の3つから、店舗ごとに選べます。
変更した提出方法は、次に作るシフト募集から使われます。`,
  },
  {
    q: "紙・Excel・LINEでの運用から、すぐに切り替えられますか？",
    a: `はい。
スタッフを登録して、次回のシフト募集を作成するところから始められます。
過去のシフトを移し替える必要はなく、現在の運用と併用しながら試すこともできます。`,
  },
  {
    q: "トライアル終了後も無料で使えますか？",
    a: `はい、利用人数${freeLimits.maxPeople}名（管理者を含む）、${freeLimits.maxShops}店舗、管理者${freeLimits.maxActiveManagers}名までなら、Freeプランで無料のまま使い続けられます。
トライアル中はクレジットカードの登録も不要で、有料プランを申し込まない限り料金は発生しません。
利用人数、店舗数、管理者数のいずれかが上限を超えても、上限内に減らすか有料プランに切り替えれば使い続けられます。`,
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
