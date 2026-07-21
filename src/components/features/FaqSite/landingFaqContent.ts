import type { FaqEntry } from "./faqContent";

export type LandingFaq = {
  q: string;
  a: string;
};

export const featuredFaqEntries: FaqEntry[] = [
  {
    id: "submit-with-line",
    category: "before-start",
    question: "LINEで希望シフトを提出できますか？",
    answer: [
      "できます。LINEまたはメールで届いた提出用リンクを開き、Webフォームから希望シフトを提出してもらえます。",
      "LINE連携済みのスタッフには通常LINEで送り、LINEを利用できない場合やLINE送信の上限に達した場合はメールへ切り替えます。",
    ],
    keywords: ["LINE提出", "シフト提出", "希望を送る", "メール提出"],
    audience: "all",
    featured: true,
    howTo: { href: "/howto#staff-submission-workflow", label: "スタッフ側の提出の流れを見る" },
  },
  {
    id: "pricing",
    category: "before-start",
    question: "無料で使えますか？",
    answer: ["無料プランがあります。利用人数5名、1店舗、管理者1名まで、基本的なシフト運用を利用できます。"],
    keywords: ["無料", "料金", "価格", "費用", "月額", "いくら", "有料", "プラン", "Free"],
    audience: "all",
    featured: true,
  },
  {
    id: "staff-account",
    category: "before-start",
    question: "スタッフはアプリの登録やログインが必要ですか？",
    answer: [
      "必要ありません。スタッフはLINEまたはメールで届いたリンクを開き、スマートフォンから希望シフトを提出できます。",
      "店舗やスタッフ、シフトを管理するシフト作成担当者には、シフトリの管理者アカウントが必要です。",
    ],
    keywords: ["アプリ不要", "ログイン不要", "アカウント不要", "インストール", "スタッフ登録"],
    audience: "all",
    featured: true,
    howTo: { href: "/howto#staff-submission-workflow", label: "スタッフ側の流れを見る" },
  },
  {
    id: "without-line",
    category: "before-start",
    question: "LINEを使わないスタッフがいても利用できますか？",
    answer: ["利用できます。LINEを連携していないスタッフや、LINEで受け取れないスタッフにはメールで送ります。"],
    keywords: ["LINEなし", "メールだけ", "ガラケー", "LINE未連携", "送り分け"],
    audience: "all",
    featured: true,
    howTo: { href: "/howto#notification-channel", label: "通知先の決まり方を見る" },
  },
  {
    id: "mobile-support",
    category: "before-start",
    question: "スマートフォンでもシフトを作成できますか？",
    answer: [
      "スマートフォンでも、希望の確認、勤務の調整、下書き保存、シフト確定を行えます。",
      "時間を細かく調整する作業は、画面が広いPCのほうが一覧を見渡しやすくなります。",
    ],
    keywords: ["スマホ", "スマートフォン", "PC", "タブレット", "モバイル"],
    audience: "manager",
    featured: true,
    howTo: { href: "/howto#build-shift-from-requests", label: "シフト作成の手順を見る" },
  },
  {
    id: "automatic-reminder",
    category: "before-start",
    question: "未提出スタッフへ自動で催促できますか？",
    answer: [
      "できます。提出締切の前日17:00に、まだ提出していないシフト対象スタッフへ自動で催促を送ります。",
      "締切前日17:00を過ぎてから募集を作成した場合、その募集の自動催促は予約されません。",
    ],
    keywords: ["自動催促", "リマインド", "未提出", "締切前日", "締め切り前日", "17時"],
    audience: "manager",
    featured: true,
    howTo: { href: "/howto#automatic-reminder", label: "自動催促の条件を見る" },
  },
  {
    id: "move-from-paper-or-excel",
    category: "before-start",
    question: "Excelや紙のシフト管理から移行できますか？",
    answer: [
      "できます。まず店舗設定とスタッフを登録し、次の募集から希望回収、シフト作成、確定通知をシフトリへ移す方法が分かりやすいです。",
      "Excelファイルをそのまま取り込む機能ではありません。進行中のシフトは現在の方法で完了させ、次の期間から切り替えると混乱を減らせます。",
    ],
    keywords: ["Excel", "エクセル", "紙", "移行", "乗り換え", "インポート"],
    audience: "manager",
    featured: true,
    howTo: { href: "/howto#shift-workflow", label: "シフト作成の全体像を見る" },
  },
];

export const landingFaqs: LandingFaq[] = featuredFaqEntries.map((entry) => ({
  q: entry.question,
  a: entry.answer[0],
}));

export function createLandingFaqPageJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: landingFaqs.map((entry) => ({
      "@type": "Question",
      name: entry.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.a,
      },
    })),
  };
}
