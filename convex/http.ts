import { httpRouter } from "convex/server";
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

export default http;
