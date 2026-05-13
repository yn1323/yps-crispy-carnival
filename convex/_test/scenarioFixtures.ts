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

type ShiftAssignment = ShiftRequest & {
  staffId: Id<"staffs">;
  positionId?: Id<"positions">;
};

type ShopSettingsInput = {
  shopName: string;
  shiftStartTime: string;
  shiftEndTime: string;
};

export function createScenario(t: ScenarioTest) {
  return {
    manager(identity: ManagerIdentity) {
      const asManager = t.withIdentity(typeof identity === "string" ? { subject: identity } : identity);

      return {
        setupShopAndOwner(args: ShopSettingsInput & { ownerName: string; ownerEmail: string; acceptedLegal: true }) {
          return asManager.mutation(api.setup.mutations.setupShopAndOwner, args);
        },
        createRecruitment(args: RecruitmentInput) {
          return asManager.mutation(api.recruitment.mutations.createRecruitment, args);
        },
        deleteRecruitment(recruitmentId: Id<"recruitments">) {
          return asManager.mutation(api.recruitment.mutations.deleteRecruitment, { recruitmentId });
        },
        updateShopSettings(args: ShopSettingsInput) {
          return asManager.mutation(api.shop.mutations.updateShopSettings, args);
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
        getRecruitmentInfo(recruitmentId: Id<"recruitments">) {
          return t.query(api.staffAuth.queries.getRecruitmentInfo, { recruitmentId });
        },
        submitShiftRequests(args: {
          sessionToken: string;
          recruitmentId: Id<"recruitments">;
          acceptedLegal?: boolean;
          requests: ShiftRequest[];
        }) {
          return t.mutation(api.shiftSubmission.mutations.submitShiftRequests, { ...args, accessKind: "submit" });
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
