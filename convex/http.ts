import { httpRouter } from "convex/server";
import { webhookHandler } from "./line/webhook";

const http = httpRouter();

http.route({
  path: "/line/webhook",
  method: "POST",
  handler: webhookHandler,
});

export default http;
