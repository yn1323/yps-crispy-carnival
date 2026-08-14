import type { RegularClosedDay, ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { formatShiftClockTimeRange } from "@/src/domains/shift/time";
import type { ShopDetailData, ShopDetailPerson, ShopStaffMembershipData } from "./types";

export const WEEKDAYS: Array<{ value: RegularClosedDay; label: string }> = [
  { value: "mon", label: "月" },
  { value: "tue", label: "火" },
  { value: "wed", label: "水" },
  { value: "thu", label: "木" },
  { value: "fri", label: "金" },
  { value: "sat", label: "土" },
  { value: "sun", label: "日" },
];

const SUBMISSION_PATTERN_LABELS: Record<ShiftSubmissionPattern["kind"], string> = {
  dateOnly: "日ごと",
  time: "時間指定",
  shiftType: "勤務区分",
};

export type ShopBasicInformationRow = {
  label: string;
  value: string;
};

export function getShopStaffs(people: readonly ShopDetailPerson[], shopId: string) {
  return people.filter((person) => person.shopIds.includes(shopId));
}

export function getVisibleShopStaffMembershipPeople(
  people: readonly ShopStaffMembershipData["people"][number][],
  isShopAdditionEnabled: boolean,
) {
  if (isShopAdditionEnabled) return [...people];
  return people.filter((person) => person.isSelected || person.otherShopNames.length === 0);
}

export function getShopBasicInformationRows(
  shop: Pick<ShopDetailData, "name" | "regularClosedDays" | "submissionPattern">,
): ShopBasicInformationRow[] {
  const rows: ShopBasicInformationRow[] = [
    { label: "店舗名", value: shop.name },
    {
      label: "提出方法",
      value: SUBMISSION_PATTERN_LABELS[shop.submissionPattern.kind],
    },
  ];

  if (shop.submissionPattern.kind === "time") {
    rows.push({
      label: "勤務時間",
      value: formatShiftClockTimeRange(shop.submissionPattern.startTime, shop.submissionPattern.endTime),
    });
  }

  if (shop.submissionPattern.kind === "shiftType") {
    rows.push({
      label: "勤務区分",
      value: shop.submissionPattern.options
        .map((option) => `${option.name}（${formatShiftClockTimeRange(option.startTime, option.endTime)}）`)
        .join("\n"),
    });
  }

  const closedDayLabels = WEEKDAYS.filter((day) => shop.regularClosedDays.includes(day.value)).map((day) => day.label);
  rows.push({
    label: "定休日",
    value: closedDayLabels.length > 0 ? `毎週 ${closedDayLabels.join("・")}` : "定休日なし",
  });

  return rows;
}
