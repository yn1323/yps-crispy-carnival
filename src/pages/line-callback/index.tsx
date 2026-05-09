import { useEffect, useRef, useState } from "react";
import type { LineCallbackStatus } from "@/src/components/features/Line/LineCallbackPage";
import { LineCallbackPage } from "@/src/components/features/Line/LineCallbackPage";
import { useRedeemLineToken } from "@/src/components/features/Line/useRedeemLineToken";
import { StaffLayout } from "@/src/components/templates/StaffLayout";

type Props = {
  code: string | undefined;
  state: string | undefined;
};

export function LineCallbackRoutePage({ code, state }: Props) {
  const redeemLineToken = useRedeemLineToken();
  const [status, setStatus] = useState<LineCallbackStatus>("loading");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (!code || !state) {
      setStatus("expired");
      return;
    }
    redeemLineToken({ code, state })
      .then((r) => setStatus(r.status))
      .catch(() => setStatus("error"));
  }, [code, state, redeemLineToken]);

  return (
    <StaffLayout shopName="LINE連携">
      <LineCallbackPage status={status} />
    </StaffLayout>
  );
}
