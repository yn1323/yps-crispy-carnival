import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useCallback, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "..";
import { allPatternsArgs, desktopGlobals, fullscreenParameters, mobileGlobals, shiftFormDecorators } from "./shared";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

/**
 * 「シンプル / くわしく」の切り替えの通知を、画面に出して確かめるためのハーネス。
 * argsに`onDetailModeChange`がある場合だけ、通知を記録するcallbackを渡す。
 */
const DetailModeHarness = (args: ShiftFormArgs) => {
  const [calls, setCalls] = useState<boolean[]>([]);
  const record = useCallback((isDetailMode: boolean) => setCalls((current) => [...current, isDetailMode]), []);

  return (
    <>
      <output aria-label="切り替えの通知">
        通知：{calls.length}回{calls.length > 0 ? `（${calls.join("、")}）` : ""}
      </output>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ShiftForm {...args} onDetailModeChange={args.onDetailModeChange ? record : undefined} />
      </div>
    </>
  );
};

const meta = {
  title: "Features/Shift/ShiftForm/Detail Mode",
  component: ShiftForm,
  parameters: { ...fullscreenParameters, screenshot: { skip: true } },
  decorators: shiftFormDecorators,
  render: (args) => <DetailModeHarness {...args} />,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const toggleArgs = { ...allPatternsArgs, onDetailModeChange: () => {} } satisfies ShiftFormArgs;

// 初期値の反映は描画のあとで行われる。通知が「呼ばれない」ことを確かめる前に、その反映が終わるのを待つ。
const waitForInitialSync = () => new Promise((resolve) => setTimeout(resolve, 200));

const findNotification = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole("status", { name: "切り替えの通知" });

const selectDetailModeFromDisplaySettings = async (canvasElement: HTMLElement, name: "シンプル" | "くわしく") => {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: "表示設定" }));
  await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("menuitemradio", { name }));
};

/** くわしく表示が初期値の店舗を開いただけでは、切り替えを通知しない（端末に「くわしく」を覚えさせない）。 */
export const InitialDetailDoesNotNotify: Story = {
  name: "Initial Detail Does Not Notify",
  args: { ...toggleArgs, initialDetailMode: true },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // くわしく表示では「ドラッグで設定する内容」が出る。
    await expect(await canvas.findByRole("radiogroup", { name: "ドラッグで設定する内容" })).toBeInTheDocument();

    await waitForInitialSync();
    await expect(await findNotification(canvasElement)).toHaveTextContent(/^通知：0回$/);
  },
};

/** シンプルが初期値の店舗を開いただけでも、切り替えを通知しない。 */
export const InitialSimpleDoesNotNotify: Story = {
  name: "Initial Simple Does Not Notify",
  args: toggleArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitForInitialSync();
    await expect(await findNotification(canvasElement)).toHaveTextContent(/^通知：0回$/);
    // シンプルでは「ドラッグで設定する内容」を出さない。
    await expect(canvas.queryByRole("radiogroup", { name: "ドラッグで設定する内容" })).not.toBeInTheDocument();
  },
};

/** PCでも「表示設定」の「シンプル」「くわしく」で切り替え、利用者が押したときだけ、押した値を通知する。 */
export const ToggleOnDesktopNotifies: Story = {
  name: "Toggle On Desktop Notifies",
  args: { ...toggleArgs, initialDetailMode: true },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notification = await findNotification(canvasElement);
    await expect(await canvas.findByRole("radiogroup", { name: "ドラッグで設定する内容" })).toBeInTheDocument();

    // 初期値の反映を通知していれば、ここで2回になる。
    await selectDetailModeFromDisplaySettings(canvasElement, "シンプル");
    await waitFor(() => expect(notification).toHaveTextContent(/^通知：1回（false）$/));
    await expect(canvas.queryByRole("radiogroup", { name: "ドラッグで設定する内容" })).not.toBeInTheDocument();

    await selectDetailModeFromDisplaySettings(canvasElement, "くわしく");
    await waitFor(() => expect(notification).toHaveTextContent(/^通知：2回（false、true）$/));
    await expect(await canvas.findByRole("radiogroup", { name: "ドラッグで設定する内容" })).toBeInTheDocument();
  },
};

/**
 * 切り替えを画面の外で受け付ける場合のハーネス。受け付けた表示を画面に出し、ShiftFormの表示は変えない。
 */
const RequestHarness = (args: ShiftFormArgs) => {
  const [requests, setRequests] = useState<boolean[]>([]);
  const detailActions = {
    ...args.detailActions,
    requestDetailModeChange: (isDetailMode: boolean) => setRequests((current) => [...current, isDetailMode]),
  };
  return (
    <>
      <output aria-label="切り替えの依頼">依頼：{requests.join("、") || "なし"}</output>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ShiftForm {...args} detailActions={detailActions} />
      </div>
    </>
  );
};

/**
 * 切り替えを画面の外で受け付ける場合は、「表示設定」で選んでも、その場では表示を変えず、選んだ表示を外へ伝える。
 * 下書きを削除する画面が、確認してから開き直すために使う。
 */
