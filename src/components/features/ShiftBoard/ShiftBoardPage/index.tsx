import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftFormHeader } from "@/src/components/features/Shift/ShiftForm";
import type { ShiftBoardData, ShiftBoardStaffingData } from "../types";
import type { ShiftBoardExportData } from "./exportData";
import { ShiftBoardPageView } from "./ShiftBoardPageView";
import { type ShiftBoardDateNotes, useShiftBoardPageController } from "./useShiftBoardPageController";

export type ShiftBoardPageProps = {
  data: ShiftBoardData;
  recruitmentId: Id<"recruitments">;
  layout?: "legacy" | "app";
  header?: ShiftFormHeader;
  onExport?: (data: ShiftBoardExportData) => void;
  dateNotes?: ShiftBoardDateNotes;
  /** 「くわしく」表示に使う店舗の設定。渡さない場合は、従来の画面だけを出す。 */
  staffing?: ShiftBoardStaffingData;
  /** シフト表の内側のスクロールで、上の行を隠した・表示したときに通知する。アプリのヘッダーを合わせて隠すために使う。 */
  onChromeHiddenChange?: (isHidden: boolean) => void;
};

/**
 * 店舗が選んだ表示（シンプル / くわしく）が変わると、下書きが削除され、勤務の候補も作り直しになる。
 * 編集中の状態を持ち越さないよう、表示が変わったデータを受けたら、ページ全体を開き直す。
 */
export const ShiftBoardPage = (props: ShiftBoardPageProps) => (
  <ShiftBoardPageContent key={String(props.data.shiftDetailMode)} {...props} />
);

const ShiftBoardPageContent = ({
  data,
  recruitmentId,
  layout = "legacy",
  header,
  onExport,
  dateNotes,
  staffing,
  onChromeHiddenChange,
}: ShiftBoardPageProps) => {
  const controller = useShiftBoardPageController(data, recruitmentId, onExport, dateNotes, staffing);

  return (
    <ShiftBoardPageView {...controller} layout={layout} header={header} onChromeHiddenChange={onChromeHiddenChange} />
  );
};
