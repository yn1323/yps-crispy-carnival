import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "../..";
import { fullscreenParameters, mobileGlobals, shiftFormDecorators } from "../../stories/shared";
import {
  buildStaffing,
  customDay,
  readStaffingCalls,
  StaffingHarness,
  templateDay,
  timeRequirements,
  unsetDay,
} from "../../stories/staffingHarness";
import {
  hall,
  register,
  timeDetailArgs,
  timeDetailDate,
  timeDetailTemplates,
  timeEventTemplate,
  timeWeekdayTemplate,
} from "../detailStoryFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Time/SP/Daily Detail",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 複数ポジション、休憩、熟練度、仮の勤務と、日付の見出しの下の充足を1画面で確かめる。
 * 充足は閉じた状態で、充足率と進捗バーの1行だけを出す。
 */
export const Detail: Story = {
  args: timeDetailArgs,
  globals: mobileGlobals,
};

/** ポジションが1つの店舗では、勤務のバーをそのポジションの色にして、休憩を足す。ポジションの名前は出さない。必要人数のない日なので、充足は出ない。 */
export const DetailSinglePosition: Story = {
  name: "Detail Single Position",
  args: {
    ...timeDetailArgs,
    positions: [hall],
    initialShifts: timeDetailArgs.initialShifts.map((shift) => ({
      ...shift,
      positions: shift.positions.map((position) => ({
        ...position,
        positionId: hall.id,
        positionName: hall.name,
        color: hall.color,
      })),
    })),
    staffing: buildStaffing({ days: timeDetailArgs.dates.map(unsetDay) }),
  },
  globals: mobileGlobals,
};

/** スタッフ向けの確定シフト表示でも、ポジションと休憩は出す。入れるものの選択と充足は出さない。 */
export const DetailReadOnly: Story = {
  name: "Detail Read Only",
  args: { ...timeDetailArgs, isReadOnly: true, displayMode: "confirmed", onDetailModeChange: undefined },
  globals: mobileGlobals,
};

const openEditSheet = async (canvasElement: HTMLElement, staffName: string) => {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: `${staffName}の勤務を編集` }));
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", {
    name: new RegExp(`^${staffName}のシフト`),
  });
  return within(dialog);
};

const selectTime = async (sheet: ReturnType<typeof within>, label: string, time: string) => {
  await userEvent.click(sheet.getByRole("combobox", { name: label }));
  await userEvent.click(await sheet.findByRole("option", { name: time }));
};

/** 勤務が2件ある日を開き、2件目の時刻とポジションを変えると、カードの表示が変わる。 */
export const EditSecondRangeInteractive: Story = {
  name: "Edit Second Range Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sheet = await openEditSheet(canvasElement, "Aさん");

    await selectTime(sheet, "勤務時間2の終了時間", "17:00");
    await userEvent.click(
      within(sheet.getByRole("radiogroup", { name: "勤務時間2のポジション" })).getByRole("radio", { name: "レジ" }),
    );
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));

    const card = await canvas.findByRole("button", { name: "Aさんの勤務を編集" });
    await waitFor(() => expect(card).toHaveTextContent("10:00–17:00"));
    await expect(card).toHaveTextContent("レジ14:00〜17:00");
    await expect(card).not.toHaveTextContent("キッチン");
  },
};

/** 「勤務時間を追加」で行が増え、直前の行の終了が開始に入る。 */
export const AddRangeInteractive: Story = {
  name: "Add Range Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sheet = await openEditSheet(canvasElement, "Bさん");
    await expect(sheet.queryByRole("group", { name: "勤務時間2" })).not.toBeInTheDocument();

    // Bさんの勤務は11:00〜19:00。足した行は19:00から始まる。
    await userEvent.click(sheet.getByRole("button", { name: "勤務時間を追加" }));
    const addedRow = within(await sheet.findByRole("group", { name: "勤務時間2" }));
    await expect(addedRow.getByRole("combobox", { name: "勤務時間2の開始時間" })).toHaveTextContent("19:00");

    await selectTime(sheet, "勤務時間2の終了時間", "21:00");
    await userEvent.click(addedRow.getByRole("radio", { name: "ホール" }));
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));

    const card = await canvas.findByRole("button", { name: "Bさんの勤務を編集" });
    await waitFor(() => expect(card).toHaveTextContent("11:00–21:00"));
    await expect(card).toHaveTextContent("ホール19:00〜21:00");
  },
};

