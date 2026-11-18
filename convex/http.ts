import { httpRouter } from "convex/server";
import { options as accountDeletionOptions, requestAccountDeletion } from "./accountDeletion/httpActions";
import {
  mutation as analyticsDashboardMutation,
  query as analyticsDashboardQuery,
} from "./analyticsDashboard/httpActions";
import { options as contactOptions, submit as contactSubmit } from "./contact/httpActions";
import { webhookHandler } from "./line/webhook";
import { webhookHandler as resendWebhookHandler } from "./notificationOutbox/resendWebhook";
import { webhookHandler as stripeWebhookHandler } from "./organizationStripe/webhook";
import {
  options as staffRegistrationOptions,
  confirm as staffRegistrationVerificationConfirm,
  resend as staffRegistrationVerificationResend,
  start as staffRegistrationVerificationStart,
} from "./staffRegistration/httpActions";

const http = httpRouter();

http.route({
  path: "/account-deletion/request",
  method: "OPTIONS",
  handler: accountDeletionOptions,
});

http.route({
  path: "/account-deletion/request",
  method: "POST",
  handler: requestAccountDeletion,
});

http.route({
  path: "/line/webhook",
  method: "POST",
  handler: webhookHandler,
});

http.route({
  path: "/contact/submit",
  method: "OPTIONS",
  handler: contactOptions,
});

// スタッフ参加申請は、確認コードの送信、照合、再送の3つの入口で受け付ける。
http.route({
  path: "/staff-registration/verification/start",
  method: "OPTIONS",
  handler: staffRegistrationOptions,
});

http.route({
  path: "/staff-registration/verification/start",
  method: "POST",
  handler: staffRegistrationVerificationStart,
});

http.route({
  path: "/staff-registration/verification/confirm",
  method: "OPTIONS",
  handler: staffRegistrationOptions,
});

http.route({
  path: "/staff-registration/verification/confirm",
  method: "POST",
  handler: staffRegistrationVerificationConfirm,
});

http.route({
  path: "/staff-registration/verification/resend",
  method: "OPTIONS",
  handler: staffRegistrationOptions,
});

http.route({
  path: "/staff-registration/verification/resend",
  method: "POST",
  handler: staffRegistrationVerificationResend,
});

http.route({
  path: "/contact/submit",
  method: "POST",
  handler: contactSubmit,
});

http.route({
  path: "/resend/webhook",
  method: "POST",
  handler: resendWebhookHandler,
});

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: stripeWebhookHandler,
});

http.route({
  path: "/analytics-dashboard/query",
  method: "POST",
  handler: analyticsDashboardQuery,
});

http.route({
  path: "/analytics-dashboard/mutation",
  method: "POST",
  handler: analyticsDashboardMutation,
});

export default http;
