import type { IconType } from "react-icons";
import { LuBellRing, LuCalendarRange, LuMessageCircle, LuSendHorizontal, LuStore } from "react-icons/lu";
import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";
import heroPcImage from "@/src/assets/hero-pc.webp";
import confirmedShiftNoticeImage from "@/src/assets/screens/confirmed-shift-notice.webp";
import multiStoreRecruitmentsImage from "@/src/assets/screens/multi-store-recruitments.webp";
import recruitmentSubmissionStatusImage from "@/src/assets/screens/recruitment-submission-status.webp";
import shiftBoardReminderImage from "@/src/assets/screens/shift-board-reminder.webp";
import shiftBoardSpImage from "@/src/assets/screens/shift-board-sp.webp";
import staffInvitationQrImage from "@/src/assets/screens/staff-invitation-qr.webp";
import staffRequestNoticeImage from "@/src/assets/screens/staff-request-notice.webp";
import submitTimeImage from "@/src/assets/screens/submit-time.webp";
import buildScheduleImage from "./images/build-schedule.webp";
import collectRequestsImage from "./images/collect-requests.webp";
import deadlineReminderImage from "./images/deadline-reminder.webp";
import multiStoreMapImage from "./images/multi-store-map.webp";
import shareConfirmedImage from "./images/share-confirmed.webp";
import { getProductFeatureHref, PRODUCT_FEATURE_SLUGS, type ProductFeatureSlug } from "./productFeatureRoutes";

// 表示の大半はスマホ（幅360px前後）で読まれる。
// 本文は1文ごとに改行して表示するため、1文を20文字前後、カードの見出しを15文字以内に収める。

export type ProductFeatureFaq = {
  q: string;
  a: string;
};

export type ProductFeatureScreen = {
  src: string;
  alt: string;
  /** phoneはスマホ画面の上部、desktopはPC画面全体を切り抜いた画像。 */
  frame: "phone" | "desktop";
};

export type ProductFeatureCapability = {
  title: string;
  body: string;
  screen?: ProductFeatureScreen;
};

export type ProductFeatureLink = {
  href: string;
  label: string;
};

export type ProductFeature = {
  slug: ProductFeatureSlug;
  href: string;
  /** 一覧、パンくず、関連リンクで使う短い名前。 */
  name: string;
  icon: IconType;
  /** 一覧のカードで使う1文の説明。 */
  summary: string;
  metaTitle: string;
  metaDescription: string;
  /** 文節ごとに分け、スマホでも文節の途中で折り返さないようにする。 */
  heading: string[];
  lead: string;
  illustration: { src: string; alt: string };
  pains: string[];
  capabilities: ProductFeatureCapability[];
  steps: Array<{ title: string; body: string }>;
  faqs: ProductFeatureFaq[];
  related: ProductFeatureSlug[];
  /** 操作手順の詳細はヘルプが所有するため、機能ページからはリンクだけを置く。 */
  helpLinks: ProductFeatureLink[];
  articleSlugs: string[];
};

const freeLimits = ORGANIZATION_PLAN_LIMITS.free;
const paidLimits = ORGANIZATION_PLAN_LIMITS.pro;

