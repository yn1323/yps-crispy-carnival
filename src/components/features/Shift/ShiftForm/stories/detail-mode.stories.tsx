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

const findDetailRadio = async (canvasElement: HTMLElement, name: "シンプル" | "くわしく") =>
  within(await within(canvasElement).findByRole("radiogroup", { name: "表示の詳しさ" })).getByRole("radio", { name });

const toggleDetailFromDisplaySettings = async (canvasElement: HTMLElement) => {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: "表示設定" }));
  await userEvent.click(
    await within(canvasElement.ownerDocument.body).findByRole("menuitemcheckbox", { name: "くわしく表示" }),
  );
};

/** くわしく表示が初期値の店舗を開いただけでは、切り替えを通知しない（端末に「くわしく」を覚えさせない）。 */
export const InitialDetailDoesNotNotify: Story = {
  name: "Initial Detail Does Not Notify",
  args: { ...toggleArgs, initialDetailMode: true },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // くわしく表示では「入れるもの」が出る。
    await expect(await canvas.findByRole("radiogroup", { name: "入れるもの" })).toBeInTheDocument();
    await expect(await findDetailRadio(canvasElement, "くわしく")).toHaveAttribute("aria-checked", "true");

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
    await expect(await findDetailRadio(canvasElement, "シンプル")).toHaveAttribute("aria-checked", "true");

    await waitForInitialSync();
    await expect(await findNotification(canvasElement)).toHaveTextContent(/^通知：0回$/);
    // シンプルでは「入れるもの」を出さない。
    await expect(canvas.queryByRole("radiogroup", { name: "入れるもの" })).not.toBeInTheDocument();
  },
};

/** PCでは「表示の詳しさ」で切り替え、利用者が押したときだけ、押した値を通知する。 */
export const ToggleOnDesktopNotifies: Story = {
  name: "Toggle On Desktop Notifies",
  args: { ...toggleArgs, initialDetailMode: true },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notification = await findNotification(canvasElement);
    await expect(await canvas.findByRole("radiogroup", { name: "入れるもの" })).toBeInTheDocument();

    // 初期値の反映を通知していれば、ここで2回になる。
    await userEvent.click(await findDetailRadio(canvasElement, "シンプル"));
    await waitFor(() => expect(notification).toHaveTextContent(/^通知：1回（false）$/));
    await expect(canvas.queryByRole("radiogroup", { name: "入れるもの" })).not.toBeInTheDocument();

    await userEvent.click(await findDetailRadio(canvasElement, "くわしく"));
    await waitFor(() => expect(notification).toHaveTextContent(/^通知：2回（false、true）$/));
    await expect(await canvas.findByRole("radiogroup", { name: "入れるもの" })).toBeInTheDocument();
  },
};

/** スマートフォンでは「表示設定」の「くわしく表示」で切り替え、切り替えるたびに通知する。 */
export const ToggleOnMobileNotifies: Story = {
  name: "Toggle On Mobile Notifies",
  args: toggleArgs,
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notification = await findNotification(canvasElement);
    // スマートフォンには、ヘッダーの「表示の詳しさ」を出さない。
    await expect(await canvas.findByRole("button", { name: "表示設定" })).toBeInTheDocument();
    await expect(canvas.queryByRole("radiogroup", { name: "表示の詳しさ" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("radiogroup", { name: "入れるもの" })).not.toBeInTheDocument();

    await toggleDetailFromDisplaySettings(canvasElement);
    await waitFor(() => expect(notification).toHaveTextContent(/^通知：1回（true）$/));
    await expect(await canvas.findByRole("radiogroup", { name: "入れるもの" })).toBeInTheDocument();

    await toggleDetailFromDisplaySettings(canvasElement);
    await waitFor(() => expect(notification).toHaveTextContent(/^通知：2回（true、false）$/));
    await expect(canvas.queryByRole("radiogroup", { name: "入れるもの" })).not.toBeInTheDocument();
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
    await expect(await canvas.findByRole("radiogroup", { name: "入れるもの" })).toBeInTheDocument();

    await waitForInitialSync();
    await expect(await findNotification(canvasElement)).toHaveTextContent(/^通知：0回$/);

    // 利用者が切り替えたときは通知する。初期値の反映を通知していれば、ここで2回になる。
    await toggleDetailFromDisplaySettings(canvasElement);
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

/** `onDetailModeChange`を渡さない閲覧では、PCに切り替えを出さない。「入れるもの」も出さない。 */
export const NoToggleWithoutCallbackOnDesktop: Story = {
  name: "No Toggle Without Callback On Desktop",
  args: readOnlyArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("tab", { name: "日別" })).toBeInTheDocument();
    await waitForInitialSync();

    await expect(canvas.queryByRole("radiogroup", { name: "表示の詳しさ" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("radiogroup", { name: "入れるもの" })).not.toBeInTheDocument();
    await expect(await findNotification(canvasElement)).toHaveTextContent(/^通知：0回$/);
  },
};

/** `onDetailModeChange`を渡さない閲覧では、スマートフォンの「表示設定」にも切り替えを出さない。 */
export const NoToggleWithoutCallbackOnMobile: Story = {
  name: "No Toggle Without Callback On Mobile",
  args: readOnlyArgs,
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await waitForInitialSync();

    await userEvent.click(await canvas.findByRole("button", { name: "表示設定" }));
    await expect(await body.findByRole("menuitemcheckbox", { name: "連絡事項を表示" })).toBeInTheDocument();
    await expect(body.queryByRole("menuitemcheckbox", { name: "くわしく表示" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("radiogroup", { name: "入れるもの" })).not.toBeInTheDocument();
  },
};
