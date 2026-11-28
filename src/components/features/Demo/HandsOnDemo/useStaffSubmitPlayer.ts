// スタッフの提出画面を、カーソルで自動で操作する。本物の画面の部品へ、利用者の操作と同じイベントを送る。
// 部品が見つからない手順は飛ばし、最後まで進める。
import { useEffect, useState } from "react";

export type PlayerCursor = {
  x: number;
  y: number;
  /** この位置まで動かす時間（ミリ秒）。 */
  moveMs: number;
  /** 押すたびに増やし、押したところから輪を広げる。 */
  clickKey: number;
  pressed: boolean;
};

type Plan = {
  /** 押して出勤にする日。最初の日だけ、開始と終了の時刻を選択欄で選び直す。 */
  dates: string[];
  startTime: string;
  endTime: string;
  /** メモを書く日と、書く内容。 */
  noteDate: string;
  note: string;
};

type Options = {
  plan: Plan;
  /** 手順を1つ終えるたびに、終えた割合（0から1）を知らせる。 */
  onProgress: (progress: number) => void;
  /** 提出まで終えたあと、完了の画面を見せてから呼ぶ。 */
  onFinished: () => void;
};

const POLL_MS = 50;
const FIND_TIMEOUT_MS = 2000;
const TYPE_INTERVAL_MS = 110;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const findElement = async <T extends Element>(find: () => T | null | undefined): Promise<T | null> => {
  const deadline = Date.now() + FIND_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const element = find();
    if (element) return element;
    await wait(POLL_MS);
  }
  return null;
};

const dayCard = (date: string) => `[data-day-card="${date}"]`;
const OPEN_SELECT_CONTENT = '[data-scope="select"][data-part="content"][data-state="open"]';

const setInputValue = (input: HTMLInputElement, value: string) => {
  // Reactの入力欄は値の変更をinputイベントで受け取るため、元のsetterで値を入れてから知らせる。
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

export const useStaffSubmitPlayer = ({ plan, onProgress, onFinished }: Options) => {
  const [cursor, setCursor] = useState<PlayerCursor | null>(null);

  // 1回だけ再生する。planと知らせる先は、読み込んだ画面ごとに決まっている。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 再生は画面を開いたときの1回だけにする
  useEffect(() => {
    let cancelled = false;
    let current: PlayerCursor = {
      x: window.innerWidth * 0.82,
      y: window.innerHeight * 0.9,
      moveMs: 0,
      clickKey: 0,
      pressed: false,
    };
    const update = (next: Partial<PlayerCursor>) => {
      current = { ...current, ...next };
      setCursor(current);
    };

    const moveTo = async (element: Element, ms = 500, fx = 0.5, fy = 0.5) => {
      const rect = element.getBoundingClientRect();
      update({ x: rect.left + rect.width * fx, y: rect.top + rect.height * fy, moveMs: ms });
      await wait(ms + 150);
    };
    const press = async (element: HTMLElement) => {
      update({ clickKey: current.clickKey + 1, pressed: true });
      await wait(90);
      update({ pressed: false });
      element.click();
    };
    const pickOption = async (trigger: HTMLElement, value: string) => {
      await moveTo(trigger, 450);
      await press(trigger);
      const content = await findElement(() => document.querySelector<HTMLElement>(OPEN_SELECT_CONTENT));
      if (!content || cancelled) return;
      await wait(350);
      const item = content.querySelector<HTMLElement>(`[data-part="item"][data-value="${value}"]`);
      if (!item) return;
      // 一覧の中央に、選ぶ時刻が来るまでゆっくり送る。
      await moveTo(content, 300, 0.5, 0.55);
      const contentRect = content.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      content.scrollBy({
        top: itemRect.top - contentRect.top - (contentRect.height - itemRect.height) / 2,
        behavior: "smooth",
      });
      await wait(800);
      if (cancelled) return;
      await moveTo(item, 350, 0.3, 0.5);
      item.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }));
      await wait(300);
      await press(item);
      await wait(450);
    };

    // 進み具合は、出勤にする日ごと、最初の日の開始と終了、メモ、提出の手順を数えて決める。
    const total = plan.dates.length + 4;
    let done = 0;
    const advance = () => {
      done += 1;
      onProgress(Math.min(1, done / total));
    };

    const play = async () => {
      update({});
      await wait(600);
      for (const [index, date] of plan.dates.entries()) {
        if (cancelled) return;
        const toggle = await findElement(() =>
          document.querySelector<HTMLElement>(`${dayCard(date)} button[aria-label$="を出勤希望にする"]`),
        );
        if (!toggle) continue;
        await moveTo(toggle, 550, 0.18, 0.5);
        await press(toggle);
        await wait(550);
        advance();
        if (index > 0) continue;
        // 最初の日は、選択欄で開始と終了を選び直す。次の日からは、同じ時刻が入る。
        const triggers = () =>
          document.querySelectorAll<HTMLElement>(`${dayCard(date)} [data-scope="select"][data-part="trigger"]`);
        const start = await findElement(() => triggers()[0]);
        if (start) await pickOption(start, plan.startTime);
        advance();
        const end = await findElement(() => triggers()[1]);
        if (end) await pickOption(end, plan.endTime);
        advance();
      }

      if (cancelled) return;
      const noteButton = document.querySelector<HTMLElement>(
        `${dayCard(plan.noteDate)} button[aria-label$="の連絡事項を書く"]`,
      );
      if (noteButton) {
        await moveTo(noteButton, 500);
        await press(noteButton);
        const input = await findElement(() => document.querySelector<HTMLInputElement>('[role="dialog"] input'));
        if (input && !cancelled) {
          await wait(400);
          await moveTo(input, 400, 0.3, 0.5);
          await press(input);
          input.focus();
          for (let length = 1; length <= plan.note.length; length += 1) {
            if (cancelled) return;
            setInputValue(input, plan.note.slice(0, length));
            await wait(TYPE_INTERVAL_MS);
          }
          await wait(400);
          const ok = document.querySelector<HTMLElement>('[role="dialog"] button[type="submit"]');
          if (ok) {
            await moveTo(ok, 450);
            await press(ok);
          }
          await findElement(() => (document.querySelector('[role="dialog"]') ? null : document.body));
          await wait(700);
        }
      }
      advance();

      if (cancelled) return;
      const submit = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
        button.textContent?.includes("希望シフトを提出"),
      );
      if (submit) {
        submit.scrollIntoView({ behavior: "smooth", block: "center" });
        await wait(1000);
        await moveTo(submit, 500);
        await press(submit);
      }
      // 見つからずに飛ばした手順があっても、提出の手順で最後まで伸ばす。
      onProgress(1);
      await wait(300);
      setCursor(null);
      await wait(1800);
      if (!cancelled) onFinished();
    };

    void play();
    return () => {
      cancelled = true;
    };
  }, []);

  return cursor;
};