const PRODUCT_FEATURE_DEFINITIONS: Record<ProductFeatureSlug, Omit<ProductFeature, "slug" | "href">> = {
  "shift-request-collection": {
    name: "希望シフトの回収",
    icon: LuMessageCircle,
    summary: "LINEやメールから提出できます",
    // 画面の用語は「希望シフト」だが、検索では「シフト希望」の語順が使われるためtitleだけ合わせる。
    metaTitle: "LINEでシフト希望を回収｜スタッフはアプリ不要で提出できる",
    metaDescription:
      "シフト募集を作ると、スタッフのLINEやメールに提出リンクが届きます。スタッフはアプリのインストールや会員登録なしで、時間指定・日付選択・パターン選択から希望シフトを提出できます。",
    heading: ["LINEで", "希望シフトを集める"],
    lead: "スタッフに提出リンクが自動で届きます。希望はそのままシフト表に並びます。",
    illustration: {
      src: collectRequestsImage,
      alt: "4人のスタッフがスマートフォンから提出した希望が、1枚のシフト表に集まるイラスト",
    },
    pains: ["希望シフトがLINEの会話に流れる", "書き方がバラバラで読み取りにくい", "希望シフトをExcelに書き写している"],
    capabilities: [
      {
        title: "提出リンクがLINE・メールで届く",
        body: "募集を作るとスタッフに届きます。LINEを使わない人にはメールで届きます。",
        screen: {
          src: staffRequestNoticeImage,
          alt: "スタッフのスマートフォンに届いた、希望シフトの提出を依頼するお知らせ",
          frame: "phone",
        },
      },
      {
        title: "アプリも会員登録も不要",
        body: "リンクを開けば、そのまま提出できます",
      },
      {
        title: "提出方法を3つから選べる",
        body: "時間指定・日付選択・パターン選択です。店舗ごとに設定できます。",
        screen: {
          src: submitTimeImage,
          alt: "時間指定で、日付ごとに働ける開始時間と終了時間を入力する提出画面",
          frame: "phone",
        },
      },
      {
        title: "前回の希望をボタン1つで入力",
        body: "直近の週と同じ曜日・時間を入力できます",
      },
      {
        title: "何度でも出し直せる",
        body: "提出期限までは変更できます",
      },
    ],
    steps: [
      { title: "シフト募集を作る", body: "シフト期間と提出期限を入力します" },
      { title: "スタッフが提出する", body: "届いたリンクからスマホで提出します" },
      { title: "提出状況を確認する", body: "未提出の人を画面で確認します" },
    ],
    faqs: [
      {
        q: "スタッフにアプリを入れてもらう必要はありますか？",
        a: "いいえ、必要ありません。届いたリンクをブラウザで開いて提出します。アカウント登録もいりません。",
      },
      {
        q: "お店でLINE公式アカウントを用意する必要はありますか？",
        a: "いいえ、必要ありません。シフトリの公式アカウントから届きます。",
      },
      {
        q: "LINEを使っていないスタッフはどうなりますか？",
        a: "登録したメールアドレスに届きます。送り先はシフトリが自動で切り替えます。",
      },
      {
        q: "提出方法はあとから変えられますか？",
        a: "はい、店舗設定から変更できます。次のシフト募集から反映されます。",
      },
    ],
    related: ["submission-reminder", "shift-schedule", "shift-sharing"],
    helpLinks: [
      { href: "/help/create-shift-recruitment", label: "シフト募集を作成する" },
      { href: "/help/guide-staff-line-connection", label: "スタッフへLINE連携を案内する" },
    ],
    articleSlugs: ["line-shift-submission", "shift-request-sheet-template"],
  },
  "submission-reminder": {
    name: "提出状況の確認と自動催促",
    icon: LuBellRing,
    summary: "未提出の人に自動で催促します",
    metaTitle: "シフト未提出の催促を自動化｜提出状況を一覧で確認",
    metaDescription:
      "希望シフトを提出していないスタッフを一覧で確認できます。提出期限の前日17時には、未提出のスタッフへ催促のお知らせがLINEやメールで自動で届きます。",
    heading: ["シフト未提出の", "催促を自動にする"],
    lead: "未提出の人を一覧で確認できます。期限の前日には催促が自動で届きます。",
    illustration: {
      src: deadlineReminderImage,
      alt: "提出期限の日に印を付けたカレンダーから、スタッフのスマートフォンへお知らせが届くイラスト",
    },
    pains: ["名簿と見比べて未提出の人を数えている", "「シフトまだ？」と一人ずつ聞いている", "催促し忘れた人がいた"],
    capabilities: [
      {
        title: "提出人数と未提出の人が分かる",
        body: "ダッシュボードとシフト表で確認できます",
        screen: {
          src: recruitmentSubmissionStatusImage,
          alt: "ダッシュボードの募集一覧で、募集ごとの提出期限までの日数と提出人数を確認する画面",
          frame: "phone",
        },
      },
      {
        title: "前日17時に自動で催促",
        body: "未提出の人にだけ届きます",
      },
      {
        title: "催促を送ったか画面で分かる",
        body: "送った日時か送る予定を表示します",
        screen: {
          src: shiftBoardReminderImage,
          alt: "スマートフォンのシフト表の下部に、未提出の人数と、提出期限の前日17時に催促を送る予定が表示された画面",
          frame: "phone",
        },
      },
      {
        title: "未提出の人は期限後も出せる",
        body: "確定前で、期間の開始前に限ります",
      },
      {
        title: "確定し忘れを知らせる",
        body: "期限の翌日17時に管理者へ届きます",
      },
    ],
    steps: [
      { title: "提出期限を決める", body: "シフト募集を作るときに設定します" },
      { title: "提出状況を見る", body: "未提出の人を画面で確認します" },
      { title: "前日に催促が届く", body: "17時に未提出の人へ届きます" },
    ],
    faqs: [
      {
        q: "催促のお知らせは、提出済みのスタッフにも届きますか？",
        a: "いいえ、届きません。送る時点で未提出の人にだけ届きます。",
      },
      {
        q: "催促を送る日時は変えられますか？",
        a: "いいえ、提出期限の前日17時に固定です。期限を変えた場合は、その前日に送ります。",
      },
      {
        q: "特定のスタッフにだけ、もう一度お知らせできますか？",
        a: "はい、スタッフごとの画面から送り直せます。",
      },
    ],
    related: ["shift-request-collection", "shift-schedule", "shift-sharing"],
    helpLinks: [{ href: "/help/resolve-action-inbox", label: "「要対応」ページの使い方" }],
    articleSlugs: ["line-shift-submission", "shift-build-faster"],
  },
  "shift-schedule": {
    name: "シフト表の作成",
    icon: LuCalendarRange,
    summary: "PCでもスマホでも組めます",
    metaTitle: "シフト表作成ツール｜希望シフトを見ながらPC・スマホで作れる",
    metaDescription:
      "提出された希望シフトがそのままシフト表に並び、見比べながら割り当てられます。PCでもスマホでも作成でき、休業日への割り当てなどは保存前にチェックします。PDF・Excelにも出力できます。",
    heading: ["希望シフトを見ながら", "シフト表を作る"],
    lead: "希望シフトは転記なしで表に並びます。あとは調整して確定するだけです。",
    illustration: {
      src: buildScheduleImage,
      alt: "店長がノートPCとスマートフォンで同じシフト表を見ながら作業するイラスト",
    },
    pains: ["紙とExcelを見比べて組んでいる", "PCがないとシフトを直せない", "休み希望を見落として勤務を入れた"],
    capabilities: [
      {
        title: "希望シフトが最初から並んでいる",
        body: "提出された希望が下書きとして並びます",
        screen: {
          src: heroPcImage,
          alt: "PCのシフト表で、スタッフごとの勤務時間が横棒で並んでいる画面",
          frame: "desktop",
        },
      },
      {
        title: "PCでもスマホでも作れる",
        body: "PCは表全体を、スマホは1日ずつ編集できます",
        screen: {
          src: shiftBoardSpImage,
          alt: "スマートフォンで1日分のスタッフの勤務を割り当てる画面",
          frame: "phone",
        },
      },
      {
        title: "希望と違う割り当てを知らせる",
        body: "休み希望の日などに入れると知らせます",
      },
      {
        title: "保存前にミスをチェック",
        body: "休業日への割り当てなどを知らせます",
      },
      {
        title: "下書き保存で少しずつ仕上げる",
        body: "下書きはスタッフに通知されません",
      },
      {
        title: "PDF・Excelに出力できる",
        body: "掲示や給与計算の資料に使えます",
      },
    ],
    steps: [
      { title: "シフト表を開く", body: "ダッシュボードの募集から開きます" },
      { title: "希望を見ながら割り当てる", body: "調整して下書き保存します" },
      { title: "シフトを確定する", body: "確定するとスタッフに届きます" },
    ],
    faqs: [
      {
        q: "スマホだけでシフト表を作れますか？",
        a: "はい、作成から確定までスマホでできます。複数の時間帯を入れる日は、PCで編集します。",
      },
      {
        q: "シフトを自動で組んでくれますか？",
        a: "いいえ、自動で組む機能はありません。希望を並べた下書きから調整します。",
      },
      {
        q: "Excelで直した表を取り込めますか？",
        a: "いいえ、取り込めません。変更はシフトリのシフト表で行ってください。",
      },
    ],
    related: ["submission-reminder", "shift-sharing", "shift-request-collection"],
    helpLinks: [
      { href: "/help/scenarios/shift-management", label: "シフト募集〜作成の流れを知りたい" },
      { href: "/help/scenarios/shift-export", label: "シフトをPDF・Excelでダウンロードしたい" },
    ],
    articleSlugs: ["shift-schedule-creation-guide", "shift-build-faster"],
  },
  "shift-sharing": {
    name: "確定シフトの共有",
    icon: LuSendHorizontal,
    summary: "一人ひとりに自動で届きます",
    metaTitle: "確定シフトをLINEで共有｜変更したスタッフにだけ再通知",
    metaDescription:
      "シフトを確定すると、スタッフのLINEやメールに確定シフトのお知らせが届きます。確定後に変更したときは、勤務が変わったスタッフにだけお知らせが届きます。",
    heading: ["確定シフトを", "LINEやメールで届ける"],
    lead: "確定すると一人ひとりに届きます。届くのは本人の勤務日と時間です。",
    illustration: {
      src: shareConfirmedImage,
      alt: "教室、電車、自宅にいる3人のスタッフが、それぞれスマートフォンで確定シフトのお知らせを見るイラスト",
    },
    pains: ["シフト表を撮ってグループに送っている", "変更を誰に伝え直すか迷う", "伝えたはずが届いていなかった"],
    capabilities: [
      {
        title: "確定するとお知らせが届く",
        body: "本人の勤務日と時間が届きます",
        screen: {
          src: confirmedShiftNoticeImage,
          alt: "スタッフのスマートフォンに届いた、確定シフトの勤務日と時間のお知らせ",
          frame: "phone",
        },
      },
      {
        title: "勤務が変わった人にだけお知らせ",
        body: "ほかの人には届きません",
      },
      {
        title: "リンクから確定シフトを見返せる",
        body: "期限切れのリンクは本人が再発行できます",
      },
      {
        title: "送れなかったお知らせに気づける",
        body: "送れなかった相手に送り直せます",
      },
      {
        title: "スタッフごとの通知履歴",
        body: "いつ、どの方法で送ったか確認できます",
      },
    ],
    steps: [
      { title: "シフトを確定する", body: "シフト表を確認して確定します" },
      { title: "スタッフに届く", body: "LINEかメールに自動で届きます" },
      { title: "変更したら再度確定する", body: "変わった人にだけ届きます" },
    ],
    faqs: [
      {
        q: "確定シフトのお知らせには、何が書かれていますか？",
        a: "受け取った人自身の勤務日と時間です。リンクから確定シフトも開けます。",
      },
      {
        q: "シフトを変更したら、全員にもう一度届きますか？",
        a: "いいえ、勤務が変わった人にだけ届きます。",
      },
      {
        q: "紙に印刷して掲示したい場合はどうすればよいですか？",
        a: "PDFやExcelに出力して印刷できます。",
      },
    ],
    related: ["shift-schedule", "shift-request-collection", "multi-store"],
    helpLinks: [
      { href: "/help/update-confirmed-shift", label: "確定済みのシフトを調整する" },
      { href: "/help/reissue-confirmed-shift-link", label: "確定シフトの閲覧リンクを再発行する" },
    ],
    articleSlugs: ["shiftori-line-workflow", "sudden-absence-coverage"],
  },
  "multi-store": {
    name: "複数店舗・スタッフ管理",
    icon: LuStore,
    summary: "掛け持ちも1名で管理できます",
    metaTitle: "複数店舗のシフト管理｜掛け持ちスタッフと複数の管理者に対応",
    metaDescription: `ひとつの組織で最大${paidLimits.maxShops}店舗、管理者${paidLimits.maxActiveManagers}名までシフトを管理できます。店舗を掛け持ちするスタッフも1名として登録でき、スタッフ本人が店舗専用のQRコードから参加を申請することもできます。`,
    heading: ["複数店舗とスタッフを", "まとめて管理する"],
    lead: "店舗ごとにシフトを作れます。スタッフと管理者は一か所で管理できます。",
    illustration: {
      src: multiStoreMapImage,
      alt: "3つの店舗と管理者の机が点線でつながる、地図のようなイラスト",
    },
    pains: [
      "店舗ごとに名簿が分かれている",
      "掛け持ちスタッフを何度も登録している",
      "シフトづくりを店長一人で抱えている",
    ],
    capabilities: [
      {
        title: "複数の店舗をひとつの組織で",
        body: "全店舗の募集も一覧で見られます",
        screen: {
          src: multiStoreRecruitmentsImage,
          alt: "本店、駅前店、中央店の募集が、店舗名とともに1つの一覧に並ぶ画面",
          frame: "phone",
        },
      },
      {
        title: "掛け持ちスタッフも1名で登録",
        body: "登録済みの情報から追加できます",
      },
      {
        title: "シフト担当者を複数人に",
        body: "管理者を招待して分担できます",
      },
      {
        title: "スタッフはQRコードから参加申請",
        body: "担当者の承認で登録が完了します",
        screen: {
          src: staffInvitationQrImage,
          alt: "スタッフに読み取ってもらう、店舗のQRコードを表示した画面",
          frame: "phone",
        },
      },
      {
        title: "まとめて手入力でも追加できる",
        body: "1回に50名まで追加できます",
      },
      {
        title: "シフトを出さない人は対象外に",
        body: "オーナーなどを通知から外せます",
      },
    ],
    steps: [
      { title: "店舗を追加する", body: "組織の設定から追加します" },
      { title: "スタッフを追加する", body: "QRコードや手入力で追加します" },
      { title: "管理者を招待する", body: "一緒にシフトを作る人を招待します" },
    ],
    faqs: [
      {
        q: "何店舗まで管理できますか？",
        a: `無料トライアル・Standard・Proは${paidLimits.maxShops}店舗までです。Freeプランは${freeLimits.maxShops}店舗までです。`,
      },
      {
        q: "店舗を掛け持ちするスタッフは、何人として数えますか？",
        a: "同じ組織の中なら、何店舗でも1名です。",
      },
      {
        q: "管理者は何人まで登録できますか？",
        a: `無料トライアル・Standard・Proは${paidLimits.maxActiveManagers}名までです。Freeプランは${freeLimits.maxActiveManagers}名までです。`,
      },
    ],
    related: ["shift-request-collection", "shift-sharing", "submission-reminder"],
    helpLinks: [
      { href: "/help/basics/organization-structure", label: "組織・店舗・スタッフの関係" },
      { href: "/help/review-staff-registration-request", label: "スタッフの参加申請を承認・却下する" },
      { href: "/help/manage-manager-invitations", label: "管理者を招待・再送・取り消す" },
    ],
    articleSlugs: ["shift-handover-rules", "free-shift-tool-selection"],
  },
};

export const PRODUCT_FEATURES: readonly ProductFeature[] = PRODUCT_FEATURE_SLUGS.map((slug) => ({
  slug,
  href: getProductFeatureHref(slug),
  ...PRODUCT_FEATURE_DEFINITIONS[slug],
}));

export function getProductFeature(slug: string): ProductFeature | undefined {
  return PRODUCT_FEATURES.find((feature) => feature.slug === slug);
}

/** 画面に表示する質問と回答から作る。JSON-LDだけの質問は持たない。 */
export function createProductFeatureFaqPageJsonLd(feature: ProductFeature): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: feature.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };
}
