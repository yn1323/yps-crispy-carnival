import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  JotaiStoryWrapper,
  mockShifts,
  mockShiftsAllPatterns,
  mockShiftsRequestOnly,
  mockStaffs,
} from "../../__mocks__/storyData";
import { SPDailyView } from ".";

const meta = {
  title: "Features/Shift/ShiftForm/SP/DailyView",
  component: SPDailyView,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SPDailyView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <JotaiStoryWrapper>
      <SPDailyView />
    </JotaiStoryWrapper>
  ),
};

export const RequestOnly: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ dates: ["2026-01-22"], initialShifts: mockShiftsRequestOnly }}>
      <SPDailyView />
    </JotaiStoryWrapper>
  ),
};

export const AllPatterns: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ dates: ["2026-01-23"], initialShifts: mockShiftsAllPatterns }}>
      <SPDailyView />
    </JotaiStoryWrapper>
  ),
};

export const WithBreak: Story = {
  render: () => (
    <JotaiStoryWrapper
      overrides={{
        dates: ["2026-01-23"],
        initialShifts: [mockShiftsAllPatterns.find((s) => s.staffId === "staff4")].filter(
          (s): s is NonNullable<typeof s> => s !== undefined,
        ),
        staffs: mockStaffs.filter((s) => s.id === "staff4"),
      }}
    >
      <SPDailyView />
    </JotaiStoryWrapper>
  ),
};

export const EmptyDay: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ dates: ["2026-02-01"], initialShifts: [] }}>
      <SPDailyView />
    </JotaiStoryWrapper>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ isReadOnly: true, currentStaffId: "staff1" }}>
      <SPDailyView />
    </JotaiStoryWrapper>
  ),
};

export const AllUnsubmitted: Story = {
  render: () => (
    <JotaiStoryWrapper
      overrides={{
        staffs: mockStaffs.map((s) => ({ ...s, isSubmitted: false })),
        initialShifts: [],
      }}
    >
      <SPDailyView />
    </JotaiStoryWrapper>
  ),
};

export const UnassignedOnly: Story = {
  render: () => (
    <JotaiStoryWrapper
      overrides={{
        initialShifts: mockShifts.map((s) => ({ ...s, positions: [] })),
      }}
    >
      <SPDailyView />
    </JotaiStoryWrapper>
  ),
};
