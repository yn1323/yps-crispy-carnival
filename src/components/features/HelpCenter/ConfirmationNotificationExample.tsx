import { Box } from "@chakra-ui/react";
import { buildConfirmationEmailHtml, buildLineCtaSection } from "@/convex/notification/templates";

const periodLabel = "9/16(水)〜9/30(水)";

const confirmationEmailHtml = buildConfirmationEmailHtml({
  staffName: "伊藤 拓也",
  periodLabel,
  shifts: [
    { date: "9/16(水)", startTime: "09:00", endTime: "14:00" },
    { date: "9/17(木)", startTime: null, endTime: null },
    { date: "9/18(金)", timeLabel: "定休日" },
    { date: "9/19(土)", startTime: null, endTime: null },
    { date: "9/20(日)", startTime: "12:00", endTime: "18:00" },
    { date: "9/21(月)", startTime: null, endTime: null },
    { date: "9/22(火)", startTime: null, endTime: null },
    { date: "9/23(水)", startTime: null, endTime: null },
    { date: "9/24(木)", startTime: null, endTime: null },
    { date: "9/25(金)", timeLabel: "定休日" },
    { date: "9/26(土)", startTime: null, endTime: null },
    { date: "9/27(日)", startTime: null, endTime: null },
    { date: "9/28(月)", startTime: null, endTime: null },
    { date: "9/29(火)", startTime: null, endTime: null },
    { date: "9/30(水)", startTime: null, endTime: null },
  ],
  magicLinkUrl: "https://example.com/confirmed-shift",
  reissueUrl: "https://example.com/reissue-confirmed-shift",
  isResend: false,
  lineCtaHtml: buildLineCtaSection({
    authorizeUrl: "https://example.com/line/connect",
    reLink: false,
  }),
});

export function ConfirmationNotificationExample() {
  return (
    <Box overflow="hidden" borderWidth="1px" borderColor="gray.200" borderRadius="lg" bg="gray.50">
      <iframe
        title="シフト確定メールの表示例"
        srcDoc={confirmationEmailHtml}
        sandbox=""
        loading="lazy"
        tabIndex={-1}
        style={{
          width: "100%",
          height: "1260px",
          border: 0,
          backgroundColor: "#f7fafc",
          display: "block",
          pointerEvents: "none",
        }}
      />
    </Box>
  );
}
