/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib_config from "../_lib/config.js";
import type * as _lib_dateFormat from "../_lib/dateFormat.js";
import type * as _lib_emailFormat from "../_lib/emailFormat.js";
import type * as _lib_functions from "../_lib/functions.js";
import type * as _lib_lineClient from "../_lib/lineClient.js";
import type * as _lib_lineCta from "../_lib/lineCta.js";
import type * as _lib_lineSignature from "../_lib/lineSignature.js";
import type * as _lib_notification from "../_lib/notification.js";
import type * as _lib_notificationDelivery from "../_lib/notificationDelivery.js";
import type * as _lib_notificationDeliveryQueries from "../_lib/notificationDeliveryQueries.js";
import type * as _lib_rateLimits from "../_lib/rateLimits.js";
import type * as _lib_resend from "../_lib/resend.js";
import type * as _lib_time from "../_lib/time.js";
import type * as _lib_uuid from "../_lib/uuid.js";
import type * as _lib_validation from "../_lib/validation.js";
import type * as _test_scenarioBuilders from "../_test/scenarioBuilders.js";
import type * as _test_scenarioFixtures from "../_test/scenarioFixtures.js";
import type * as _test_seed from "../_test/seed.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as dashboard_queries from "../dashboard/queries.js";
import type * as http from "../http.js";
import type * as legal_actions from "../legal/actions.js";
import type * as legal_documents from "../legal/documents.js";
import type * as legal_mutations from "../legal/mutations.js";
import type * as legal_queries from "../legal/queries.js";
import type * as legal_service from "../legal/service.js";
import type * as line_actions from "../line/actions.js";
import type * as line_mutations from "../line/mutations.js";
import type * as line_queries from "../line/queries.js";
import type * as line_schemas from "../line/schemas.js";
import type * as line_service from "../line/service.js";
import type * as line_webhook from "../line/webhook.js";
import type * as migrations_index from "../migrations/index.js";
import type * as migrations_m001_recruitments_add_shift_times from "../migrations/m001_recruitments_add_shift_times.js";
import type * as notification_actions from "../notification/actions.js";
import type * as notification_mutations from "../notification/mutations.js";
import type * as notification_queries from "../notification/queries.js";
import type * as notification_reminderActions from "../notification/reminderActions.js";
import type * as notification_reminderQueries from "../notification/reminderQueries.js";
import type * as notification_templates from "../notification/templates.js";
import type * as position_service from "../position/service.js";
import type * as recruitment_mutations from "../recruitment/mutations.js";
import type * as recruitment_schemas from "../recruitment/schemas.js";
import type * as setup_mutations from "../setup/mutations.js";
import type * as setup_schemas from "../setup/schemas.js";
import type * as shiftBoard_mutations from "../shiftBoard/mutations.js";
import type * as shiftBoard_queries from "../shiftBoard/queries.js";
import type * as shiftReminder_mutations from "../shiftReminder/mutations.js";
import type * as shiftSubmission_mutations from "../shiftSubmission/mutations.js";
import type * as shiftSubmission_queries from "../shiftSubmission/queries.js";
import type * as shiftSubmission_schemas from "../shiftSubmission/schemas.js";
import type * as shiftView_queries from "../shiftView/queries.js";
import type * as shop_mutations from "../shop/mutations.js";
import type * as staff_mutations from "../staff/mutations.js";
import type * as staff_schemas from "../staff/schemas.js";
import type * as staffAuth_mutations from "../staffAuth/mutations.js";
import type * as staffAuth_queries from "../staffAuth/queries.js";
import type * as staffAuth_schemas from "../staffAuth/schemas.js";
import type * as testing from "../testing.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/config": typeof _lib_config;
  "_lib/dateFormat": typeof _lib_dateFormat;
  "_lib/emailFormat": typeof _lib_emailFormat;
  "_lib/functions": typeof _lib_functions;
  "_lib/lineClient": typeof _lib_lineClient;
  "_lib/lineCta": typeof _lib_lineCta;
  "_lib/lineSignature": typeof _lib_lineSignature;
  "_lib/notification": typeof _lib_notification;
  "_lib/notificationDelivery": typeof _lib_notificationDelivery;
  "_lib/notificationDeliveryQueries": typeof _lib_notificationDeliveryQueries;
  "_lib/rateLimits": typeof _lib_rateLimits;
  "_lib/resend": typeof _lib_resend;
  "_lib/time": typeof _lib_time;
  "_lib/uuid": typeof _lib_uuid;
  "_lib/validation": typeof _lib_validation;
  "_test/scenarioBuilders": typeof _test_scenarioBuilders;
  "_test/scenarioFixtures": typeof _test_scenarioFixtures;
  "_test/seed": typeof _test_seed;
  constants: typeof constants;
  crons: typeof crons;
  "dashboard/queries": typeof dashboard_queries;
  http: typeof http;
  "legal/actions": typeof legal_actions;
  "legal/documents": typeof legal_documents;
  "legal/mutations": typeof legal_mutations;
  "legal/queries": typeof legal_queries;
  "legal/service": typeof legal_service;
  "line/actions": typeof line_actions;
  "line/mutations": typeof line_mutations;
  "line/queries": typeof line_queries;
  "line/schemas": typeof line_schemas;
  "line/service": typeof line_service;
  "line/webhook": typeof line_webhook;
  "migrations/index": typeof migrations_index;
  "migrations/m001_recruitments_add_shift_times": typeof migrations_m001_recruitments_add_shift_times;
  "notification/actions": typeof notification_actions;
  "notification/mutations": typeof notification_mutations;
  "notification/queries": typeof notification_queries;
  "notification/reminderActions": typeof notification_reminderActions;
  "notification/reminderQueries": typeof notification_reminderQueries;
  "notification/templates": typeof notification_templates;
  "position/service": typeof position_service;
  "recruitment/mutations": typeof recruitment_mutations;
  "recruitment/schemas": typeof recruitment_schemas;
  "setup/mutations": typeof setup_mutations;
  "setup/schemas": typeof setup_schemas;
  "shiftBoard/mutations": typeof shiftBoard_mutations;
  "shiftBoard/queries": typeof shiftBoard_queries;
  "shiftReminder/mutations": typeof shiftReminder_mutations;
  "shiftSubmission/mutations": typeof shiftSubmission_mutations;
  "shiftSubmission/queries": typeof shiftSubmission_queries;
  "shiftSubmission/schemas": typeof shiftSubmission_schemas;
  "shiftView/queries": typeof shiftView_queries;
  "shop/mutations": typeof shop_mutations;
  "staff/mutations": typeof staff_mutations;
  "staff/schemas": typeof staff_schemas;
  "staffAuth/mutations": typeof staffAuth_mutations;
  "staffAuth/queries": typeof staffAuth_queries;
  "staffAuth/schemas": typeof staffAuth_schemas;
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
