import migrations from "@convex-dev/migrations/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    APP_URL: v.optional(v.string()),
    CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    CLERK_SECRET_KEY: v.optional(v.string()),
    VITE_CLERK_PUBLISHABLE_KEY: v.optional(v.string()),
    DEBUG_TRIAL_DURATION_DAYS: v.optional(v.string()),
    DEBUG_TRIAL_DURATION_DEPLOYMENT_URL: v.optional(v.string()),
    DEVELOPMENT_SEED_ENABLED: v.optional(v.string()),
    DEVELOPMENT_SEED_DEPLOYMENT_URL: v.optional(v.string()),
    NOTIFICATION_DELIVERY_MODE: v.optional(v.string()),
    STRIPE_SECRET_KEY: v.optional(v.string()),
    STRIPE_WEBHOOK_SECRET: v.optional(v.string()),
    STRIPE_STANDARD_PRICE_ID: v.optional(v.string()),
    STRIPE_PRO_PRICE_ID: v.optional(v.string()),
    STRIPE_PORTAL_CONFIGURATION_ID: v.optional(v.string()),
    ANALYTICS_DEPLOYMENT_LABEL: v.optional(v.string()),
    ANALYTICS_EXPECTED_REVISION: v.optional(v.string()),
    ANALYTICS_SOURCE_CAPTURE_START_AT: v.optional(v.string()),
    ANALYTICS_RESET_ENABLED_UNTIL: v.optional(v.string()),
    ANALYTICS_NIGHTLY_CRON_ENABLED: v.optional(v.string()),
  },
});
app.use(migrations);
export default app;
