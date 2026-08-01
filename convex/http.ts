import { httpRouter } from "convex/server";
import { options as accountDeletionOptions, requestAccountDeletion } from "./accountDeletion/httpActions";
import { query as analyticsDashboardQuery } from "./analyticsDashboard/httpActions";
import { options as contactOptions, submit as contactSubmit } from "./contact/httpActions";
import { webhookHandler } from "./line/webhook";
import { webhookHandler as resendWebhookHandler } from "./notificationOutbox/resendWebhook";
import { webhookHandler as stripeWebhookHandler } from "./organizationStripe/webhook";
import {
  options as staffRegistrationOptions,
  submit as staffRegistrationSubmit,
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

http.route({
  path: "/staff-registration/submit",
  method: "OPTIONS",
  handler: staffRegistrationOptions,
});

http.route({
  path: "/staff-registration/submit",
  method: "POST",
  handler: staffRegistrationSubmit,
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

export default http;
