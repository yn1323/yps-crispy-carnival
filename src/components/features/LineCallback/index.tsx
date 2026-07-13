import { useEffect, useRef, useState } from "react";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { type LineCallbackStatus, LineCallbackView } from "./LineCallbackView";
import { useRedeemLineToken } from "./useRedeemLineToken";

type LineCallbackProps = {
  code: string | undefined;
  state: string | undefined;
};

export function LineCallback({ code, state }: LineCallbackProps) {
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
      .then((result) => setStatus(result.status))
      .catch(() => setStatus("error"));
  }, [code, state, redeemLineToken]);

  return (
    <StaffLayout shopName="LINE連携">
      <LineCallbackView status={status} />
    </StaffLayout>
  );
}