/** 重なる時刻は保存できず、文言で伝える。直すと保存できる。 */
export const OverlapErrorInteractive: Story = {
  name: "Overlap Error Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sheet = await openEditSheet(canvasElement, "Aさん");

    // 1件目は10:00〜14:00。2件目を13:00からにすると重なる。
    await selectTime(sheet, "勤務時間2の開始時間", "13:00");
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));
    await expect(await sheet.findByRole("alert")).toHaveTextContent("勤務時間が重なっています");
    // シートが開いている間、後ろのカードは変わらない。
    await expect(canvas.getByRole("button", { name: "Aさんの勤務を編集", hidden: true })).toHaveTextContent(
      "10:00–18:00",
    );

    await selectTime(sheet, "勤務時間1の終了時間", "13:00");
    await waitFor(() => expect(sheet.queryByRole("alert")).not.toBeInTheDocument());
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));
    // Aさんはホールでリーダーだが、シフト表にリーダーの印は出さない。ポジションの名前のすぐ後ろに時刻が続く。
    // 12:00〜13:00の休憩でホールの時間を区切り、休憩も時刻の順に1項目として並べる。
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Aさんの勤務を編集" })).toHaveTextContent(
        "ホール10:00〜12:00休憩12:00〜13:00キッチン13:00〜18:00",
      ),
    );
  },
};

/**
 * くわしく表示では、勤務時間と同じシートで休憩も入れる。誤った休憩は文言で伝えて保存せず、直すと勤務と一緒に保存する。
 * Bさんの勤務は11:00〜19:00で、15:00〜15:30に休憩がある。
 */
export const EditBreaksInSheetInteractive: Story = {
  name: "Edit Breaks In Sheet Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const sheet = await openEditSheet(canvasElement, "Bさん");

    await selectTime(sheet, "休憩1の終了時間", "14:00");
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));
    await expect(await sheet.findByRole("alert")).toHaveTextContent("休憩の終了時間は開始時間より後にしてください");

    await selectTime(sheet, "休憩1の終了時間", "16:00");
    await waitFor(() => expect(sheet.queryByRole("alert")).not.toBeInTheDocument());
    await userEvent.click(sheet.getByRole("button", { name: "休憩を追加" }));
    await selectTime(sheet, "休憩2の開始時間", "12:00");
    await selectTime(sheet, "休憩2の終了時間", "12:30");
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));

    // 休憩の編集を別に開かず、このシートだけで済む。
    await waitFor(() => expect(body.queryAllByRole("dialog")).toHaveLength(0));
    // 休憩は、カードの内訳に時刻の順で1項目ずつ並ぶ。
    await expect(await canvas.findByRole("button", { name: "Bさんの勤務を編集" })).toHaveTextContent(
      /休憩12:00〜12:30.*休憩15:00〜16:00/,
    );
  },
};

/**
 * 見習いだけの時間帯は、時間指定のスマートフォンでは日付の件数に足さない。
 * 充足の帯に見習いだけの時間を出さず、その日の画面で場所を確かめられないためである。
 */
export const NewcomerOnlyNotCountedOnDateInteractive: Story = {
  name: "Newcomer Only Not Counted On Date Interactive",
  args: {
    ...timeDetailArgs,
    newcomerOnlyPeriods: [
      { date: timeDetailDate, positionId: "kitchen", scope: { kind: "time", start: "15:00", end: "15:30" } },
    ],
  },
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector(`[data-date-chip="${timeDetailDate}"]`) as HTMLElement;
    // 見習いだけの時間帯を受け取ったあとも、件数が出ないことを確かめるため、充足が出るまで待つ。
    await within(canvasElement).findByRole("region", { name: "充足" });

    await expect(within(chip).queryByLabelText(/確認事項/)).not.toBeInTheDocument();
  },
};

