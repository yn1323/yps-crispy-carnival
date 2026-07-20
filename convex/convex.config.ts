import migrations from "@convex-dev/migrations/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    APP_URL: v.optional(v.string()),
    CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    CLERK_SECRET_KEY: v.optional(v.string()),
    VITE_CLERK_PUBLISHABLE_KEY: v.optional(v.string()),
    STRIPE_BILLING_MODE: v.optional(v.string()),
    STRIPE_SECRET_KEY: v.optional(v.string()),
    STRIPE_WEBHOOK_SECRET: v.optional(v.string()),
    STRIPE_PRO_PRICE_ID: v.optional(v.string()),
    STRIPE_PORTAL_CONFIGURATION_ID: v.optional(v.string()),
  },
});
app.use(migrations);
export default app;
