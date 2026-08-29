import { Box } from "@chakra-ui/react";
import { buildConfirmationEmailHtml } from "@/convex/notification/templates";

const periodLabel = "9月前半（9/1〜9/15）";

const confirmationEmailHtml = buildConfirmationEmailHtml({
  staffName: "サンプル スタッフ",
  periodLabel,
  shifts: [
    { date: "9/1(火)", startTime: "09:00", endTime: "13:00" },
    { date: "9/3(木)", startTime: "17:00", endTime: "22:00" },
    { date: "9/5(土)", startTime: null, endTime: null },
  ],
  magicLinkUrl: "https://example.com/confirmed-shift",
  reissueUrl: "https://example.com/reissue-confirmed-shift",
  isResend: false,
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
          height: "760px",
          border: 0,
          backgroundColor: "#f7fafc",
          display: "block",
          pointerEvents: "none",
        }}
      />
    </Box>
  );
}
