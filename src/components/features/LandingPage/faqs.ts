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
    q: "無料トライアル終了後、自動で料金が発生しますか？",
    a: `いいえ、自動では発生しません。
トライアル中はクレジットカードの登録も不要です。
有料プランを申し込んだ場合にのみ料金が発生します。`,
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
