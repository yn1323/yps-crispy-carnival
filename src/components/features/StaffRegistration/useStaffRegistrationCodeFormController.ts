import { zodResolver } from "@hookform/resolvers/zod";
import { type ChangeEvent, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  type StaffRegistrationCodeFormData,
  type StaffRegistrationCodeFormInput,
  staffRegistrationCodeFormSchema,
  verificationCodeSchema,
} from "@/convex/staffRegistration/schemas";

type Params = {
  resendAvailableAt: number;
  onConfirmCode: (code: string) => Promise<void> | void;
  onCodeChange: () => void;
};

/** 再送できるまでの残り秒数。0になったら時計を止める。 */
function useRemainingSeconds(deadline: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (deadline <= Date.now()) return;
    const intervalId = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) window.clearInterval(intervalId);
    }, 1_000);
    return () => window.clearInterval(intervalId);
  }, [deadline]);

  return Math.max(0, Math.ceil((deadline - now) / 1_000));
}

export function useStaffRegistrationCodeFormController({ resendAvailableAt, onConfirmCode, onCodeChange }: Params) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StaffRegistrationCodeFormInput, unknown, StaffRegistrationCodeFormData>({
    resolver: zodResolver(staffRegistrationCodeFormSchema),
    defaultValues: { code: "" },
  });

  const handleConfirmCode = handleSubmit(({ code }) => onConfirmCode(code));

  return {
    codeRegistration: register("code", {
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        onCodeChange();
        // 6桁そろったら「申請する」を押さなくても照合へ進む。連打と照合中の再実行は呼び出し元が止める。
        if (verificationCodeSchema.safeParse(event.target.value).success) void handleConfirmCode();
      },
    }),
    codeFormatError: errors.code?.message,
    resendRemainingSeconds: useRemainingSeconds(resendAvailableAt),
    handleConfirmCode,
  };
}
