import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "@/src/components/ui/Button";
import { previousWeeklyPattern, submitStoryBaseData, submittedRequests } from "../fixtures";
import { ShiftSubmitPage } from "./index";

const meta = {
  title: "features/StaffSubmit/ShiftSubmitPage",
  component: ShiftSubmitPage,
  tags: ["vrt-mobile2"],
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof ShiftSubmitPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = async () => {};

function ChangedRecruitmentHarness() {
  const [editVersion, setEditVersion] = useState(0);
  return (
    <>
      <Button onClick={() => setEditVersion(1)}>募集条件の変更を反映</Button>
      <ShiftSubmitPage data={{ ...submitStoryBaseData, editVersion }} onSubmit={noop} />
    </>
  );
}

export const ChangedWhileEntering: Story = {
  args: { data: submitStoryBaseData, onSubmit: noop },
  tags: ["!vrt-mobile2"],
  parameters: { screenshot: { skip: true } },
  render: () => <ChangedRecruitmentHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "希望シフトを提出" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "募集条件の変更を反映" }));
    await expect(canvas.getByRole("button", { name: "再読み込み" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "希望シフトを提出" })).not.toBeInTheDocument();
  },
};

export const StateA_Unsubmitted: Story = {
  args: {
    data: submitStoryBaseData,
    onSubmit: noop,
  },
};

export const StateB_Submitted: Story = {
  args: {
    onSubmit: noop,
    data: {
      ...submitStoryBaseData,
      hasSubmitted: true,
      existingRequests: submittedRequests,
    },
  },
};

export const StateB_PreviousPatternAvailable: Story = {
  args: {
    onSubmit: noop,
    data: {
      ...submitStoryBaseData,
      previousWeeklyPattern,
    },
  },
};

export const StateC_SubmittedExpired: Story = {
  args: {
    onSubmit: noop,
    data: {
      ...submitStoryBaseData,
      isBeforeDeadline: false,
      hasSubmitted: true,
      existingRequests: [
        { date: "2026-04-07", startTime: "09:00", endTime: "18:00" },
        { date: "2026-04-08", startTime: "09:00", endTime: "18:00" },
        { date: "2026-04-09", startTime: "10:00", endTime: "15:00" },
        { date: "2026-04-11", startTime: "09:00", endTime: "22:00" },
      ],
    },
  },
};

export const StateD_LateInitial: Story = {
  args: {
    onSubmit: noop,
    data: {
      ...submitStoryBaseData,
      isBeforeDeadline: false,
      hasSubmitted: false,
    },
  },
};