// ==========================================
// 充足と、その日のテンプレートの操作
// ==========================================
type ShiftFormArgs = Parameters<typeof ShiftForm>[0];

const harnessRender = (args: ShiftFormArgs) => <StaffingHarness {...args} templates={timeDetailTemplates} />;

// 2日とも平日のテンプレートが当たっている募集。日付を切り替えても充足の欄が出る。
const bothDaysStaffedArgs = {
  ...timeDetailArgs,
  staffing: buildStaffing({
    templates: timeDetailTemplates,
    days: timeDetailArgs.dates.map((date) => templateDay(date, timeWeekdayTemplate)),
  }),
} satisfies ShiftFormArgs;

const findFulfillment = (canvasElement: HTMLElement) => within(canvasElement).findByRole("region", { name: "充足" });

const openFulfillment = async (canvasElement: HTMLElement) => {
  const section = await findFulfillment(canvasElement);
  await userEvent.click(within(section).getByRole("button", { name: /^充足/ }));
  return section;
};

const getBandSegments = (section: HTMLElement, positionName: string) =>
  within(within(section).getByRole("list", { name: `${positionName}の充足` })).getAllByRole("listitem");

/** 帯の区間を「時間 状態」の文字で返す。 */
const describeBand = (section: HTMLElement, positionName: string) =>
  getBandSegments(section, positionName).map((segment) => segment.getAttribute("aria-label"));

/** 充足を開いた状態。ポジションごとの帯と、3時間ごとの時刻が出る。 */
export const DetailFulfillmentOpen: Story = {
  name: "Detail Fulfillment Open",
  args: timeDetailArgs,
  globals: mobileGlobals,
  play: async ({ canvasElement }) => {
    const section = await openFulfillment(canvasElement);
    await expect(await within(section).findByRole("list", { name: "ホールの充足" })).toBeInTheDocument();
  },
};

/** 不足が3人以上の区間は、いちばん濃い赤に白い文字で出す。イベント日は、ホールに3人、キッチンに2人が1日を通して必要である。 */
export const DetailFulfillmentOpenHeavyShortage: Story = {
  name: "Detail Fulfillment Open Heavy Shortage",
  args: {
    ...timeDetailArgs,
    staffing: buildStaffing({
      templates: timeDetailTemplates,
      days: timeDetailArgs.dates.map((date) => templateDay(date, timeEventTemplate)),
    }),
  },
  globals: mobileGlobals,
  play: async ({ canvasElement }) => {
    const section = await openFulfillment(canvasElement);
    await expect(await within(section).findByRole("list", { name: "ホールの充足" })).toBeInTheDocument();
  },
};

/** 必要人数をすべて満たした日は、充足率と進捗バーを緑で出す。必要人数は、レジの午後の1人だけである。 */
export const DetailFulfillmentFull: Story = {
  name: "Detail Fulfillment Full",
  args: {
    ...timeDetailArgs,
    staffing: buildStaffing({
      templates: timeDetailTemplates,
      days: timeDetailArgs.dates.map((date) => customDay(date, timeRequirements([[register, "13:00", "17:00"]]))),
    }),
  },
  globals: mobileGlobals,
};

/**
 * 充足は閉じた状態で始まり、押すとポジションごとの帯が開く。
 * 帯は人数か必要人数が変わる時刻で区切り、不足の人数は幅のある区間にだけ出す。
 */
