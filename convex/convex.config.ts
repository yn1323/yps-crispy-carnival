import migrations from "@convex-dev/migrations/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    ACCOUNT_DELETION_ENABLED: v.optional(v.string()),
    APP_URL: v.optional(v.string()),
    CLERK_EXPECTED_INSTANCE_ID: v.optional(v.string()),
    CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    CLERK_PUBLISHABLE_KEY: v.optional(v.string()),
    CLERK_SECRET_KEY: v.optional(v.string()),
  },
});
app.use(migrations);
export default app;
