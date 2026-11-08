import { useEffect } from "react";
import type { StaffAccessKind, StaffLinkUnavailableReason } from "@/src/domains/staffAccess";
import { trackProductEvent } from "@/src/lib/webMeasurement";

/**
 * session確立後の取得で、画面がリンクを使えないと表示したときに一度だけ送る。
 * 取得結果の`invalid_link`は、sessionが現在の募集に合わない状態として`session_rejected`にする。
 */
export function useStaffLinkInvalidMeasurement(
  reason: StaffLinkUnavailableReason | null,
  accessKind: StaffAccessKind,
): void {
  useEffect(() => {
    if (!reason) return;
    trackProductEvent({
      kind: "staff_link_invalid",
      reason: reason === "invalid_link" ? "session_rejected" : reason,
      accessKind,
    });
  }, [accessKind, reason]);
}
