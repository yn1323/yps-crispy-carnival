import type { IconType } from "react-icons";
import { LuBellRing, LuCalendarRange, LuMessageCircle, LuSendHorizontal, LuStore } from "react-icons/lu";
import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";
import heroPcImage from "@/src/assets/hero-pc.webp";
import confirmedShiftNoticeImage from "@/src/assets/screens/confirmed-shift-notice.webp";
import shiftBoardSpImage from "@/src/assets/screens/shift-board-sp.webp";
import staffRequestNoticeImage from "@/src/assets/screens/staff-request-notice.webp";
import submitTimeImage from "@/src/assets/screens/submit-time.webp";
import buildScheduleImage from "./images/build-schedule.png";
import collectRequestsImage from "./images/collect-requests.png";
import deadlineReminderImage from "./images/deadline-reminder.png";
import multiStoreMapImage from "./images/multi-store-map.png";
import shareConfirmedImage from "./images/share-confirmed.png";
import { getProductFeatureHref, PRODUCT_FEATURE_SLUGS, type ProductFeatureSlug } from "./productFeatureRoutes";

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
  heading: string;
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
    summary: "提出リンクがLINEやメールで届き、スタッフはアプリなしで希望シフトを提出できます。",
    // 画面の用語は「希望シフト」だが、検索では「シフト希望」の語順が使われるためtitleだけ合わせる。
    metaTitle: "LINEでシフト希望を回収｜スタッフはアプリ不要で提出できる",
    metaDescription:
      "シフト募集を作ると、スタッフのLINEやメールに提出リンクが届きます。スタッフはアプリのインストールや会員登録なしで、時間指定・日付選択・パターン選択から希望シフトを提出できます。",
    heading: "LINEで希望シフトを集める",
    lead: "シフト募集を作ると、対象のスタッフ全員に提出リンクが届きます。スタッフはアプリを入れずにスマホから提出でき、集まった希望シフトはそのままシフト表に並びます。",
    illustration: {
      src: collectRequestsImage,
      alt: "4人のスタッフがスマートフォンから提出した希望が、1枚のシフト表に集まるイラスト",
    },
    pains: [
      "LINEグループに届いた希望シフトが、ほかの会話に流れてしまう",
      "紙やメッセージの書き方が人によって違い、読み取りに時間がかかる",
      "集まった希望シフトを、Excelやシフト表に書き写している",
    ],
    capabilities: [
      {
        title: "提出リンクがLINE・メールで届く",
        body: "シフト期間と提出期限を決めて募集を作ると、スタッフへの案内が自動で届きます。LINEを連携しているスタッフにはLINEで、それ以外のスタッフにはメールで届きます。",
        screen: {
          src: staffRequestNoticeImage,
          alt: "スタッフのスマートフォンに届いた、希望シフトの提出を依頼するお知らせ",
          frame: "phone",
        },
      },
      {
        title: "スタッフはアプリも会員登録も不要",
        body: "届いたリンクを開けば、スマホのブラウザから希望シフトを提出できます。アプリのインストールや、ログイン用のパスワードはいりません。",
      },
      {
        title: "提出方法を3つから選べる",
        body: "時間指定・日付選択・パターン選択から、お店の働き方に合う方法を店舗ごとに選べます。パターン選択では、早番・遅番などの勤務パターンを4つまで登録できます。",
        screen: {
          src: submitTimeImage,
          alt: "時間指定で、日付ごとに働ける開始時間と終了時間を入力する提出画面",
          frame: "phone",
        },
      },
      {
        title: "前回と同じ希望をボタン1つで入力",
        body: "以前に提出したシフトがあるスタッフは、直近の週と同じ曜日・時間の希望を、ボタン1つで今回の期間へ入力できます。",
      },
      {
        title: "提出期限までは出し直せる",
        body: "予定が変わったスタッフは、提出期限まで希望シフトを変更できます。変更した希望シフトは、シフト表でも確認できます。",
      },
    ],
    steps: [
      { title: "シフト募集を作る", body: "シフト期間と提出期限を入力して、募集を作成します。" },
      { title: "スタッフが提出する", body: "スタッフは届いたリンクを開き、スマホから希望シフトを提出します。" },
      { title: "提出状況を確認する", body: "提出した人と未提出の人を、ダッシュボードとシフト表で確認します。" },
    ],
    faqs: [
      {
        q: "スタッフにアプリを入れてもらう必要はありますか？",
        a: "いいえ、必要ありません。スタッフはLINEやメールに届いたリンクを開き、スマートフォンのブラウザから希望シフトを提出します。シフトリのアカウント登録もいりません。",
      },
      {
        q: "お店でLINE公式アカウントを用意する必要はありますか？",
        a: "いいえ、必要ありません。お知らせは、シフトリのLINE公式アカウントから届きます。スタッフは、シフトリから届く案内に沿ってLINEを連携します。",
      },
      {
        q: "LINEを使っていないスタッフはどうなりますか？",
        a: "登録したメールアドレスに、同じ提出リンクが届きます。LINEで送るかメールで送るかは、スタッフごとの連携状況に合わせてシフトリが切り替えます。",
      },
      {
        q: "提出方法はあとから変えられますか？",
        a: "はい、店舗設定から変更できます。変更後の提出方法は、次に作るシフト募集から使われます。作成済みの募集は、作成したときの提出方法のままです。",
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
    summary: "未提出の人が一覧で分かり、提出期限の前日には催促のお知らせが自動で届きます。",
    metaTitle: "シフト未提出の催促を自動化｜提出状況を一覧で確認",
    metaDescription:
      "希望シフトを提出していないスタッフを一覧で確認できます。提出期限の前日17時には、未提出のスタッフへ催促のお知らせがLINEやメールで自動で届きます。",
    heading: "シフト未提出の催促を自動にする",
    lead: "誰が希望シフトを出していないかを、ダッシュボードとシフト表で確認できます。提出期限の前日には、未提出のスタッフにだけ催促のお知らせが自動で届きます。",
    illustration: {
      src: deadlineReminderImage,
      alt: "提出期限の日に印を付けたカレンダーから、スタッフのスマートフォンへお知らせが届くイラスト",
    },
    pains: [
      "誰が提出していないかを、名簿と見比べて数えている",
      "提出期限が近づくたびに、一人ずつ「シフトまだ？」と連絡している",
      "催促したつもりで、連絡し忘れた人がいた",
    ],
    capabilities: [
      {
        title: "提出人数と未提出の人が分かる",
        body: "ダッシュボードでは、シフト募集ごとの提出人数を確認できます。シフト表の下には、まだ提出していないスタッフが表示されます。",
      },
      {
        title: "提出期限の前日17時に自動で催促",
        body: "提出期限の前日17時に、未提出のスタッフにだけ催促のお知らせがLINEやメールで届きます。提出済みのスタッフには届きません。",
      },
      {
        title: "催促を送ったかを画面で確かめられる",
        body: "シフト表には、催促のお知らせを送った日時が表示されます。送る予定の催促がある場合は、その予定も表示されます。",
      },
      {
        title: "提出期限を過ぎても受け付けられる",
        body: "シフトを確定する前で、シフト期間が始まる前なら、まだ提出していないスタッフは提出期限を過ぎても希望シフトを出せます。",
      },
      {
        title: "確定していないシフトを知らせる",
        body: "提出期限を過ぎても確定していないシフトは、管理者の「要対応」に表示されます。店舗にスタッフとしても所属している管理者には、提出期限の翌日17時にお知らせも届きます。",
      },
    ],
    steps: [
      { title: "提出期限を決める", body: "シフト募集を作るときに、提出期限を設定します。" },
      { title: "提出状況を見る", body: "提出人数と未提出の人を、ダッシュボードとシフト表で確認します。" },
      { title: "前日に催促が届く", body: "提出期限の前日17時に、未提出のスタッフへお知らせが届きます。" },
    ],
    faqs: [
      {
        q: "催促のお知らせは、提出済みのスタッフにも届きますか？",
        a: "いいえ、届きません。催促のお知らせは、送る時点で希望シフトを提出していないスタッフにだけ届きます。",
      },
      {
        q: "催促を送る日時は変えられますか？",
        a: "いいえ、変えられません。催促のお知らせは、提出期限の前日17時に自動で送ります。シフト募集の提出期限を変更した場合は、変更後の提出期限の前日17時に送ります。",
      },
      {
        q: "特定のスタッフにだけ、もう一度お知らせできますか？",
        a: "はい、できます。スタッフの店舗別の設定画面から、シフト募集のお知らせを個別に送り直せます。",
      },
    ],
    related: ["shift-request-collection", "shift-schedule", "shift-sharing"],
    helpLinks: [{ href: "/help/resolve-action-inbox", label: "「要対応」ページの使い方" }],
    articleSlugs: ["line-shift-submission", "shift-build-faster"],
  },
  "shift-schedule": {
    name: "シフト表の作成",
    icon: LuCalendarRange,
    summary: "提出された希望シフトがシフト表に並び、PCでもスマホでも見比べながら組めます。",
    metaTitle: "シフト表作成ツール｜希望シフトを見ながらPC・スマホで作れる",
    metaDescription:
      "提出された希望シフトがそのままシフト表に並び、見比べながら割り当てられます。PCでもスマホでも作成でき、休業日への割り当てなどは保存前にチェックします。PDF・Excelにも出力できます。",
    heading: "希望シフトを見ながらシフト表を作る",
    lead: "スタッフが提出した希望シフトは、転記しなくてもシフト表に並びます。希望と見比べながら勤務を割り当て、下書きを保存しながら仕上げられます。",
    illustration: {
      src: buildScheduleImage,
      alt: "店長がノートPCとスマートフォンで同じシフト表を見ながら作業するイラスト",
    },
    pains: [
      "希望シフトを紙とExcelで見比べながら組んでいる",
      "外出先でシフトを直したくても、PCがないと作業できない",
      "休みの希望を見落として、勤務を入れてしまったことがある",
    ],
    capabilities: [
      {
        title: "希望シフトが最初から並んでいる",
        body: "シフト表を開くと、提出された希望シフトが割り当ての下書きとして並んでいます。書き写す作業はなく、足りない日や多すぎる日を調整するところから始められます。",
        screen: {
          src: heroPcImage,
          alt: "PCのシフト表で、スタッフごとの勤務時間が横棒で並んでいる画面",
          frame: "desktop",
        },
      },
      {
        title: "PCでもスマホでも作れる",
        body: "PCでは表全体を見ながら、スマホでは1日ずつ割り当てられます。どちらで編集しても、同じシフト表に保存されます。",
        screen: {
          src: shiftBoardSpImage,
          alt: "スマートフォンで1日分のスタッフの勤務を割り当てる画面",
          frame: "phone",
        },
      },
      {
        title: "希望と違う割り当てを知らせる",
        body: "休み希望の日や、希望していない時間に勤務を入れると、確認事項として表示します。未提出のスタッフに割り当てた場合も知らせます。",
      },
      {
        title: "保存できない内容は保存前にチェック",
        body: "休業日への割り当てなど保存できない内容があると、一覧で表示し、該当する日付とスタッフを強調します。",
      },
      {
        title: "下書き保存で少しずつ仕上げる",
        body: "確定する前の割り当ては、下書きとして保存できます。確定するまで、スタッフにお知らせは届きません。",
      },
      {
        title: "PDF・Excelに出力できる",
        body: "作成中のシフト表を、PDFやExcelで保存できます。店内への掲示や、給与計算の資料づくりに使えます。",
      },
    ],
    steps: [
      { title: "シフト表を開く", body: "ダッシュボードのシフト募集から、シフト表を開きます。" },
      { title: "希望を見ながら割り当てる", body: "希望シフトを確認しながら勤務を調整し、下書きとして保存します。" },
      { title: "シフトを確定する", body: "内容を確認して確定すると、スタッフに確定シフトのお知らせが届きます。" },
    ],
    faqs: [
      {
        q: "スマホだけでシフト表を作れますか？",
        a: "はい、スマホからもシフト表の作成、下書き保存、確定ができます。時間指定で1日に複数の勤務時間を割り当てる場合など、一部の編集はPCの画面で行うよう案内します。",
      },
      {
        q: "シフトを自動で組んでくれますか？",
        a: "いいえ、人数や条件からシフトを自動で組む機能はありません。提出された希望シフトを下書きとして並べるので、そこから担当者が調整して仕上げます。",
      },
      {
        q: "Excelで直したシフト表を取り込めますか？",
        a: "いいえ、取り込めません。Excelへの出力は、掲示や保存のために使えます。シフトの変更は、シフトリのシフト表で行ってください。",
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
    summary: "確定したシフトがLINEやメールで届き、変更したときは変わった人にだけ届きます。",
    metaTitle: "確定シフトをLINEで共有｜変更したスタッフにだけ再通知",
    metaDescription:
      "シフトを確定すると、スタッフのLINEやメールに確定シフトのお知らせが届きます。確定後に変更したときは、勤務が変わったスタッフにだけお知らせが届きます。",
    heading: "確定シフトをLINEやメールで届ける",
    lead: "シフトを確定すると、スタッフ一人ひとりに自分の勤務日と時間が届きます。シフト表を撮影してグループに送る作業はいりません。",
    illustration: {
      src: shareConfirmedImage,
      alt: "教室、電車、自宅にいる3人のスタッフが、それぞれスマートフォンで確定シフトのお知らせを見るイラスト",
    },
    pains: [
      "完成したシフト表を撮影して、LINEグループに送っている",
      "シフトを変えたとき、誰に伝え直せばよいか迷う",
      "伝えたつもりでも、スタッフに届いていないことがある",
    ],
    capabilities: [
      {
        title: "確定するとお知らせが届く",
        body: "シフトを確定すると、スタッフのLINEやメールに、その人の勤務日と時間が届きます。",
        screen: {
          src: confirmedShiftNoticeImage,
          alt: "スタッフのスマートフォンに届いた、確定シフトの勤務日と時間のお知らせ",
          frame: "phone",
        },
      },
      {
        title: "変更したときは変わった人にだけ届く",
        body: "確定後にシフトを直して、もう一度確定すると、勤務が変わったスタッフにだけ最新のシフトが届きます。",
      },
      {
        title: "リンクから確定シフトを見返せる",
        body: "お知らせのリンクから、確定シフトを開けます。リンクの有効期限が切れた場合は、スタッフ自身で新しいリンクを受け取れます。",
      },
      {
        title: "送れなかったお知らせに気づける",
        body: "メールアドレスの誤りなどで送れなかったお知らせは、ダッシュボードの「要対応」に表示されます。そこから、もう一度送れます。",
      },
      {
        title: "スタッフごとに通知履歴を確認できる",
        body: "いつ、どの方法でお知らせを送ったかを、スタッフごとに確認できます。",
      },
    ],
    steps: [
      { title: "シフトを確定する", body: "シフト表の内容を確認して、確定します。" },
      {
        title: "スタッフに届く",
        body: "LINEを連携しているスタッフにはLINEで、それ以外のスタッフにはメールで届きます。",
      },
      { title: "変更したら再度確定する", body: "シフトを直してもう一度確定すると、変わった人にだけ届きます。" },
    ],
    faqs: [
      {
        q: "確定シフトのお知らせには、何が書かれていますか？",
        a: "受け取ったスタッフ自身の勤務日と時間が書かれています。リンクを開くと、確定シフトを画面で確認できます。",
      },
      {
        q: "シフトを変更したら、全員にもう一度届きますか？",
        a: "いいえ、勤務の内容が変わったスタッフにだけ届きます。変更のないスタッフには届きません。",
      },
      {
        q: "紙に印刷して掲示したい場合はどうすればよいですか？",
        a: "シフト表からPDFやExcelに出力して、印刷できます。",
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
    summary: "複数の店舗と管理者をひとつの組織で管理でき、スタッフはQRコードから参加できます。",
    metaTitle: "複数店舗のシフト管理｜掛け持ちスタッフと複数の管理者に対応",
    metaDescription: `ひとつの組織で最大${paidLimits.maxShops}店舗、管理者${paidLimits.maxActiveManagers}名までシフトを管理できます。店舗を掛け持ちするスタッフも1名として登録でき、スタッフ本人が店舗専用のQRコードから参加を申請することもできます。`,
    heading: "複数店舗とスタッフをまとめて管理する",
    lead: "店舗ごとにシフトを募集しながら、スタッフと管理者の情報はひとつの組織で管理できます。スタッフの登録は、本人にQRコードから申請してもらう方法も選べます。",
    illustration: {
      src: multiStoreMapImage,
      alt: "3つの店舗と管理者の机が点線でつながる、地図のようなイラスト",
    },
    pains: [
      "店舗ごとに別のグループや名簿で、スタッフを管理している",
      "掛け持ちのスタッフを、店舗ごとに登録し直している",
      "シフトづくりを、店長が一人で抱えている",
    ],
    capabilities: [
      {
        title: "複数の店舗をひとつの組織で",
        body: "店舗を切り替えて、それぞれのシフト募集とシフト表を管理できます。シフトの一覧では、すべての店舗の募集をまとめて確認できます。",
      },
      {
        title: "掛け持ちスタッフは1名として登録",
        body: "同じ組織の別の店舗で働くスタッフは、登録済みの情報から追加できます。利用人数も1名として数えます。",
      },
      {
        title: "シフト担当者を複数人に",
        body: "管理者を招待して、シフトの募集から確定までの作業を分担できます。",
      },
      {
        title: "スタッフはQRコードから参加申請",
        body: "店舗専用のQRコードやURLから、スタッフ本人が名前とメールアドレスを入力して申請します。シフト担当者が承認すると登録が完了します。",
      },
      {
        title: "まとめて手入力でも追加できる",
        body: "名前とメールアドレスを入力して、1回に50名まで追加できます。",
      },
      {
        title: "シフトを出さない人は対象外に",
        body: "オーナーなどシフトを出さない人は、店舗ごとにシフト対象外にできます。シフトのお知らせと提出率の計算から外れます。",
      },
    ],
    steps: [
      { title: "店舗を追加する", body: "組織の設定から、管理する店舗を追加します。" },
      {
        title: "スタッフを追加する",
        body: "QRコード、手入力、組織に登録済みのスタッフから選んで追加します。",
      },
      { title: "管理者を招待する", body: "一緒にシフトを作る人を、管理者として招待します。" },
    ],
    faqs: [
      {
        q: "何店舗まで管理できますか？",
        a: `無料トライアル、Standard、Proでは${paidLimits.maxShops}店舗まで、Freeプランでは${freeLimits.maxShops}店舗まで管理できます。`,
      },
      {
        q: "店舗を掛け持ちするスタッフは、何人として数えますか？",
        a: "1名として数えます。同じ組織の中であれば、所属する店舗の数にかかわらず1名です。",
      },
      {
        q: "管理者は何人まで登録できますか？",
        a: `無料トライアル、Standard、Proでは${paidLimits.maxActiveManagers}名まで、Freeプランでは${freeLimits.maxActiveManagers}名まで登録できます。`,
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
