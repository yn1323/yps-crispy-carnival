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
import type * as _lib_rateLimits from "../_lib/rateLimits.js";
import type * as _lib_resend from "../_lib/resend.js";
import type * as _lib_time from "../_lib/time.js";
import type * as _lib_uuid from "../_lib/uuid.js";
import type * as _lib_validation from "../_lib/validation.js";
import type * as dashboard_queries from "../dashboard/queries.js";
import type * as email_actions from "../email/actions.js";
import type * as email_mutations from "../email/mutations.js";
import type * as email_queries from "../email/queries.js";
import type * as email_templates from "../email/templates.js";
import type * as migrations_index from "../migrations/index.js";
import type * as migrations_m001_recruitments_add_shift_times from "../migrations/m001_recruitments_add_shift_times.js";
import type * as recruitment_mutations from "../recruitment/mutations.js";
import type * as recruitment_schemas from "../recruitment/schemas.js";
import type * as setup_mutations from "../setup/mutations.js";
import type * as setup_schemas from "../setup/schemas.js";
import type * as shiftBoard_mutations from "../shiftBoard/mutations.js";
import type * as shiftBoard_queries from "../shiftBoard/queries.js";
import type * as shiftSubmission_mutations from "../shiftSubmission/mutations.js";
import type * as shiftSubmission_queries from "../shiftSubmission/queries.js";
import type * as shiftSubmission_schemas from "../shiftSubmission/schemas.js";
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
  "_lib/dateFormat": typeof _lib_dateFormat;
  "_lib/functions": typeof _lib_functions;
  "_lib/rateLimits": typeof _lib_rateLimits;
  "_lib/resend": typeof _lib_resend;
  "_lib/time": typeof _lib_time;
  "_lib/uuid": typeof _lib_uuid;
  "_lib/validation": typeof _lib_validation;
  "dashboard/queries": typeof dashboard_queries;
  "email/actions": typeof email_actions;
  "email/mutations": typeof email_mutations;
  "email/queries": typeof email_queries;
  "email/templates": typeof email_templates;
  "migrations/index": typeof migrations_index;
  "migrations/m001_recruitments_add_shift_times": typeof migrations_m001_recruitments_add_shift_times;
  "recruitment/mutations": typeof recruitment_mutations;
  "recruitment/schemas": typeof recruitment_schemas;
  "setup/mutations": typeof setup_mutations;
  "setup/schemas": typeof setup_schemas;
  "shiftBoard/mutations": typeof shiftBoard_mutations;
  "shiftBoard/queries": typeof shiftBoard_queries;
  "shiftSubmission/mutations": typeof shiftSubmission_mutations;
  "shiftSubmission/queries": typeof shiftSubmission_queries;
  "shiftSubmission/schemas": typeof shiftSubmission_schemas;
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
