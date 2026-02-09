import type { Meta, StoryObj } from "@storybook/react-vite";
import { WeeklyHeatmap } from "./index";

const meta = {
  title: "features/Shift/StaffingRequirement/WeeklyHeatmap",
  component: WeeklyHeatmap,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof WeeklyHeatmap>;

export default meta;
type Story = StoryObj<typeof meta>;

const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const positions = [{ name: "ホール" }, { name: "キッチン" }, { name: "その他" }];

// ランチ・ディナーピークのあるデータ
const generateSampleMap = () => {
  const map: Record<string, number> = {};
  for (let day = 0; day < 7; day++) {
    for (const hour of hours) {
      const isWeekend = day === 0 || day === 6;
      const isLunch = hour >= 11 && hour < 14;
      const isDinner = hour >= 18 && hour < 21;

      map[`${day}-${hour}-ホール`] = isLunch || isDinner ? (isWeekend ? 4 : 3) : 1;
      map[`${day}-${hour}-キッチン`] = isLunch || isDinner ? 2 : 1;
      map[`${day}-${hour}-その他`] = isLunch ? 1 : 0;
    }
  }
  return map;
};

export const Basic: Story = {
  args: {
    staffingMap: generateSampleMap(),
    hours,
    positions,
    onSelectDay: (day) => console.log("Selected day:", day),
  },
};

export const NoData: Story = {
  args: {
    staffingMap: {},
    hours,
    positions,
    onSelectDay: (day) => console.log("Selected day:", day),
  },
};

export const PartialData: Story = {
  args: {
    staffingMap: {
      "1-11-ホール": 3,
      "1-12-ホール": 3,
      "1-11-キッチン": 2,
      "1-12-キッチン": 2,
      "5-18-ホール": 4,
      "5-19-ホール": 4,
      "5-18-キッチン": 3,
    },
    hours,
    positions,
    onSelectDay: (day) => console.log("Selected day:", day),
  },
};
