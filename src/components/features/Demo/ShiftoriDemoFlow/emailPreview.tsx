import type { SyntheticEvent } from "react";
import { buildConfirmationEmailHtml } from "@/convex/notification/templates";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import type { ShiftData } from "@/src/domains/shift/types";
import { dates, periodLabel } from "./demoData";

type DemoEmailPreviewProps = {
  html: string;
  onLinkClick?: () => void;
};

export const DemoEmailPreview = ({ html, onLinkClick }: DemoEmailPreviewProps) => {
  const handleLoad = (event: SyntheticEvent<HTMLIFrameElement>) => {
    if (!onLinkClick) return;

    const links = Array.from(event.currentTarget.contentDocument?.querySelectorAll("a[href]") ?? []);
    for (const link of links) {
      link.addEventListener("click", (clickEvent) => {
        clickEvent.preventDefault();
        onLinkClick();
      });
    }
  };

  return (
    <iframe
      title="確定シフトメール"
      srcDoc={html}
      sandbox="allow-same-origin"
      onLoad={handleLoad}
      style={{
        width: "100%",
        border: 0,
        backgroundColor: "#ffffff",
        display: "block",
        height: "820px",
      }}
    />
  );
};

export const buildDemoConfirmationEmailHtml = (shifts: ShiftData[]) =>
  buildConfirmationEmailHtml({
    staffName: "佐藤あや",
    periodLabel,
    shifts: buildStaffEmailShifts(shifts, "staff-aya"),
    magicLinkUrl: "https://shiftori.app/shifts/view?token=demo-confirmed-shift",
    reissueUrl: "https://shiftori.app/shifts/reissue?token=demo-reissue",
    isResend: false,
  })
    .replace(/background-color:#f7fafc/g, "background-color:#ffffff")
    .replace("background-color:#ffffff;padding:24px 0;", "background-color:#ffffff;padding:0;")
    .replace(
      "max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;",
      "max-width:100%;background-color:#ffffff;",
    );

const buildStaffEmailShifts = (shifts: ShiftData[], staffId: string) =>
  dates.map((date) => {
    const shift = shifts.find((item) => item.staffId === staffId && item.date === date);
    const sortedPositions = [...(shift?.positions ?? [])].sort((a, b) => a.start.localeCompare(b.start));
    const first = sortedPositions[0];
    const last = sortedPositions[sortedPositions.length - 1];
    return {
      date: formatDateWithWeekday(date),
      startTime: first?.start ?? null,
      endTime: last?.end ?? null,
    };
  });
