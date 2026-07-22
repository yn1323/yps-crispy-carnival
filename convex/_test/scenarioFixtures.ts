import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { todayJST } from "../_lib/dateFormat";
import { generateUUID } from "../_lib/uuid";
import type { ScenarioTest } from "./scenarioBuilders";

type ManagerIdentity =
  | string
  | {
      subject: string;
      name?: string;
      email?: string;
      emailVerified?: boolean;
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
      let selectedShopId: Id<"shops"> | null = null;

      // Scenario fixture では単一店舗を選択中店舗として解決し、public API には必ず shopId を明示する。
      const getSelectedShopId = async () => {
        if (selectedShopId) return selectedShopId;
        const [selectedShop] = await asManager.query(api.dashboard.queries.getMyShops, {});
        const shopId = selectedShop?.shopId ?? null;
        if (!shopId) throw new Error("Scenario manager shop is not selected");
        selectedShopId = shopId;
        return shopId;
      };

      return {
        async setupShopAndManager(
          args: ShopSettingsInput & { managerName: string; managerEmail: string; acceptedLegal: true },
        ) {
          const shopId = await asManager.mutation(api.setup.mutations.setupShopAndManager, {
            shopName: args.shopName,
            submissionPattern: resolveSubmissionPattern(args),
            managerName: args.managerName,
            managerEmail: args.managerEmail,
            acceptedLegal: args.acceptedLegal,
          });
          selectedShopId = shopId;
          return shopId;
        },
        async createRecruitment(args: RecruitmentInput) {
          return asManager.mutation(api.recruitment.mutations.createRecruitment, {
            ...args,
            shopClosedDates: args.shopClosedDates ?? [],
            shopId: await getSelectedShopId(),
          });
        },
        async deleteRecruitment(recruitmentId: Id<"recruitments">) {
          return asManager.mutation(api.recruitment.mutations.deleteRecruitment, {
            recruitmentId,
            shopId: await getSelectedShopId(),
          });
        },
        async updateShopSettings(args: UpdateShopSettingsInput) {
          return asManager.mutation(api.shop.mutations.updateShopSettings, {
            shopName: args.shopName,
            regularClosedDays: args.regularClosedDays,
            submissionPattern: resolveSubmissionPattern(args),
            shopId: await getSelectedShopId(),
          });
        },
        async addStaffs(entries: StaffEntry[]) {
          const result = await asManager.mutation(api.staff.mutations.addStaffs, {
            entries,
            requestId: generateUUID(),
            shopId: await getSelectedShopId(),
          });
          if (result.status !== "added") {
            throw new Error("Scenario staff addition unexpectedly requires confirmation");
          }
          return result.staffIds;
        },
        async inviteStaffAsManager(staffId: Id<"staffs">) {
          return asManager.mutation(api.organizationInvitation.mutations.createForStaff, {
            staffId,
            requestId: generateUUID(),
            shopId: await getSelectedShopId(),
          });
        },
        acceptManagerInvitation(token: string) {
          return asManager.mutation(api.organizationInvitation.mutations.accept, { token });
        },
        linkManagerInvitationAccount(token: string) {
          return asManager.mutation(api.organizationInvitation.mutations.linkAccount, { token });
        },
        async removeManagerRole(personId: Id<"organizationPeople">) {
          return asManager.mutation(api.organization.mutations.removeManagerRole, {
            shopId: await getSelectedShopId(),
            personId,
            requestId: generateUUID(),
          });
        },
        async editStaff(args: { staffId: Id<"staffs">; name: string; email: string }) {
          return asManager.mutation(api.staff.mutations.editStaff, { ...args, shopId: await getSelectedShopId() });
        },
        async sendOpenRecruitmentNotifications(staffId: Id<"staffs">) {
          return asManager.mutation(api.staff.mutations.sendOpenRecruitmentNotifications, {
            staffId,
            shopId: await getSelectedShopId(),
          });
        },
        async sendCurrentShiftNotification(staffId: Id<"staffs">) {
          return asManager.mutation(api.staff.mutations.sendCurrentShiftNotification, {
            staffId,
            shopId: await getSelectedShopId(),
          });
        },
        async deleteStaff(staffId: Id<"staffs">) {
          return asManager.mutation(api.staff.mutations.deleteStaff, { staffId, shopId: await getSelectedShopId() });
        },
        async setShiftExclusion(staffId: Id<"staffs">, excluded: boolean) {
          return asManager.mutation(api.staff.mutations.setShiftExclusion, {
            staffId,
            excluded,
            shopId: await getSelectedShopId(),
          });
        },
        async saveShiftAssignments(args: { recruitmentId: Id<"recruitments">; assignments: ShiftAssignment[] }) {
          return asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
            ...args,
            shopId: await getSelectedShopId(),
          });
        },
        async confirmRecruitment(recruitmentId: Id<"recruitments">) {
          return asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
            recruitmentId,
            shopId: await getSelectedShopId(),
          });
        },
        async generateLineLinkToken(staffId: Id<"staffs">) {
          return asManager.mutation(api.line.mutations.generateLinkToken, {
            staffId,
            shopId: await getSelectedShopId(),
          });
        },
        getCurrentUser() {
          return asManager.query(api.dashboard.queries.getCurrentUser, {});
        },
        async getDashboardShop() {
          return asManager.query(api.dashboard.queries.getDashboardShop, { shopId: await getSelectedShopId() });
        },
        async getDashboardStaffs(paginationOpts = { numItems: 20, cursor: null as string | null }) {
          return asManager.query(api.dashboard.queries.getDashboardStaffs, {
            paginationOpts,
            shopId: await getSelectedShopId(),
          });
        },
        async getDashboardRecruitments(paginationOpts = { numItems: 20, cursor: null as string | null }) {
          return asManager.query(api.dashboard.queries.getDashboardRecruitments, {
            paginationOpts,
            shopId: await getSelectedShopId(),
          });
        },
        getManagerConsentStatus() {
          return asManager.query(api.legal.queries.getManagerConsentStatus, {});
        },
        async getShiftBoardData(recruitmentId: Id<"recruitments">, refreshDayKey: string = todayJST()) {
          return asManager.query(api.shiftBoard.queries.getShiftBoardData, {
            recruitmentId,
            shopId: await getSelectedShopId(),
            refreshDayKey,
          });
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
        dispatchWebhookEvents(
          events: Array<{
            type: "follow" | "unfollow";
            userId: string;
            webhookEventId: string;
            timestamp: number;
          }>,
        ) {
          return t.mutation(internal.line.mutations.dispatchWebhookEvents, { events });
        },
      };
    },
  };
}
