// 動画に映す文言をまとめる。アプリの文言を変えるときは、ここと照らし合わせる。
// 用語は .agents/skills/ui-architect/references/ui-writing.md の正本に合わせる。

export const SHOP_NAME = "カフェ マメノキ";
export const GROUP_NAME = "マメノキ スタッフ";
export const DOMAIN = "shiftori.app";
export const TODAY = { time: "10:00", date: "10月6日（火）" };

export const PERIOD = "11月1日（日）〜11月30日（月）";
export const DEADLINE = "10月20日（火）";
export const DEADLINE_WITH_TIME = "10月20日（火）23:59";
export const REMINDER_AT = "10月19日（月）17:00";

export const TITLE = { subtitle: "紹介動画" } as const;

export const TELOP = {
  collect: "希望を集める",
  remind: "催促する",
  send: "確定シフトを送る",
  intro: "その連絡はシフトリにおまかせ！",
  recruit: "シフトを募集する",
  delivered: "スタッフのスマホに届く",
  noApp: "専用アプリなしで提出",
  collected: "希望シフトが集まる",
  reminder: "未提出の人は自動でお知らせ",
  build: "希望を見ながらシフトを組む",
  adjust: "シフトリの画面でシフト調整",
  confirm: "確定シフトがスタッフに届く",
  easier: "毎月の作業をかんたんに",
  methods: "お店に合う集め方を選べる",
  // 景品表示法の強調表示にあたるため、無料の条件（期間）を同じ文に含める
  trialFirst: "2か月無料で",
  trialLast: "お試しできます",
} as const;

export const STEP_LABELS = ["募集する", "組む", "確定する"] as const;
export const METHOD_LABELS = ["時間指定", "日付選択", "パターン選択"] as const;

export const CHAT = {
  members: "10人",
  messages: ["11日と13日入れます", "来週は火曜以外なら大丈夫です", "15日は午前だけでお願いします"],
  managerMessage: "まだの人は今日中にお願いします",
} as const;

export const RECRUITMENT_FORM = {
  title: "シフト募集",
  period: "シフト期間",
  deadline: "提出期限",
  notice: "スタッフへの通知",
  // アプリの表示は「メール・LINEで通知します」。動画にはLINEの名前を出さない
  noticeValue: "自動で通知します",
  submit: "募集をつくる",
} as const;

export const SUBMIT_REQUEST = {
  title: "シフト提出のお願い",
  greeting: "高橋さきさん",
  body: "11月の希望シフトを提出してください。",
  deadline: `提出期限：${DEADLINE_WITH_TIME}`,
  button: "希望シフトを提出する",
} as const;

export const SUBMIT_PAGE = {
  title: "11月の希望シフト",
  instruction: "出勤できる日をタップしてください",
  button: "この内容で提出する",
} as const;

export const DASHBOARD = {
  title: "11月のシフト募集",
  deadline: `提出期限 ${DEADLINE}`,
  progress: (count: number) => `提出 ${count}/10人`,
  notSubmitted: "未提出",
  autoNotice: "自動のお知らせ",
} as const;

// アプリの通知タイトル「提出期限が近づいています」。幅の狭いカードに置くため文節で改行する
export const REMINDER_TITLE = "提出期限が\n近づいています";

export const SHIFT_BOARD = {
  title: `${PERIOD}のシフト`,
  confirm: "シフトを確定して通知",
  days: ["1（日）", "2（月）", "3（火）", "4（水）", "5（木）", "6（金）", "7（土）"],
} as const;

export const CONFIRMED = {
  title: "シフト確定",
  greeting: "高橋さきさん",
  body: "11月のシフトが確定しました。",
  yours: "あなたのシフト",
  shifts: ["11月2日（月）17:00〜22:00", "11月3日（火）17:00〜22:00", "11月6日（金）17:00〜22:00"],
  button: "全員のシフトを確認する",
} as const;

export const METHOD_SCREENS = {
  time: {
    instruction: "出勤できる日をタップして、時間を選んでください",
    rows: [
      { day: "11月2日（月）", value: "17:00〜22:00" },
      { day: "11月3日（火）", value: "休み" },
      { day: "11月4日（水）", value: "10:00〜15:00" },
      { day: "11月5日（木）", value: "休み" },
      { day: "11月6日（金）", value: "17:00〜22:00" },
    ],
    alternate: "10:00〜15:00",
  },
  date: { instruction: SUBMIT_PAGE.instruction },
  pattern: {
    instruction: "出勤できる日と勤務パターンを選んでください",
    day: "11月2日（月）",
    options: [
      { name: "早番", time: "9:00〜15:00" },
      { name: "遅番", time: "15:00〜22:00" },
    ],
  },
} as const;

export type PersonId = "manager" | "saki" | "haruto" | "mio" | "yui";

export type Staff = { id: string; name: string; person?: PersonId };

export const STAFF: Staff[] = [
  { id: "saki", name: "高橋 さき", person: "saki" },
  { id: "haruto", name: "山本 はると", person: "haruto" },
  { id: "mio", name: "小林 みお", person: "mio" },
  { id: "yui", name: "中村 ゆい", person: "yui" },
  { id: "sota", name: "伊藤 そうた" },
  { id: "riko", name: "渡辺 りこ" },
  { id: "kenji", name: "加藤 けんじ" },
  { id: "natsumi", name: "吉田 なつみ" },
  { id: "koki", name: "山田 こうき" },
  { id: "aya", name: "佐々木 あや" },
];

// フォントの分割ファイルを必要な分だけ読み込むため、画面に出す文字をすべて集める
const collect = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [];
  if (Array.isArray(value)) return value.flatMap(collect);
  if (value && typeof value === "object") return Object.values(value).flatMap(collect);
  return [];
};

export const ALL_TEXT = [
  collect([
    SHOP_NAME,
    GROUP_NAME,
    DOMAIN,
    TODAY,
    PERIOD,
    REMINDER_AT,
    TITLE,
    TELOP,
    STEP_LABELS,
    METHOD_LABELS,
    CHAT,
    RECRUITMENT_FORM,
    SUBMIT_REQUEST,
    SUBMIT_PAGE,
    DASHBOARD,
    REMINDER_TITLE,
    SHIFT_BOARD,
    CONFIRMED,
    METHOD_SCREENS,
    STAFF.map((staff) => staff.name),
  ]),
  "提出 0123456789/人さん日月火水木金土〜：",
]
  .flat()
  .join("");
