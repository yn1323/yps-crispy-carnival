import { featuredFaqEntries } from "./landingFaqContent";

export {
  createLandingFaqPageJsonLd,
  featuredFaqEntries as landingFaqEntries,
  landingFaqs,
} from "./landingFaqContent";

export const FAQ_CATEGORIES = [
  { id: "before-start", label: "はじめる前に", order: 10 },
  { id: "setup-staff", label: "初期設定とスタッフ", order: 20 },
  { id: "recruitment-submission", label: "シフト募集と希望提出", order: 30 },
  { id: "shift-building", label: "シフト作成と確定", order: 40 },
  { id: "notifications", label: "LINEとメール通知", order: 50 },
  { id: "organization-billing", label: "グループ・権限・料金", order: 60 },
  { id: "trouble", label: "困ったとき", order: 70 },
] as const;

export type FaqCategoryId = (typeof FAQ_CATEGORIES)[number]["id"];
export type FaqAudience = "all" | "manager" | "staff";
export type FaqVisual = "notification-channel" | "organization" | "draft-resubmission";

export type FaqEntry = {
  id: string;
  category: FaqCategoryId;
  question: string;
  answer: string[];
  points?: string[];
  keywords: string[];
  audience: FaqAudience;
  featured?: boolean;
  howTo?: {
    href: `/howto#${string}`;
    label: string;
  };
  visual?: FaqVisual;
};