export const FulfillmentInteractive: Story = {
  name: "Fulfillment Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const section = await findFulfillment(canvasElement);
    const toggle = within(section).getByRole("button", { name: "充足 56%" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(within(section).queryByRole("list")).not.toBeInTheDocument();

    await userEvent.click(toggle);

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await waitFor(() =>
      expect(describeBand(section, "ホール")).toEqual([
        "09:00〜10:00 2人不足",
        "10:00〜12:00 1人不足",
        "12:00〜13:00 2人不足",
        "13:00〜14:00 1人多い",
        "14:00〜17:00 ちょうど",
        "17:00〜22:00 1人不足",
      ]),
    );
    // キッチンは17時から必要人数がない。人が入っている時間は多い、だれもいない時間は指定なしになる。
    await expect(describeBand(section, "キッチン")).toEqual([
      "09:00〜11:00 1人不足",
      "11:00〜13:00 ちょうど",
      "13:00〜14:00 1人不足",
      "14:00〜15:00 ちょうど",
      "15:00〜15:30 1人不足",
      "15:30〜17:00 ちょうど",
      "17:00〜18:00 2人多い",
      "18:00〜19:00 1人多い",
      "19:00〜22:00 必要人数の指定なし",
    ]);
    await expect(describeBand(section, "レジ")).toEqual([
      "09:00〜12:00 1人多い",
      "12:00〜13:00 必要人数の指定なし",
      "13:00〜17:00 ちょうど",
      "17:00〜22:00 必要人数の指定なし",
    ]);

    // 不足の人数は、幅のある区間にだけ出す。30分の区間は色だけになる。
    const kitchen = getBandSegments(section, "キッチン");
    await expect(within(kitchen[0]).getByText("−1")).toBeVisible();
    await expect(within(kitchen[4]).getByText("−1")).not.toBeVisible();
    // 多い、ちょうど、指定なしの区間には文字を出さない。
    await expect(kitchen.slice(5).map((segment) => segment.textContent)).toEqual(["", "", "", ""]);

    await userEvent.click(toggle);
    await waitFor(() => expect(within(section).queryByRole("list")).not.toBeInTheDocument());
  },
};

/** 時刻の位置（px）。要素の左端、または中央。 */
const leftOf = (element: Element) => element.getBoundingClientRect().left;
const centerOf = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return rect.left + rect.width / 2;
};

/**
 * 充足の帯、時刻の軸、1時間ごとの縦線、スタッフのカードのバーは、同じ物差しと余白で描き、同じ時刻を上下で同じ位置にそろえる。
 * 画面の幅が375pxと430pxのどちらでも、12時と13時の位置が1px以内でそろう。
 */
export const FulfillmentAlignsWithCardBarsInteractive: Story = {
  name: "Fulfillment Aligns With Card Bars Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const section = await openFulfillment(canvasElement);
    const frame = section.closest<HTMLElement>('div[style*="100dvh"]');
    if (!frame) throw new Error("画面の幅を決めている入れ物が見つかりません");
    const hall = await within(section).findByRole("list", { name: "ホールの充足" });
    const findSegment = (start: string) =>
      within(hall)
        .getAllByRole("listitem")
        .find((segment) => segment.getAttribute("aria-label")?.startsWith(`${start}〜`));
    const tick12 = section.querySelector('[data-tick-minutes="720"]');
    const hourLine12 = section.querySelector('[data-hour-line-minutes="720"]');
    // Aさんは12時から休憩に入り、Cさんの仮の勤務は13時から始まる。
    const cardA = canvasElement.querySelector('[data-tour="shift-row-staff1"]');
    const cardC = canvasElement.querySelector('[data-tour="shift-row-staff3"]');
    // カードの中で、時刻に合わせて置くバーは絶対配置で描く。アバターなどの色の付いた要素と分ける。
    const findBar = (card: Element | null, selector: string) =>
      Array.from(card?.querySelectorAll(selector) ?? []).find(
        (element) => getComputedStyle(element).position === "absolute",
      );
    const breakBarA = findBar(cardA, 'div[style*="background-image"]');
    const workBarC = findBar(cardC, 'div[style*="background"]');
    if (!tick12 || !hourLine12 || !breakBarA || !workBarC) throw new Error("比べる時刻の要素が見つかりません");

    for (const width of [375, 430]) {
      frame.style.width = `${width}px`;
      await waitFor(() => expect(Math.round(frame.getBoundingClientRect().width)).toBe(width));
      const segment12 = findSegment("12:00");
      const segment13 = findSegment("13:00");
      if (!segment12 || !segment13) throw new Error("12時と13時から始まる区間が見つかりません");

      await expect(Math.abs(leftOf(segment12) - leftOf(breakBarA))).toBeLessThanOrEqual(1);
      await expect(Math.abs(centerOf(tick12) - leftOf(breakBarA))).toBeLessThanOrEqual(1);
      await expect(Math.abs(centerOf(hourLine12) - leftOf(breakBarA))).toBeLessThanOrEqual(1);
      await expect(Math.abs(leftOf(segment13) - leftOf(workBarC))).toBeLessThanOrEqual(1);
    }
  },
};

