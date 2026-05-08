/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib_dateFormat from "../_lib/dateFormat.js";
import type * as _lib_functions from "../_lib/functions.js";
import type * as _lib_lineClient from "../_lib/lineClient.js";
import type * as _lib_lineCta from "../_lib/lineCta.js";
import type * as _lib_lineSignature from "../_lib/lineSignature.js";
import type * as _lib_notification from "../_lib/notification.js";
import type * as _lib_notificationDelivery from "../_lib/notificationDelivery.js";
import type * as _lib_rateLimits from "../_lib/rateLimits.js";
import type * as _lib_resend from "../_lib/resend.js";
import type * as _lib_time from "../_lib/time.js";
import type * as _lib_uuid from "../_lib/uuid.js";
import type * as _lib_validation from "../_lib/validation.js";
import type * as crons from "../crons.js";
import type * as dashboard_queries from "../dashboard/queries.js";
import type * as email_actions from "../email/actions.js";
import type * as email_mutations from "../email/mutations.js";
import type * as email_queries from "../email/queries.js";
import type * as email_templates from "../email/templates.js";
import type * as http from "../http.js";
import type * as legal_actions from "../legal/actions.js";
import type * as legal_documents from "../legal/documents.js";
import type * as legal_mutations from "../legal/mutations.js";
import type * as legal_queries from "../legal/queries.js";
import type * as line_actions from "../line/actions.js";
import type * as line_mutations from "../line/mutations.js";
import type * as line_queries from "../line/queries.js";
import type * as line_schemas from "../line/schemas.js";
import type * as line_webhook from "../line/webhook.js";
import type * as migrations_index from "../migrations/index.js";
import type * as migrations_m001_recruitments_add_shift_times from "../migrations/m001_recruitments_add_shift_times.js";
import type * as recruitment_mutations from "../recruitment/mutations.js";
import type * as recruitment_schemas from "../recruitment/schemas.js";
import type * as setup_mutations from "../setup/mutations.js";
import type * as setup_schemas from "../setup/schemas.js";
import type * as shiftBoard_mutations from "../shiftBoard/mutations.js";
import type * as shiftBoard_queries from "../shiftBoard/queries.js";
import type * as shiftReminder_actions from "../shiftReminder/actions.js";
import type * as shiftReminder_mutations from "../shiftReminder/mutations.js";
import type * as shiftReminder_queries from "../shiftReminder/queries.js";
import type * as shiftSubmission_mutations from "../shiftSubmission/mutations.js";
import type * as shiftSubmission_queries from "../shiftSubmission/queries.js";
import type * as shiftSubmission_schemas from "../shiftSubmission/schemas.js";
import type * as shop_mutations from "../shop/mutations.js";
import type * as staffAuth_mutations from "../staffAuth/mutations.js";
import type * as staffAuth_queries from "../staffAuth/queries.js";
import type * as staffAuth_schemas from "../staffAuth/schemas.js";
import type * as staff_mutations from "../staff/mutations.js";
import type * as staff_schemas from "../staff/schemas.js";
import type * as testing from "../testing.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/dateFormat": typeof _lib_dateFormat;
  "_lib/functions": typeof _lib_functions;
  "_lib/lineClient": typeof _lib_lineClient;
  "_lib/lineCta": typeof _lib_lineCta;
  "_lib/lineSignature": typeof _lib_lineSignature;
  "_lib/notification": typeof _lib_notification;
  "_lib/notificationDelivery": typeof _lib_notificationDelivery;
  "_lib/rateLimits": typeof _lib_rateLimits;
  "_lib/resend": typeof _lib_resend;
  "_lib/time": typeof _lib_time;
  "_lib/uuid": typeof _lib_uuid;
  "_lib/validation": typeof _lib_validation;
  crons: typeof crons;
  "dashboard/queries": typeof dashboard_queries;
  "email/actions": typeof email_actions;
  "email/mutations": typeof email_mutations;
  "email/queries": typeof email_queries;
  "email/templates": typeof email_templates;
  http: typeof http;
  "legal/actions": typeof legal_actions;
  "legal/documents": typeof legal_documents;
  "legal/mutations": typeof legal_mutations;
  "legal/queries": typeof legal_queries;
  "line/actions": typeof line_actions;
  "line/mutations": typeof line_mutations;
  "line/queries": typeof line_queries;
  "line/schemas": typeof line_schemas;
  "line/webhook": typeof line_webhook;
  "migrations/index": typeof migrations_index;
  "migrations/m001_recruitments_add_shift_times": typeof migrations_m001_recruitments_add_shift_times;
  "recruitment/mutations": typeof recruitment_mutations;
  "recruitment/schemas": typeof recruitment_schemas;
  "setup/mutations": typeof setup_mutations;
  "setup/schemas": typeof setup_schemas;
  "shiftBoard/mutations": typeof shiftBoard_mutations;
  "shiftBoard/queries": typeof shiftBoard_queries;
  "shiftReminder/actions": typeof shiftReminder_actions;
  "shiftReminder/mutations": typeof shiftReminder_mutations;
  "shiftReminder/queries": typeof shiftReminder_queries;
  "shiftSubmission/mutations": typeof shiftSubmission_mutations;
  "shiftSubmission/queries": typeof shiftSubmission_queries;
  "shiftSubmission/schemas": typeof shiftSubmission_schemas;
  "shop/mutations": typeof shop_mutations;
  "staffAuth/mutations": typeof staffAuth_mutations;
  "staffAuth/queries": typeof staffAuth_queries;
  "staffAuth/schemas": typeof staffAuth_schemas;
  "staff/mutations": typeof staff_mutations;
  "staff/schemas": typeof staff_schemas;
  testing: typeof testing;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
