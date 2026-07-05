import { httpRouter } from "convex/server";
import { query as analyticsDashboardQuery } from "./analyticsDashboard/httpActions";
import { webhookHandler } from "./line/webhook";
import { webhookHandler as resendWebhookHandler } from "./notificationOutbox/resendWebhook";

const http = httpRouter();

http.route({
  path: "/line/webhook",
  method: "POST",
  handler: webhookHandler,
});

http.route({
  path: "/resend/webhook",
  method: "POST",
  handler: resendWebhookHandler,
});

http.route({
  path: "/analytics-dashboard/query",
  method: "POST",
  handler: analyticsDashboardQuery,
});

export default http;