export const RequestsModeChangeOutside: Story = {
  name: "Requests Mode Change Outside",
  args: { ...toggleArgs, initialDetailMode: true },
  globals: desktopGlobals,
  render: (args) => <RequestHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("radiogroup", { name: "ドラッグで設定する内容" })).toBeInTheDocument();

    await selectDetailModeFromDisplaySettings(canvasElement, "シンプル");

    await waitFor(() =>
      expect(canvas.getByRole("status", { name: "切り替えの依頼" })).toHaveTextContent("依頼：false"),
    );
    // 表示はくわしくのままで、「ドラッグで設定する内容」が残る。
    await expect(canvas.getByRole("radiogroup", { name: "ドラッグで設定する内容" })).toBeInTheDocument();
  },
};

const expectToolPaletteOnlyOnDaily = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByRole("radiogroup", { name: "ドラッグで設定する内容" })).toBeInTheDocument();

  await userEvent.click(canvas.getByRole("tab", { name: "一覧" }));
  await waitFor(() =>
    expect(canvas.queryByRole("radiogroup", { name: "ドラッグで設定する内容" })).not.toBeInTheDocument(),
  );

  await userEvent.click(canvas.getByRole("tab", { name: "日別" }));
  await expect(await canvas.findByRole("radiogroup", { name: "ドラッグで設定する内容" })).toBeInTheDocument();
};

/** 一覧は勤務を入れる画面ではないため、くわしく表示でも「ドラッグで設定する内容」を出さない。日別へ戻すと出る。 */
export const ToolPaletteHiddenOnOverviewDesktop: Story = {
  name: "Tool Palette Hidden On Overview Desktop",
  args: { ...toggleArgs, initialDetailMode: true },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => expectToolPaletteOnlyOnDaily(canvasElement),
};

/** スマートフォンでは「表示設定」の「シンプル」「くわしく」で切り替え、切り替えるたびに通知する。 */
export const ToggleOnMobileNotifies: Story = {
  name: "Toggle On Mobile Notifies",
  args: toggleArgs,
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => {
    const notification = await findNotification(canvasElement);

    await selectDetailModeFromDisplaySettings(canvasElement, "くわしく");
    await waitFor(() => expect(notification).toHaveTextContent(/^通知：1回（true）$/));

    await selectDetailModeFromDisplaySettings(canvasElement, "シンプル");
    await waitFor(() => expect(notification).toHaveTextContent(/^通知：2回（true、false）$/));
  },
};

/** スマートフォンでも、くわしく表示が初期値の店舗を開いただけでは通知しない。 */
export const InitialDetailDoesNotNotifyOnMobile: Story = {
  name: "Initial Detail Does Not Notify On Mobile",
  args: { ...toggleArgs, initialDetailMode: true },
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitForInitialSync();
    await expect(await findNotification(canvasElement)).toHaveTextContent(/^通知：0回$/);

    // 利用者が切り替えたときは通知する。初期値の反映を通知していれば、ここで2回になる。
    await selectDetailModeFromDisplaySettings(canvasElement, "シンプル");
    await waitFor(() =>
      expect(canvas.getByRole("status", { name: "切り替えの通知" })).toHaveTextContent(/^通知：1回（false）$/),
    );
  },
};

// スタッフ向けの閲覧では`onDetailModeChange`を渡さない。
const readOnlyArgs = {
  ...allPatternsArgs,
  isReadOnly: true,
  currentStaffId: "staff1",
  displayMode: "confirmed",
  initialDetailMode: true,
} satisfies ShiftFormArgs;

const expectNoToggleInDisplaySettings = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await waitForInitialSync();

  await userEvent.click(await canvas.findByRole("button", { name: "表示設定" }));
  await expect(await body.findByRole("menuitemcheckbox", { name: "連絡事項を表示" })).toBeInTheDocument();
  await expect(body.queryByRole("menuitemradio", { name: "シンプル" })).not.toBeInTheDocument();
  await expect(canvas.queryByRole("radiogroup", { name: "ドラッグで設定する内容" })).not.toBeInTheDocument();
  await expect(await findNotification(canvasElement)).toHaveTextContent(/^通知：0回$/);
};

/** `onDetailModeChange`を渡さない閲覧では、PCの「表示設定」に切り替えを出さない。「ドラッグで設定する内容」も出さない。 */
export const NoToggleWithoutCallbackOnDesktop: Story = {
  name: "No Toggle Without Callback On Desktop",
  args: readOnlyArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => expectNoToggleInDisplaySettings(canvasElement),
};

/** `onDetailModeChange`を渡さない閲覧では、スマートフォンの「表示設定」にも切り替えを出さない。 */
export const NoToggleWithoutCallbackOnMobile: Story = {
  name: "No Toggle Without Callback On Mobile",
  args: readOnlyArgs,
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => expectNoToggleInDisplaySettings(canvasElement),
};
