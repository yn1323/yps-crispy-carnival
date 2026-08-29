export const legacyHelpGuideRedirects = {
  "add-staff": "/help/tasks/staff-management",
  "apply-previous-shift-request": "/help/tasks/shift-submission",
  "build-and-confirm-shift": "/help/tasks/shift-building",
  "reset-password": "/help/tasks/troubleshooting",
  "run-shift-management-cycle": "/help/scenarios/shift-management",
  "start-shift-management": "/help/scenarios/shift-management",
  "submit-shift-request": "/help/tasks/shift-submission",
  "troubleshoot-notification-delivery": "/help/tasks/notifications",
} as const;

export function resolveLegacyHelpGuideHref(slug: string): string | undefined {
  return legacyHelpGuideRedirects[slug as keyof typeof legacyHelpGuideRedirects];
}
