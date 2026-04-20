import { useEffect, useState } from "react";
import { type EventData, Tour, type TourStep } from "@/src/components/ui/Tour";

const PC_BREAKPOINT = 1024;
const TARGET_WAIT_MS = 2000;

const SELECTOR = {
  viewTabs: '[data-tour="view-tabs"]',
  viewTabDaily: '[data-tour="view-tab-daily"]',
  viewTabOverview: '[data-tour="view-tab-overview"]',
  dateRail: '[data-tour="date-rail"]',
  shiftGrid: '[data-tour="shift-grid"]',
  shiftRow: '[data-tour="shift-row"]',
  confirmButton: '[data-tour="confirm-button"]',
} as const;

/**
 * セレクタに一致する要素が DOM に現れるまで待つ。
 * MutationObserver で監視し、タイムアウトしたら諦めて resolve する
 * （ツアーは `targetWaitTimeout` 側でフォールバックする）。
 */
const waitForElement = (selector: string, timeout = TARGET_WAIT_MS) =>
  new Promise<void>((resolve) => {
    if (document.querySelector(selector)) {
      resolve();
      return;
    }
    const finish = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) finish();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(finish, timeout);
  });

/**
 * ビュー切替タブをクリックし、次のステップの対象 DOM が現れるまで待つ。
 */
const switchView = async (tabSelector: string, nextTargetSelector: string) => {
  document.querySelector<HTMLElement>(tabSelector)?.click();
  await waitForElement(nextTargetSelector);
};

const toDaily = (nextTargetSelector: string) => switchView(SELECTOR.viewTabDaily, nextTargetSelector);
const toOverview = (nextTargetSelector: string) => switchView(SELECTOR.viewTabOverview, nextTargetSelector);

const STEPS: TourStep[] = [
  {
    target: "body",
    placement: "center",
    title: "シフトリのシフトボード",
    content: "30秒でざっと見方をご案内します ごゆっくりどうぞ",
  },
  {
    target: SELECTOR.viewTabs,
    placement: "bottom-start",
    title: "日別 と 一覧",
    content: "1日ずつ細かく見るか 週全体をざっと見るか ここで切り替えます",
    before: () => toDaily(SELECTOR.viewTabs),
  },
  {
    target: SELECTOR.viewTabOverview,
    placement: "bottom-start",
    title: "一覧ビュー",
    content: "週全体を俯瞰したいときはこっち",
    before: () => toOverview(SELECTOR.viewTabOverview),
  },
  {
    target: SELECTOR.dateRail,
    placement: "right-start",
    title: "日付を切り替え",
    content: "日別ビューではここで日付を選べます",
    before: () => toDaily(SELECTOR.dateRail),
  },
  {
    target: SELECTOR.shiftRow,
    placement: "bottom",
    spotlightPadding: 4,
    title: "シフトの編集",
    content: "バーをドラッグで時間変更 バーをタップするとメニューから削除できます",
    before: () => toDaily(SELECTOR.shiftRow),
  },
  {
    target: SELECTOR.confirmButton,
    placement: "bottom-end",
    title: "確定してスタッフに通知",
    content: "シフトが決まったらここ 押すとスタッフ全員にメールで通知されます",
  },
  {
    target: "body",
    placement: "center",
    title: "では 触ってみましょう",
    content: "最初の1日だけ すこし整えるところからご案内します",
  },
];

export const DemoIntroTour = () => {
  const [run, setRun] = useState(false);

  // PC レイアウト（>=1024px）でのみ起動。リサイズで SP 幅になったら中断する
  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncWithViewport = () => {
      setRun(window.innerWidth >= PC_BREAKPOINT);
    };

    syncWithViewport();
    window.addEventListener("resize", syncWithViewport);
    return () => window.removeEventListener("resize", syncWithViewport);
  }, []);

  const handleEvent = (data: EventData) => {
    if (data.type === "tour:end") {
      setRun(false);
    }
  };

  return <Tour run={run} steps={STEPS} onEvent={handleEvent} />;
};
