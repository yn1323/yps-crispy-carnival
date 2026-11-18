/**
 * メールの配信停止を管理画面へ表示するかを決める。
 * LINEで通知できる間はスタッフへ通知が届くため、配信停止の表示は出さない。
 */
export function shouldShowEmailSuppression(args: { isEmailSuppressed: boolean; canNotifyByLine: boolean }): boolean {
  return args.isEmailSuppressed && !args.canNotifyByLine;
}