export const faqEntries: FaqEntry[] = [
  ...featuredFaqEntries,
  {
    id: "shift-workflow",
    category: "setup-staff",
    question: "最初に何を設定すればよいですか？",
    answer: [
      "店舗名と希望シフトの集め方を設定し、スタッフを追加してから、シフト募集を作成します。",
      "募集後は、スタッフの提出状況を確認しながらシフト表を調整し、確定してスタッフへ知らせます。",
    ],
    points: [
      "店舗を設定する",
      "スタッフを追加する",
      "募集を作る",
      "希望を回収する",
      "シフトを調整する",
      "確定して知らせる",
    ],
    keywords: ["初期設定", "何から始める", "使い方", "全体の流れ", "初めて"],
    audience: "manager",
    howTo: { href: "/howto#shift-workflow", label: "図で全体の流れを見る" },
  },
  {
    id: "submission-patterns",
    category: "setup-staff",
    question: "「時間指定」「日ごと」「勤務区分」は何が違いますか？",
    answer: [
      "働ける時間を集めるなら「時間指定」、出勤できる日だけを集めるなら「日ごと」、早番や遅番から選んでもらうなら「勤務区分」です。",
    ],
    keywords: ["提出方法", "希望の集め方", "時間指定", "日ごと", "勤務区分", "早番", "遅番"],
    audience: "manager",
    howTo: { href: "/howto#submission-pattern-differences", label: "3つの違いを詳しく見る" },
  },
  {
    id: "shop-setting-changes",
    category: "setup-staff",
    question: "希望の集め方、勤務時間、勤務区分を変えると、募集中のシフトにも反映されますか？",
    answer: [
      "希望シフトの集め方、勤務時間、勤務区分の変更は、次に作成する募集から反映されます。",
      "作成済みの募集は、募集を作った時点の設定を使い続けます。募集中の提出方法を途中で切り替えることはできません。",
    ],
    keywords: ["店舗設定変更", "募集中", "提出方法変更", "勤務時間変更", "勤務区分変更"],
    audience: "manager",
    howTo: { href: "/howto#submission-pattern-changes", label: "反映される範囲を見る" },
  },
  {
    id: "add-staff",
    category: "setup-staff",
    question: "スタッフを追加する方法は？",
    answer: [
      "ダッシュボードの「スタッフ一覧」で「スタッフを招待」を押すと、本人の登録申請、管理者による手入力、同じグループの別店舗からの追加を選べます。",
      "本人からの申請は、管理者が承認するとスタッフとして登録されます。",
    ],
    keywords: ["スタッフ追加", "スタッフ招待", "従業員追加", "QRコード", "登録リンク", "手入力", "別店舗"],
    audience: "manager",
    howTo: { href: "/howto#add-staff", label: "スタッフ追加の手順を見る" },
  },
  {
    id: "registration-approval",
    category: "setup-staff",
    question: "スタッフ登録申請を承認、却下するとどうなりますか？",
    answer: [
      "承認するとスタッフとして登録し、LINE連携の案内を送ります。提出締切前かつシフト開始前の募集がある場合は、希望シフトの提出リンクも送ります。",
      "却下した場合、申請者へ却下通知は送りません。利用人数の上限に達している場合は承認できないため、現在のプランと利用人数を確認してください。",
    ],
    keywords: ["登録申請", "承認", "却下", "参加申請", "申請待ち", "人数上限"],
    audience: "manager",
    howTo: { href: "/howto#add-staff", label: "登録申請を含む追加方法を見る" },
  },
  {
    id: "registration-status",
    category: "setup-staff",
    question: "スタッフ登録を申請したあと、何をすればよいですか？",
    answer: [
      "申請した店舗のシフト作成担当者が内容を確認し、承認するとスタッフ登録が完了します。申請者が管理画面へログインする必要はありません。",
      "承認待ちか確認できない場合は、申請時に入力した名前と店舗名をシフト作成担当者へ伝えてください。却下された場合の自動通知はありません。",
    ],
    keywords: ["登録申請後", "申請できた", "承認待ち", "登録済み", "参加申請", "却下通知"],
    audience: "staff",
  },
  {
    id: "add-staff-during-recruitment",
    category: "setup-staff",
    question: "シフト募集中にスタッフを追加するとどうなりますか？",
    answer: [
      "シフト開始前で、まだ提出を受け付けている募集がある場合は、追加したスタッフへ提出リンクを送ります。登録申請を承認した場合も同じです。",
      "その募集へ参加させない場合は、追加後に対象店舗のユーザー詳細で「シフト対象」をOFFにしてください。",
    ],
    keywords: ["募集中に追加", "途中参加", "後から追加", "提出リンク", "新しいスタッフ"],
    audience: "manager",
    howTo: { href: "/howto#add-staff-during-recruitment", label: "追加後の扱いを見る" },
  },
  {
    id: "staff-membership-differences",
    category: "setup-staff",
    question: "「シフト対象外」「店舗から外す」「グループから削除」は何が違いますか？",
    answer: ["スタッフの在籍状況に合わせて、影響範囲が最も小さい操作を選びます。"],
    points: [
      "シフト対象外：店舗所属と保存済みの割り当ては残し、シフト表、提出・閲覧リンク、シフト関連通知から外します。対象へ戻すと、保存済みの割り当てが再び表示されます。",
      "店舗から外す：その店舗の所属、提出・閲覧リンク、店舗ごとのLINE連携を終了します。ほかの店舗と管理者権限は残ります。",
      "グループから削除：グループ内の全店舗所属と管理者権限を終了します。",
      "下書きを含む将来のシフト割り当てがあるユーザーは、店舗やグループから削除できません。過去の業務履歴は残ります。",
    ],
    keywords: ["シフト対象外", "店舗から削除", "グループから削除", "退職", "異動", "スタッフ削除"],
    audience: "manager",
    howTo: { href: "/howto#exclude-staff-from-shifts", label: "シフト対象外の扱いを見る" },
  },
  {
    id: "create-recruitment",
    category: "recruitment-submission",
    question: "シフト募集を作成すると何が起きますか？",
    answer: [
      "シフト対象のスタッフへ希望シフトの提出リンクを送ります。LINE連携済みのスタッフには通常LINEで送り、LINEを利用できない場合やLINE送信の上限に達した場合はメールへ切り替えます。",
      "締切前日の17:00をまだ過ぎていない場合は、未提出スタッフへの自動催促も予約します。",
    ],
    keywords: ["募集作成", "作成後", "スタッフへ通知", "提出依頼", "新しい募集"],
    audience: "manager",
    howTo: { href: "/howto#create-recruitment-effects", label: "募集作成後の動きを見る" },
  },
  {
    id: "change-recruitment",
    category: "recruitment-submission",
    question: "作成後にシフト期間や提出締切を変更できますか？",
    answer: [
      "変更できません。期間や締切を間違えた場合は、現在の募集を削除して、新しい募集を作り直します。",
      "募集を削除すると、送信済みの提出リンクと閲覧リンクは使えなくなります。提出済みの内容がある場合は、削除前に確認してください。",
    ],
    keywords: ["期間変更", "締切変更", "締め切り変更", "募集を間違えた", "作り直し", "提出期限"],
    audience: "manager",
    howTo: { href: "/howto#fix-recruitment-mistake", label: "募集を間違えたときの対応を見る" },
  },
  {
    id: "submission-status",
    category: "recruitment-submission",
    question: "誰が希望シフトを提出したか確認できますか？",
    answer: [
      "ダッシュボードの「シフト一覧」に「提出 3/5人」のように表示されます。募集を開くと、スタッフごとの希望と未提出の状態を確認できます。",
      "人数の分母は、その募集でシフト対象になっているスタッフ数です。",
    ],
    keywords: ["提出状況", "誰が提出", "未提出", "回答数", "提出人数"],
    audience: "manager",
    howTo: { href: "/howto#check-submission-status", label: "提出状況の確認場所を見る" },
  },
  {
    id: "edit-submission",
    category: "recruitment-submission",
    question: "提出した希望シフトを変更できますか？",
    answer: [
      "提出締切前であれば、最初に届いた提出リンクを開いて変更できます。現在の提出内容を直してもう一度提出すると、以前の希望は新しい内容に置き換わります。",
      "締切後は提出済みの内容を確認できますが、変更はできません。",
    ],
    keywords: ["再提出", "提出し直す", "希望変更", "間違えて提出", "修正", "締め切り"],
    audience: "staff",
    howTo: { href: "/howto#edit-submitted-request", label: "提出し直す手順を見る" },
  },
  {
    id: "after-deadline",
    category: "recruitment-submission",
    question: "提出締切を過ぎるとどうなりますか？",
    answer: [
      "提出締切は、設定した日の23:59です。提出済みのスタッフは締切後も内容を確認できますが、変更はできません。",
      "未提出のスタッフは、確認画面を経て初回の提出だけ行えます。ただし、募集が確定済み、削除済み、またはシフト開始後の場合は提出できません。",
    ],
    keywords: ["締切後", "締め切り後", "提出期限切れ", "遅れて提出", "23:59", "変更できない"],
    audience: "all",
    howTo: { href: "/howto#after-submission-deadline", label: "締切後の扱いを見る" },
  },
  {
    id: "reuse-previous-pattern",
    category: "recruitment-submission",
    question: "前回と同じ希望シフトを使えますか？",
    answer: [
      "過去に勤務希望を提出している場合は、「前回と同じシフトを適用」から、直近のシフトがある週の曜日と時間を今回の期間へ反映できます。",
      "反映後も自動では提出されません。日付ごとの内容を確認し、「提出する」を押してください。提出履歴がない場合や、前回がすべて休みだった場合は表示されません。",
    ],
    keywords: ["前回と同じ", "前回シフト", "コピー", "繰り返し", "テンプレート", "履歴"],
    audience: "staff",
  },
  {
    id: "build-before-all-submissions",
    category: "shift-building",
    question: "全員の希望が集まる前でもシフト作成を始められますか？",
    answer: [
      "始められます。未提出のスタッフはシフト表で区別して表示され、管理者が勤務を割り当てることもできます。",
      "提出前のスタッフへ勤務を入れると確認事項が表示されます。あとから希望が届いたら、割り当てと希望を見比べて調整してください。",
    ],
    keywords: ["全員未提出", "集まる前", "先に作る", "未提出スタッフ", "割り当て"],
    audience: "manager",
    howTo: { href: "/howto#build-shift-from-requests", label: "希望からシフトを作る手順を見る" },
  },
  {
    id: "input-work-time",
    category: "shift-building",
    question: "PCの「時間指定」で勤務時間を入力、変更するには？",
    answer: [
      "希望シフトの集め方が「時間指定」の場合、PCの「日ごと」表示でスタッフの行を開始時刻から終了時刻まで横にドラッグすると勤務を追加できます。",
      "入力済みの勤務時間は、バーの左右の端をドラッグして変更できます。未提出のスタッフにも同じ方法で勤務を追加できます。",
    ],
    keywords: ["勤務時間入力", "ドラッグ", "時間変更", "シフト追加", "未提出"],
    audience: "manager",
    howTo: { href: "/howto#input-work-time", label: "勤務時間の入力方法を見る" },
  },
  {
    id: "warnings-and-errors",
    category: "shift-building",
    question: "オレンジの確認事項と赤いエラーは何が違いますか？",
    answer: [
      "オレンジの確認事項は、未提出スタッフへの割り当てや希望と異なる勤務など、確定前に確認してほしい内容です。内容を確認したうえで確定できます。",
      "赤いエラーは、店舗のお休みへの割り当てなど、保存できない内容です。すべて直すまで確定できません。",
    ],
    keywords: ["確認事項", "警告", "エラー", "オレンジ", "赤", "確定できない"],
    audience: "manager",
    howTo: { href: "/howto#assignment-warnings-and-errors", label: "確認事項とエラーの例を見る" },
  },
  {
    id: "save-draft",
    category: "shift-building",
    question: "作成途中のシフトを保存できますか？",
    answer: [
      "「下書き保存」を押すと、スタッフへ通知せずに作成途中の内容を保存できます。",
      "保存していない変更がある状態で戻ると、「保存して戻る」か「保存せず戻る」を選べます。「保存せず戻る」を選ぶと、最後の保存後に加えた変更は失われます。",
    ],
    keywords: ["下書き保存", "作成途中", "あとで続ける", "保存せず戻る", "通知しない"],
    audience: "manager",
    howTo: { href: "/howto#save-shift-draft", label: "下書き保存の扱いを見る" },
  },
  {
    id: "draft-after-resubmission",
    category: "shift-building",
    question: "下書き保存後にスタッフが提出し直すと、作成中のシフトはどうなりますか？",
    answer: [
      "下書き保存時に未提出だったスタッフが初めて提出すると、その希望が初期の割り当てとして反映されます。",
      "すでに提出済みだったスタッフが希望を変更した場合は、希望の表示だけを更新し、管理者が調整して保存した割り当ては自動で上書きしません。新しい希望と現在の割り当てを見比べて、必要な箇所だけ直してください。",
    ],
    keywords: ["下書き後", "再提出", "割り当て", "希望更新", "自動反映", "上書き"],
    audience: "manager",
    visual: "draft-resubmission",
  },
  {
    id: "confirm-shift",
    category: "shift-building",
    question: "シフトを確定すると何が起きますか？",
    answer: [
      "現在の割り当てを確定し、シフト対象のスタッフへ確定シフトのお知らせを送ります。スタッフは届いた閲覧リンクから、対象期間の店舗の確定シフト表を確認できます。",
      "確定した募集はダッシュボードで「確定済み」と表示されます。シフト期間が終了するまでは、確定後も修正できます。",
    ],
    keywords: ["シフト確定", "確定通知", "確定後", "スタッフに送る", "閲覧リンク"],
    audience: "manager",
    howTo: { href: "/howto#confirm-shift-effects", label: "確定後の動きを見る" },
  },
  {
    id: "staff-confirmed-shift-view",
    category: "shift-building",
    question: "確定シフトの閲覧リンクでは、どこまで確認できますか？",
    answer: [
      "閲覧リンクを開くと、対象期間における店舗の確定シフト表を確認できます。シフト対象スタッフの名前と勤務の割り当てが表示されます。",
      "閲覧リンクは対象スタッフ本人の確認用です。ほかの人へ転送したり、SNSへ掲載したりしないでください。",
    ],
    keywords: ["確定シフト閲覧", "自分だけ", "ほかのスタッフ", "シフト表", "名前", "閲覧範囲"],
    audience: "staff",
    howTo: { href: "/howto#confirm-shift-effects", label: "シフト確定後の流れを見る" },
  },
  {
    id: "edit-confirmed-shift",
    category: "shift-building",
    question: "確定したシフトを修正できますか？",
    answer: [
      "シフト期間が終了する前なら修正できます。確定済みのシフトを開いて勤務を変更し、「もう一度通知」から保存と再通知を行います。",
      "編集しただけではスタッフへ通知されません。確認画面で通知対象を確かめ、「変更があるスタッフに通知」を押してください。",
    ],
    keywords: ["確定後に修正", "再確定", "シフトを直す", "もう一度通知", "編集"],
    audience: "manager",
    howTo: { href: "/howto#edit-confirmed-shift", label: "確定後の修正手順を見る" },
  },
  {
    id: "notify-confirmed-changes",
    category: "shift-building",
    question: "確定後の変更は誰に通知されますか？",
    answer: [
      "原則として、前回の確定通知から割り当てが変わったスタッフだけが対象です。割り当てが変わっていないスタッフには送りません。",
      "通知対象の記録がない古い確定済みシフトは、機能導入後の初回再通知に限り全員が対象になる場合があります。最終的な対象は「もう一度通知」の確認画面で確認してください。",
    ],
    keywords: ["再通知", "変更した人だけ", "誰に通知", "全員通知", "差分"],
    audience: "manager",
    howTo: { href: "/howto#notify-confirmed-shift-changes", label: "再通知の対象を見る" },
  },
  {
    id: "past-shift",
    category: "shift-building",
    question: "過去のシフトを変更できますか？",
    answer: [
      "シフト期間が終了したシフトは、保存、確定、再通知ができません。内容の確認は、ダッシュボードの「過去のシフトを見る」から行えます。",
      "これからのシフトを直したい場合は、「現在のシフト」または「確定済み」から対象を開いてください。",
    ],
    keywords: ["過去シフト", "変更できない", "保存できない", "終了したシフト", "閲覧"],
    audience: "manager",
    howTo: { href: "/howto#edit-past-shift", label: "過去シフトの扱いを見る" },
  },
  {
    id: "delete-recruitment",
    category: "shift-building",
    question: "シフト募集を削除するとどうなりますか？",
    answer: [
      "削除した募集はダッシュボードから消え、元に戻せません。スタッフへ送った提出リンクと閲覧リンクも使えなくなります。",
      "確定済みの募集も削除できます。対象期間と提出済みの内容を確認してから削除してください。",
    ],
    keywords: ["募集削除", "シフトを消す", "削除後", "元に戻す", "リンク無効"],
    audience: "manager",
    howTo: { href: "/howto#delete-recruitment", label: "募集削除の影響を見る" },
  },
  {
    id: "notification-channel",
    category: "notifications",
    question: "スタッフへのシフト通知はLINEとメールのどちらへ送られますか？",
    answer: [
      "LINE連携済みのスタッフには通常LINEで送ります。LINEを連携していない場合、友だち追加が解除されている場合、またはLINE送信の上限に達した場合はメールへ切り替えます。",
      "再送対象となる送信失敗は、管理者の「送れなかった通知」に表示されます。表示されない場合は、スタッフの通知先と募集の状態を確認してください。",
      "通知ごとに送信先を選ぶ操作はありません。対象スタッフのLINE連携状態は、ユーザー詳細で所属店舗を開くと確認できます。",
    ],
    keywords: ["LINEかメール", "通知先", "送り分け", "メールで届く", "LINEで届く"],
    audience: "all",
    howTo: { href: "/howto#notification-channel", label: "通知先の確認方法を見る" },
    visual: "notification-channel",
  },
  {
    id: "connect-line",
    category: "notifications",
    question: "スタッフにLINEを連携してもらうには？",
    answer: [
      "スタッフを追加または登録申請を承認すると、LINE連携の案内を送ります。スタッフは案内を開き、シフトリ公式LINEを友だち追加して連携を完了します。",
      "案内を送り直す場合は、対象ユーザーの詳細で所属店舗を開き、LINE連携の案内を送ってください。連携状態は店舗ごとに管理されます。",
    ],
    keywords: ["LINE連携", "友だち追加", "連携案内", "LINEを登録", "送り直す"],
    audience: "all",
  },
  {
    id: "line-not-delivered",
    category: "notifications",
    question: "LINE通知が届かないときは、何を確認すればよいですか？",
    answer: [
      "対象ユーザーの詳細で所属店舗を開き、LINE連携の状態を確認してください。「LINE通知を利用できません」または「LINE未連携」の場合はメールへ送ります。",
      "ダッシュボードに「送れなかった通知があります」と表示されている場合は、対象を開いて再送できます。メールも届かない場合は、登録メールアドレスを確認してください。",
    ],
    keywords: ["LINEが届かない", "通知が来ない", "友だち解除", "送信失敗", "メールも来ない"],
    audience: "manager",
    howTo: { href: "/howto#line-notification-not-delivered", label: "LINEが届かないときの確認手順を見る" },
  },
  {
    id: "failed-notifications",
    category: "notifications",
    question: "送れなかった通知を確認して再送するには？",
    answer: [
      "ダッシュボードの「送れなかった通知があります」を開くと、対象スタッフ、通知の種類、募集期間、LINEとメールのどちらで失敗したかを確認できます。",
      "1件ずつ「再送」するか、「すべて再送」でまとめて再送できます。再送が不要な通知は「対応不要」を選ぶと、送らずに一覧から外せます。",
      "再送は通知の再送信を受け付ける操作です。もう一度失敗した場合は、同じ通知が一覧へ戻ることがあります。",
    ],
    keywords: ["送れなかった通知", "再送", "通知失敗", "不達", "不達通知", "すべて再送", "対応不要", "また表示"],
    audience: "manager",
    howTo: { href: "/howto#resend-failed-notifications", label: "再送の手順を見る" },
  },
  {
    id: "individual-notification-resend",
    category: "notifications",
    question: "特定のスタッフだけに提出依頼や確定シフトを送り直せますか？",
    answer: [
      "できます。対象ユーザーの詳細で所属店舗を開き、「通知」から現在募集中の提出依頼、または現在の確定シフトを送り直せます。",
      "画面に対象の募集や確定シフトが複数並んでいる場合は、表示中の全件をまとめて送ります。1件だけを選ぶ操作ではありません。",
      "シフト対象外、通知先がない、閲覧のみの店舗など、送れない状態では操作できない理由が表示されます。短時間に続けて送った場合は、少し時間をおいてください。",
    ],
    keywords: ["個別再送", "一人だけ", "提出依頼を再送", "確定シフトを再送", "通知を送り直す"],
    audience: "manager",
  },
  {
    id: "notification-history",
    category: "notifications",
    question: "スタッフへ通知を送ったか、届いたか確認できますか？",
    answer: [
      "対象ユーザーの詳細で所属店舗を開くと、通知履歴から日時、メールまたはLINE、通知のタイトル、現在の状況を確認できます。",
      "メールの「配信済み」はメールサーバーへ届いた状態で、開封済みを意味しません。LINEは端末への到達を確認できないため、「送信済み」までを表示します。機能追加前の古い通知は履歴に表示されません。",
    ],
    points: [
      "送信待ち：処理中です。少し待ってから確認してください。",
      "配信が遅れています：メールの配送に時間がかかっています。時間をおいて確認してください。",
      "送れませんでした：再送対象の通知は、ダッシュボードの「送れなかった通知」に表示されます。表示されない場合は、通知先と募集の状態を確認してください。",
      "キャンセル：対象外になったなどの理由で、送信を取りやめた通知です。",
    ],
    keywords: ["通知履歴", "通知ログ", "送信済み", "配信済み", "不達", "開封", "既読", "届いたか", "送ったか"],
    audience: "manager",
  },
  {
    id: "confirmation-reminder",
    category: "notifications",
    question: "希望の提出締切後に、管理者への催促はありますか？",
    answer: [
      "提出締切の翌日17:00に、まだシフトが確定していない募集がある場合は、その店舗の管理者へ確定を促す案内を送ります。",
      "スタッフ向けの未提出催促とは別の通知です。すでに確定済み、または削除済みの募集は対象になりません。",
    ],
    keywords: ["管理者催促", "確定リマインド", "締切翌日", "締め切り翌日", "17時", "未確定"],
    audience: "manager",
  },
  {
    id: "organization-and-shop",
    category: "organization-billing",
    question: "グループと店舗は何が違いますか？",
    answer: [
      "グループは、ユーザー、管理者権限、料金プランをまとめる単位です。店舗は、希望シフトの募集とシフト作成を行う単位です。",
      "同じグループの有効な管理者は、グループ内のすべての店舗とプランを管理できます。店舗だけに限定した管理者権限はありません。",
    ],
    keywords: ["グループ", "店舗", "違い", "管理範囲", "管理者権限", "複数店舗"],
    audience: "manager",
    visual: "organization",
  },
  {
    id: "switch-shop",
    category: "organization-billing",
    question: "別の店舗やグループへ切り替えるには？",
    answer: [
      "ダッシュボード上部の店舗名を押し、操作したい店舗を選びます。複数グループに所属している場合は、グループ名ごとに店舗が並びます。",
      "店舗が1つだけの場合、店舗名は切り替えボタンになりません。複数タブを開いている場合は、操作前に各タブ上部の店舗名を確認してください。",
    ],
    keywords: ["店舗切替", "グループ切替", "複数店舗", "別店舗", "選択中店舗"],
    audience: "manager",
  },
  {
    id: "manager-invite-unavailable",
    category: "organization-billing",
    question: "管理者招待を開けないときは？",
    answer: [
      "現在、管理者の招待と交代は利用できません。すでに受け取った招待URLも受け入れできません。",
      "機能の再開後に、現在の管理者へ案内を確認してください。",
    ],
    keywords: ["管理者招待", "招待を開けない", "承認できない", "管理者交代", "利用できない", "期限切れ", "取消済み"],
    audience: "manager",
  },
  {
    id: "usage-count",
    category: "organization-billing",
    question: "「利用人数」には誰が数えられますか？",
    answer: [
      "グループ内でスタッフまたは有効な管理者になっている人を、人物単位で数えます。同じ人が複数店舗に所属していても、管理者とスタッフを兼ねていても1名です。",
      "シフト対象外のスタッフや、アーカイブ済み店舗だけに所属するスタッフも利用人数に含まれます。店舗から外しただけではグループのユーザーとして残るため、利用人数を減らす場合はグループからの削除が必要です。",
    ],
    keywords: ["利用人数", "人数上限", "複数店舗", "管理者兼スタッフ", "シフト対象外", "課金人数"],
    audience: "manager",
  },
  {
    id: "delete-shop-or-organization",
    category: "organization-billing",
    question: "店舗やグループを削除すると、何が消えますか？",
    answer: [
      "対象範囲の利用と権限を停止し、LINE連携、提出・閲覧リンク、未送信通知を使えない状態にします。削除した店舗やグループは通常の一覧に表示されなくなり、元に戻せません。",
      "過去のシフト、同意、氏名、メールアドレスなど、業務履歴を識別する情報は保持されます。アカウントや別グループは削除されず、この操作は個人情報の完全消去ではありません。",
      "最後の店舗は削除できません。グループ削除は、ほかに有効な管理者がいない場合など、画面に表示される条件を満たしたときだけ行えます。",
      "業務履歴として保持される情報の完全消去については、お問い合わせください。",
    ],
    keywords: ["店舗削除", "店舗閉鎖", "閉店", "グループ削除", "データ削除", "完全消去", "元に戻す"],
    audience: "manager",
  },
  {
    id: "submission-link-unavailable",
    category: "trouble",
    question: "希望シフトの提出リンクを開けない、提出できないときは？",
    answer: [
      "画面に表示された案内を確認してください。「このリンクでは提出できません」と表示された場合は、新しい案内が必要かどうかをシフト作成担当者へ確認します。",
      "募集が削除済み、確定済み、シフト開始後など、提出を受け付けていない募集には提出できません。提出リンクを持つ人は、発行先のスタッフとして希望を確認、提出できるため、本人以外へ共有・転送しないでください。",
      "同じ募集について複数の案内が届いている場合は、最新のメッセージにあるリンクを開いてください。",
    ],
    keywords: ["提出リンク開けない", "提出できない", "リンク無効", "期限切れ", "転送", "別端末", "機種変更", "URL"],
    audience: "staff",
    howTo: { href: "/howto#submission-link-unavailable", label: "提出リンクが使えないときの対応を見る" },
  },
  {
    id: "confirmed-link-unavailable",
    category: "trouble",
    question: "確定シフトの閲覧リンクを開けないときは？",
    answer: [
      "閲覧リンクは最初に開いたときに確認用の情報をブラウザへ保存します。同じブラウザでは、その保存済み情報で再び表示できる場合があります。共用の端末やブラウザでは開かないでください。",
      "画面に「新しい閲覧リンクを申し込む」が表示されている場合は、登録したメールアドレスを入力してください。入力内容が登録情報と一致し、再発行できる状態なら新しい案内を送ります。",
      "LINE連携済みの場合は通常LINEへ送り、LINEを利用できない場合やLINE送信の上限に達した場合はメールへ送ります。入力したメールアドレスだけへ送る操作ではありません。",
      "登録状況を第三者に知られないよう、結果画面だけではメールアドレスの登録有無を判定できません。新しい案内が届かない場合は、シフト作成担当者へ連絡してください。",
    ],
    keywords: [
      "確定シフト見られない",
      "閲覧リンク",
      "リンク再発行",
      "新しいリンク",
      "メール届かない",
      "別端末",
      "機種変更",
      "URL",
    ],
    audience: "staff",
    howTo: { href: "/howto#confirmed-shift-link-unavailable", label: "閲覧リンクが使えないときの対応を見る" },
  },
  {
    id: "login-trouble",
    category: "trouble",
    question: "管理画面にログインできない、パスワードを忘れたときは？",
    answer: [
      "ログイン画面の「パスワードを忘れた場合」から、登録メールアドレスへ確認コードを送り、パスワードを再設定できます。Googleで登録した場合は「Googleで続ける」を選んでください。",
      "別の端末やブラウザからログインしたときは、本人確認のためメールで届くコードの入力を求める場合があります。LINEアプリ内でGoogleログインが開けない場合は、案内に従って外部ブラウザで開いてください。",
    ],
    keywords: ["ログインできない", "パスワード忘れた", "確認コード", "別端末", "Googleログイン", "LINEブラウザ"],
    audience: "manager",
  },
  {
    id: "legal-consent",
    category: "trouble",
    question: "希望シフトの提出時に利用規約への同意が表示されるのはなぜですか？",
    answer: [
      "スタッフ向けの利用規約とプライバシーポリシーへまだ同意していない場合や、再同意が必要な更新があった場合に表示されます。",
      "文書を確認して同意すると、そのまま希望シフトを提出できます。同意しない場合は提出できませんが、シフト作成担当者へ連絡して状況を相談できます。",
      "規約同意の案内リンクが使えなくても、通知は止まりません。必要な同意は、次回の希望シフトを初めて提出するときにも行えます。",
    ],
    keywords: ["利用規約", "プライバシーポリシー", "同意", "再同意", "リンク期限切れ", "通知", "提出できない"],
    audience: "staff",
  },
  {
    id: "contact-support",
    category: "trouble",
    question: "FAQで解決しない場合や、機能の要望を送りたい場合は？",
    answer: [
      "操作や不具合について確認が必要な場合は、公開の「お問い合わせ」から状況を送ってください。画面名、行った操作、表示された文言があると確認しやすくなります。",
      "ログイン中に機能の要望を送る場合は、管理画面のユーザーメニューにある要望受付を利用できます。パスワード、提出リンク、閲覧リンクは送らないでください。",
    ],
    keywords: ["問い合わせ", "サポート", "要望", "機能追加", "解決しない", "不具合"],
    audience: "all",
  },
];

export function normalizeFaqSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja").replace(/\s+/g, " ").trim();
}

export function searchFaqEntries(entries: FaqEntry[], query: string): FaqEntry[] {
  const terms = normalizeFaqSearchText(query).split(" ").filter(Boolean);
  if (terms.length === 0) return entries;

  return entries.filter((entry) => {
    const category = FAQ_CATEGORIES.find((candidate) => candidate.id === entry.category);
    const searchText = normalizeFaqSearchText(
      [entry.question, ...entry.answer, ...(entry.points ?? []), ...entry.keywords, category?.label ?? ""].join(" "),
    );

    return terms.every((term) => searchText.includes(term));
  });
}

export function faqAnswerText(entry: FaqEntry): string {
  return [...entry.answer, ...(entry.points ?? [])].join("\n");
}

export function createFaqPageJsonLd(entries: FaqEntry[] = faqEntries): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faqAnswerText(entry),
      },
    })),
  };
}