/** 充足の区画から上へたどり、画面をスクロールしている入れ物を返す。 */
const findScroller = (element: HTMLElement): HTMLElement => {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight && getComputedStyle(node).overflowY === "auto") return node;
  }
  throw new Error("スクロールしている入れ物が見つかりません");
};

/** 充足は、閉じていても開いていても、一覧をスクロールすると日付の見出しのすぐ下に留まる。 */
export const FulfillmentStaysOnTopInteractive: Story = {
  name: "Fulfillment Stays On Top Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const section = await findFulfillment(canvasElement);
    // 一覧が画面に収まらない高さにして、スクロールできるようにする。
    const frame = section.closest<HTMLElement>('div[style*="100dvh"]');
    if (!frame) throw new Error("画面の高さを決めている入れ物が見つかりません");
    frame.style.height = "480px";
    const scroller = await waitFor(() => findScroller(section));
    const topOf = (element: HTMLElement) => Math.round(element.getBoundingClientRect().top);

    scroller.scrollTop = scroller.scrollHeight;
    // 閉じた充足は、一覧の下までスクロールしても、見える範囲に留まる。
    await waitFor(() => expect(topOf(section)).toBeGreaterThanOrEqual(topOf(scroller)));
    await expect(section.getBoundingClientRect().bottom).toBeLessThan(scroller.getBoundingClientRect().bottom);

    scroller.scrollTop = 0;
    await userEvent.click(within(section).getByRole("button", { name: /^充足/ }));
    await within(section).findByRole("list", { name: "ホールの充足" });
    scroller.scrollTop = scroller.scrollHeight;
    // 開いた充足も、帯ごと見える範囲に留まる。
    await waitFor(() => expect(topOf(section)).toBeGreaterThanOrEqual(topOf(scroller)));
    await expect(section.getBoundingClientRect().bottom).toBeLessThan(scroller.getBoundingClientRect().bottom);
  },
};

/**
 * 開いた充足の「不足｜必要」で「必要」を選ぶと、帯をPCと同じ必要人数の見せ方へ切り替える。必要人数が変わる時刻だけで区切る。
 * 「不足」を選ぶと過不足の見せ方へ戻る。
 */
export const FulfillmentRequiredModeInteractive: Story = {
  name: "Fulfillment Required Mode Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const section = await openFulfillment(canvasElement);
    const describeRequired = (positionName: string) =>
      within(within(section).getByRole("list", { name: `${positionName}の必要人数` }))
        .getAllByRole("listitem")
        .map((span) => span.getAttribute("aria-label"));

    const modes = within(await within(section).findByRole("radiogroup", { name: "帯の見せ方" }));
    await expect(modes.getByRole("radio", { name: "不足" })).toBeChecked();
    await userEvent.click(modes.getByRole("radio", { name: "必要" }));
    await expect(modes.getByRole("radio", { name: "必要" })).toBeChecked();

    // 平日のテンプレート。人数が変わる時刻では区切らない。
    await expect(describeRequired("ホール")).toEqual(["09:00〜13:00 必要2人", "13:00〜22:00 必要1人"]);
    await expect(describeRequired("キッチン")).toEqual(["09:00〜13:00 必要1人", "13:00〜17:00 必要2人"]);
    await expect(describeRequired("レジ")).toEqual(["13:00〜17:00 必要1人"]);
    await expect(within(section).queryByRole("list", { name: "ホールの充足" })).not.toBeInTheDocument();

    await userEvent.click(modes.getByRole("radio", { name: "不足" }));

    await expect(modes.getByRole("radio", { name: "不足" })).toBeChecked();
    await expect(describeBand(section, "ホール")[0]).toBe("09:00〜10:00 2人不足");
    await expect(within(section).queryByRole("list", { name: "ホールの必要人数" })).not.toBeInTheDocument();
  },
};

