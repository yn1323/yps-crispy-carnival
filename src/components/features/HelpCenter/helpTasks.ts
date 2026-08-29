export const HELP_AUDIENCES = ["all", "manager", "staff"] as const;

export type HelpAudience = (typeof HELP_AUDIENCES)[number];

export const HELP_TASK_IDS = [
  "getting-started",
  "shop-settings",
  "staff-management",
  "shift-recruitment",
  "shift-submission",
  "shift-building",
  "notifications",
  "organization-billing",
  "troubleshooting",
] as const;

export type HelpTaskId = (typeof HELP_TASK_IDS)[number];

export type HelpTaskHref = `/help/tasks/${HelpTaskId}`;

export type HelpTask = {
  id: HelpTaskId;
  title: string;
  description: string;
  audience: HelpAudience;
  order: number;
};

export const HELP_TASKS = [
  {
    id: "getting-started",
    title: "利用開始したい",
    description: "アカウント作成方法を確認します",
    audience: "manager",
    order: 10,
  },
  {
    id: "shop-settings",
    title: "店舗を設定したい",
    description: "店舗名、希望シフトの集め方、定休日などを設定します",
    audience: "manager",
    order: 20,
  },
  {
    id: "staff-management",
    title: "スタッフを追加・管理したい",
    description: "スタッフの追加方法や、登録申請への対応を確認します",
    audience: "manager",
    order: 30,
  },
  {
    id: "shift-recruitment",
    title: "シフトを募集・回収したい",
    description: "募集を作成し、希望シフトの提出状況を確認します",
    audience: "manager",
    order: 40,
  },
  {
    id: "shift-submission",
    title: "希望シフトを提出・変更したい",
    description: "届いたリンクから希望シフトを提出し、必要に応じて提出し直します",
    audience: "staff",
    order: 50,
  },
  {
    id: "shift-building",
    title: "シフトを調整・確定したい",
    description: "希望を見ながら割り当てを調整し、シフトを確定します",
    audience: "manager",
    order: 60,
  },
  {
    id: "notifications",
    title: "LINE・メール通知について",
    description: "通知手段、送信状況、届かない場合の確認方法を案内します",
    audience: "all",
    order: 70,
  },
  {
    id: "organization-billing",
    title: "組織・管理者・料金について",
    description: "組織の利用状況、管理者、プランと支払いを確認します",
    audience: "manager",
    order: 80,
  },
  {
    id: "troubleshooting",
    title: "その他困りごと",
    description: "ログインや操作を続けられない場合の対処を確認します",
    audience: "all",
    order: 90,
  },
] as const satisfies readonly HelpTask[];

export function getHelpTask(id: string): HelpTask | undefined {
  return HELP_TASKS.find((task) => task.id === id);
}

export function getHelpTaskHref(id: HelpTaskId): HelpTaskHref {
  return `/help/tasks/${id}`;
}
