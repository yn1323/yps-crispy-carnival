import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { todayJST } from "../_lib/dateFormat";
import { generateUUID } from "../_lib/uuid";
import { runInvitationAcceptance } from "../organizationInvitation/acceptanceActions";
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
      const getSelectedOrganizationId = async () => {
        const shopId = await getSelectedShopId();
        return await t.run(async (ctx) => {
          const shop = await ctx.db.get(shopId);
          if (!shop?.organizationId) throw new Error("Scenario organization is not canonical");
          return shop.organizationId;
        });
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
        async createOrganization(args: ShopSettingsInput) {
          return asManager.mutation(api.setup.mutations.createOrganization, {
            shopName: args.shopName,
            submissionPattern: resolveSubmissionPattern(args),
            requestId: generateUUID(),
            sourceShopId: await getSelectedShopId(),
          });
        },
        // 複数組織のシナリオでは、操作対象の店舗を明示して選択中店舗の暗黙解決に依存しない。
        selectShop(shopId: Id<"shops">) {
          selectedShopId = shopId;
        },
        getMyShops() {
          return asManager.query(api.dashboard.queries.getMyShops, {});
        },
        async getOrganizationSettings() {
          return asManager.query(api.organization.queries.getSettings, { shopId: await getSelectedShopId() });
        },
        async addShop(args: ShopSettingsInput) {
          return asManager.mutation(api.organization.mutations.addShop, {
            shopName: args.shopName,
            submissionPattern: resolveSubmissionPattern(args),
            requestId: generateUUID(),
            shopId: await getSelectedShopId(),
          });
        },
        async deleteOrganization() {
          const shopId = await getSelectedShopId();
          const organization = await t.run(async (ctx) => {
            const shop = await ctx.db.get(shopId);
            if (!shop?.organizationId) throw new Error("Scenario organization is not canonical");
            const current = await ctx.db.get(shop.organizationId);
            if (!current) throw new Error("Scenario organization is not found");
            return current;
          });
          return asManager.mutation(api.organization.mutations.deleteOrganization, {
            shopId,
            organizationId: organization._id,
            confirmOrganizationId: organization._id,
            expectedOrganizationUpdatedAt: organization.updatedAt,
            requestId: generateUUID(),
          });
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
          return result.staffIds;
        },
        async inviteStaffAsManager(staffId: Id<"staffs">) {
          const staff = await t.run((ctx) => ctx.db.get(staffId));
          if (
            !staff?.organizationId ||
            !staff.organizationPersonId ||
            staff.shopId !== (await getSelectedShopId()) ||
            staff.organizationId !== (await getSelectedOrganizationId())
          ) {
            throw new Error("Scenario manager invitation target is not canonical");
          }
          return asManager.mutation(api.organizationInvitation.mutations.issueForOrganization, {
            organizationId: await getSelectedOrganizationId(),
            recipient: { kind: "existingStaff", personId: staff.organizationPersonId },
            requestId: generateUUID(),
          });
        },
        async issueExternalManagerInvitation(args: { invitedName: string; email: string }) {
          return asManager.mutation(api.organizationInvitation.mutations.issueForOrganization, {
            organizationId: await getSelectedOrganizationId(),
            recipient: { kind: "external", invitedName: args.invitedName, email: args.email },
            requestId: generateUUID(),
          });
        },
        acceptManagerInvitation(token: string, verifiedEmails: ReadonlySet<string>) {
          return asManager.action(
            async (ctx) =>
              await runInvitationAcceptance(
                ctx,
                {
                  assertReady: async () => undefined,
                  getVerifiedEmails: async () => verifiedEmails,
                },
                {
                  appOrigin: "https://app.example.test",
                  secretKey: "sk_test_scenario",
                  publishableKey: "pk_test_scenario",
                  expectedIssuer: "https://convex.test",
                },
                token,
              ),
          );
        },
        async removeManagerRole(personId: Id<"organizationPeople">) {
          return asManager.mutation(api.organization.mutations.removeManagerRoleForOrganization, {
            organizationId: await getSelectedOrganizationId(),
            personId,
            requestId: generateUUID(),
          });
        },
        async editStaff(args: { staffId: Id<"staffs">; name: string; email: string }) {
          const shopId = await getSelectedShopId();
          const expectedOrganizationId = await getSelectedOrganizationId();
          const personId = await t.run(async (ctx) => {
            const staff = await ctx.db.get(args.staffId);
            if (
              !staff ||
              staff.isDeleted ||
              !staff.organizationPersonId ||
              staff.shopId !== shopId ||
              staff.organizationId !== expectedOrganizationId
            ) {
              throw new Error("Scenario staff profile target is not canonical");
            }
            const person = await ctx.db.get(staff.organizationPersonId);
            if (!person || person.organizationId !== expectedOrganizationId || person.status !== "active") {
              throw new Error("Scenario staff profile target is not canonical");
            }
            return person._id;
          });
          return asManager.mutation(api.organization.mutations.updatePersonProfile, {
            shopId,
            expectedOrganizationId,
            personId,
            name: args.name,
            email: args.email,
            requestId: generateUUID(),
          });
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
        async removePersonFromShop(staffId: Id<"staffs">) {
          return asManager.mutation(api.organization.mutations.removePersonFromShop, {
            staffId,
            shopId: await getSelectedShopId(),
            requestId: generateUUID(),
          });
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