/** 開いた状態は、日付を切り替えても保つ。 */
export const FulfillmentKeepsOpenAcrossDatesInteractive: Story = {
  name: "Fulfillment Keeps Open Across Dates Interactive",
  args: bothDaysStaffedArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await openFulfillment(canvasElement);

    await userEvent.click(canvasElement.querySelector('[data-date-chip="2026-01-24"]') as HTMLElement);

    // 24日は、ホールにAさん、キッチンにBさんだけが入る。
    const section = await findFulfillment(canvasElement);
    const toggle = await within(section).findByRole("button", { name: "充足 39%" });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(describeBand(section, "レジ")).toEqual([
      "09:00〜13:00 必要人数の指定なし",
      "13:00〜17:00 1人不足",
      "17:00〜22:00 必要人数の指定なし",
    ]);
  },
};

/** 勤務の時間を変えると、充足率と帯の色が変わる。 */
export const FulfillmentFollowsShiftEditInteractive: Story = {
  name: "Fulfillment Follows Shift Edit Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const section = await openFulfillment(canvasElement);
    await expect(within(section).getByRole("button", { name: "充足 56%" })).toBeInTheDocument();
    const lastHallSegment = () => getBandSegments(section, "ホール").at(-1);
    await expect(lastHallSegment()).toHaveAttribute("data-fulfillment-state", "shortage");

    // Cさんのホールの勤務（13:00〜17:00）を、22:00まで伸ばす。
    const sheet = await openEditSheet(canvasElement, "Cさん");
    await selectTime(sheet, "勤務時間1の終了時間", "22:00");
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));

    await expect(await within(section).findByRole("button", { name: "充足 71%" })).toBeInTheDocument();
    await expect(lastHallSegment()).toHaveAttribute("aria-label", "14:00〜22:00 ちょうど");
    await expect(lastHallSegment()).toHaveAttribute("data-fulfillment-state", "even");
  },
};

/** 日付の見出しのメニューからテンプレートを当てると、その日とテンプレートを1回で送り、充足率が変わる。 */
export const ApplyTemplateInteractive: Story = {
  name: "Apply Template Interactive",
  args: timeDetailArgs,
  render: harnessRender,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const section = await openFulfillment(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "この日のテンプレート: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "イベント日" }));

    await expect(await canvas.findByRole("button", { name: "この日のテンプレート: イベント日" })).toBeInTheDocument();
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: [timeDetailDate], templateId: "event" },
    ]);
    // イベント日はホールに3人、キッチンに2人が1日を通して必要で、レジは必要人数がない。
    await expect(await within(section).findByRole("button", { name: "充足 28%" })).toBeInTheDocument();
    await expect(describeBand(section, "ホール")).toEqual([
      "09:00〜10:00 3人不足",
      "10:00〜12:00 2人不足",
      "12:00〜13:00 3人不足",
      "13:00〜14:00 1人不足",
      "14:00〜17:00 2人不足",
      "17:00〜22:00 3人不足",
    ]);
    // 必要人数を入れていないポジションの帯は出さない。
    await expect(within(section).queryByRole("list", { name: "レジの充足" })).not.toBeInTheDocument();
  },
};

/** 必要人数のない日は、充足の欄を出さない。テンプレートは日付の見出しのメニューから当てられる。 */
export const UnsetDayInteractive: Story = {
  name: "Unset Day Interactive",
  args: timeDetailArgs,
  render: harnessRender,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await findFulfillment(canvasElement);

    await userEvent.click(canvasElement.querySelector('[data-date-chip="2026-01-24"]') as HTMLElement);

    await waitFor(() => expect(canvas.queryByRole("region", { name: "充足" })).not.toBeInTheDocument());

    await userEvent.click(await canvas.findByRole("button", { name: "この日のテンプレート: 未設定" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "平日" }));

    await expect(await canvas.findByRole("region", { name: "充足" })).toHaveTextContent("充足 39%");
  },
};
