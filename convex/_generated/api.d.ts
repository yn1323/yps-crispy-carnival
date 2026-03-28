/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib_functions from "../_lib/functions.js";
import type * as _lib_time from "../_lib/time.js";
import type * as _lib_validation from "../_lib/validation.js";
import type * as dashboard_queries from "../dashboard/queries.js";
import type * as recruitment_mutations from "../recruitment/mutations.js";
import type * as recruitment_schemas from "../recruitment/schemas.js";
import type * as setup_mutations from "../setup/mutations.js";
import type * as setup_schemas from "../setup/schemas.js";
import type * as staff_mutations from "../staff/mutations.js";
import type * as staff_schemas from "../staff/schemas.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/functions": typeof _lib_functions;
  "_lib/time": typeof _lib_time;
  "_lib/validation": typeof _lib_validation;
  "dashboard/queries": typeof dashboard_queries;
  "recruitment/mutations": typeof recruitment_mutations;
  "recruitment/schemas": typeof recruitment_schemas;
  "setup/mutations": typeof setup_mutations;
  "setup/schemas": typeof setup_schemas;
  "staff/mutations": typeof staff_mutations;
  "staff/schemas": typeof staff_schemas;
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

export declare const components: {};
