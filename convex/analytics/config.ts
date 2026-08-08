import { env } from "../_generated/server";
import { dateJST, jstDayRangeMs } from "../_lib/dateFormat";

type AnalyticsEnv = typeof env & {
  readonly ANALYTICS_DEPLOYMENT_LABEL?: string;
  readonly ANALYTICS_EXPECTED_REVISION?: string;
  readonly ANALYTICS_SOURCE_CAPTURE_START_AT?: string;
  readonly ANALYTICS_RESET_ENABLED_UNTIL?: string;
  readonly ANALYTICS_NIGHTLY_CRON_ENABLED?: string;
};

const analyticsEnv = env as AnalyticsEnv;

function parseOptionalTimestamp(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Operator input is fixed to a JST calendar value; persisted `*At` fields remain Unix ms. */
export function parseAnalyticsSourceCaptureStartAt(value: string | undefined): number | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  if (hour !== "00" || minute !== "00" || second !== "00") return undefined;
  const date = `${year}-${month}-${day}`;
  const startMs = jstDayRangeMs(date).startMs;
  return dateJST(startMs) === date ? startMs : undefined;
}

export function getAnalyticsSourceCaptureStartAt(): number | undefined {
  return parseAnalyticsSourceCaptureStartAt(analyticsEnv.ANALYTICS_SOURCE_CAPTURE_START_AT);
}

export function getAnalyticsResetConfiguration() {
  return {
    deploymentLabel: (analyticsEnv.ANALYTICS_DEPLOYMENT_LABEL ?? "").trim(),
    revision: (analyticsEnv.ANALYTICS_EXPECTED_REVISION ?? "").trim(),
    sourceCaptureStartAt: getAnalyticsSourceCaptureStartAt(),
    enabledUntil: parseOptionalTimestamp(analyticsEnv.ANALYTICS_RESET_ENABLED_UNTIL),
    nightlyCronEnabled: getAnalyticsNightlyCronEnabled(),
  };
}

export function getAnalyticsNightlyCronEnabled(): boolean {
  return analyticsEnv.ANALYTICS_NIGHTLY_CRON_ENABLED?.trim().toLowerCase() === "true";
}
