import type { SubmissionData } from "./SubmitFormView";

export const submitStoryBaseData: SubmissionData = {
  shopName: "居酒屋さくら",
  staffName: "田中太郎",
  periodStart: "2026-04-07",
  periodEnd: "2026-04-13",
  deadline: "2026-04-04",
  shopClosedDates: [],
  isBeforeDeadline: true,
  hasSubmitted: false,
  existingRequests: [],
  legalConsentRequired: false,
  legalDocuments: {
    terms: {
      title: "スタッフ向け利用規約",
      documentVersion: "staff-terms-doc-2026-05-09",
      requiredConsentVersion: "staff-terms-consent-2026-05-09",
      path: "/terms/staff",
    },
    privacy: {
      title: "スタッフ向けプライバシーポリシー",
      documentVersion: "staff-privacy-doc-2026-05-09",
      requiredConsentVersion: "staff-privacy-consent-2026-05-09",
      path: "/privacy/staff",
    },
  },
  timeRange: { startTime: "09:00", endTime: "22:00" },
  previousWeeklyPattern: null,
};

export const submittedRequests = [
  { date: "2026-04-07", startTime: "09:00", endTime: "18:00" },
  { date: "2026-04-09", startTime: "10:00", endTime: "15:00" },
  { date: "2026-04-11", startTime: "09:00", endTime: "22:00" },
];

export const previousWeeklyPattern = {
  sourceWeekStart: "2026-03-30",
  days: [
    { weekday: 1, startTime: "09:00", endTime: "17:00" },
    { weekday: 3, startTime: "10:00", endTime: "18:00" },
    { weekday: 5, startTime: "12:00", endTime: "21:00" },
  ],
};
