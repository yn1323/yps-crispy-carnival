import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ScenarioTest } from "./scenarioBuilders";

type ManagerIdentity =
  | string
  | {
      subject: string;
      name?: string;
      email?: string;
    };

type RecruitmentInput = {
  periodStart: string;
  periodEnd: string;
  deadline: string;
  shopClosedDates?: string[];
};

type StaffEntry = {
  name: string;
  email: string;
};

type ShiftRequest = {
  date: string;
  startTime: string;
  endTime: string;
};

type SubmitShiftSelectionInput =
  | { kind: "time"; requests: ShiftRequest[] }
  | { kind: "dateOnly"; workingDates: string[] }
  | { kind: "shiftType"; selections: Array<{ date: string; optionId: string }> };

type ShiftAssignment = ShiftRequest & {
  staffId: Id<"staffs">;
  positionId?: Id<"positions">;
  optionId?: string;
};

type ShiftSubmissionPattern =
  | { kind: "time"; startTime: string; endTime: string }
  | { kind: "dateOnly" }
  | { kind: "shiftType"; options: ShiftTypeOption[] };

type ShopSettingsInput = {
  shopName: string;
  submissionPattern?: ShiftSubmissionPattern;
};

type UpdateShopSettingsInput = ShopSettingsInput & {
  regularClosedDays: Array<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat">;
};

type ShiftTypeOption = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
};

const resolveSubmissionPattern = (args: ShopSettingsInput): ShiftSubmissionPattern =>
  args.submissionPattern ?? { kind: "time", startTime: "09:00", endTime: "22:00" };

export function createScenario(t: ScenarioTest) {
  return {
    manager(identity: ManagerIdentity) {
      const asManager = t.withIdentity(typeof identity === "string" ? { subject: identity } : identity);

      return {
        setupShopAndManager(
          args: ShopSettingsInput & { managerName: string; managerEmail: string; acceptedLegal: true },
        ) {
          return asManager.mutation(api.setup.mutations.setupShopAndManager, {
            shopName: args.shopName,
            submissionPattern: resolveSubmissionPattern(args),
            managerName: args.managerName,
            managerEmail: args.managerEmail,
            acceptedLegal: args.acceptedLegal,
          });
        },
        createRecruitment(args: RecruitmentInput) {
          return asManager.mutation(api.recruitment.mutations.createRecruitment, {
            ...args,
            shopClosedDates: args.shopClosedDates ?? [],
          });
        },
        deleteRecruitment(recruitmentId: Id<"recruitments">) {
          return asManager.mutation(api.recruitment.mutations.deleteRecruitment, { recruitmentId });
        },
        updateShopSettings(args: UpdateShopSettingsInput) {
          return asManager.mutation(api.shop.mutations.updateShopSettings, {
            shopName: args.shopName,
            regularClosedDays: args.regularClosedDays,
            submissionPattern: resolveSubmissionPattern(args),
          });
        },
        addStaffs(entries: StaffEntry[]) {
          return asManager.mutation(api.staff.mutations.addStaffs, { entries });
        },
        editStaff(args: { staffId: Id<"staffs">; name: string; email: string }) {
          return asManager.mutation(api.staff.mutations.editStaff, args);
        },
        deleteStaff(staffId: Id<"staffs">) {
          return asManager.mutation(api.staff.mutations.deleteStaff, { staffId });
        },
        saveShiftAssignments(args: { recruitmentId: Id<"recruitments">; assignments: ShiftAssignment[] }) {
          return asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, args);
        },
        confirmRecruitment(recruitmentId: Id<"recruitments">) {
          return asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId });
        },
        sendReminderEmails(recruitmentId: Id<"recruitments">) {
          return asManager.mutation(api.shiftReminder.mutations.sendReminderEmails, { recruitmentId });
        },
        generateLineLinkToken(staffId: Id<"staffs">) {
          return asManager.mutation(api.line.mutations.generateLinkToken, { staffId });
        },
        getCurrentUser() {
          return asManager.query(api.dashboard.queries.getCurrentUser, {});
        },
        getDashboardShop() {
          return asManager.query(api.dashboard.queries.getDashboardShop, {});
        },
        getDashboardStaffs(paginationOpts = { numItems: 20, cursor: null as string | null }) {
          return asManager.query(api.dashboard.queries.getDashboardStaffs, { paginationOpts });
        },
        getDashboardRecruitments(paginationOpts = { numItems: 20, cursor: null as string | null }) {
          return asManager.query(api.dashboard.queries.getDashboardRecruitments, { paginationOpts });
        },
        getManagerConsentStatus() {
          return asManager.query(api.legal.queries.getManagerConsentStatus, {});
        },
        getShiftBoardData(recruitmentId: Id<"recruitments">) {
          return asManager.query(api.shiftBoard.queries.getShiftBoardData, { recruitmentId });
        },
      };
    },
    staff() {
      return {
        verifyMagicLink(token: string, accessKind: "submit" | "view" = "submit") {
          return t.mutation(api.staffAuth.mutations.verifyToken, { token, accessKind });
        },
        getSubmissionPageData(args: { sessionToken: string; recruitmentId: Id<"recruitments"> }) {
          return t.query(api.shiftSubmission.queries.getSubmissionPageData, { ...args, accessKind: "submit" });
        },
        async getOkSubmissionPageData(args: { sessionToken: string; recruitmentId: Id<"recruitments"> }) {
          const result = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
            ...args,
            accessKind: "submit",
          });
          if (result.status !== "ok") {
            throw new Error(`expected submission page data, got ${result.status}`);
          }
          return result.data;
        },
        getRecruitmentInfo(recruitmentId: Id<"recruitments">) {
          return t.query(api.staffAuth.queries.getRecruitmentInfo, { recruitmentId });
        },
        submitShiftRequests(args: {
          sessionToken: string;
          recruitmentId: Id<"recruitments">;
          acceptedLegal?: boolean;
          requests?: ShiftRequest[];
          submission?: SubmitShiftSelectionInput;
        }) {
          return t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
            ...args,
            requests: args.requests ?? [],
            accessKind: "submit",
          });
        },
        getShiftViewData(args: { sessionToken: string; recruitmentId: Id<"recruitments"> }) {
          return t.query(api.shiftView.queries.getShiftViewData, { ...args, accessKind: "view" });
        },
        requestReissue(args: { email: string; recruitmentId: Id<"recruitments"> }) {
          return t.mutation(api.staffAuth.mutations.requestReissue, args);
        },
        getStaffConsentPageData(token: string) {
          return t.query(api.legal.queries.getStaffConsentPageData, { token });
        },
        acceptStaffLegalConsent(args: { token: string; acceptedLegal: true }) {
          return t.mutation(api.legal.mutations.acceptStaffLegalConsent, args);
        },
      };
    },
    line() {
      return {
        validateLinkToken(state: string) {
          return t.mutation(internal.line.mutations.validateLinkToken, { state });
        },
        finalizeLinking(args: {
          staffId: Id<"staffs">;
          tokenDocId: Id<"lineLinkTokens">;
          lineUserId: string;
          lineFollowing: boolean;
        }) {
          return t.mutation(internal.line.mutations.finalizeLinking, args);
        },
        dispatchWebhookEvents(events: Array<{ type: "follow" | "unfollow"; userId: string }>) {
          return t.mutation(internal.line.mutations.dispatchWebhookEvents, { events });
        },
      };
    },
  };
}
