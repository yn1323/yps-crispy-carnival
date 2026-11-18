export type StaffRegistrationPageData =
  | {
      status: "ok";
      shopName: string;
      documents: {
        terms: { title: string; path: string };
        privacy: { title: string; path: string };
      };
    }
  | {
      status: "expired";
      documents: {
        terms: { title: string; path: string };
        privacy: { title: string; path: string };
      };
    };

/** 確認コードの入力待ちで、画面が必要とする値と操作。 */
export type StaffRegistrationCodeStep = {
  email: string;
  /** この端末の時計で、次に確認コードを再送できる時刻。 */
  resendAvailableAt: number;
  /** serverが照合で返した、入力欄の下に出すエラー。 */
  codeError: string | null;
  isConfirming: boolean;
  isResending: boolean;
  onConfirmCode: (code: string) => Promise<void> | void;
  onResend: () => Promise<void> | void;
  onReviseEmail: () => void;
  onCodeChange: () => void;
};
