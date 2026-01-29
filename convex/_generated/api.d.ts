/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as constants from "../constants.js";
import type * as helpers from "../helpers.js";
import type * as invite_mutations from "../invite/mutations.js";
import type * as invite_queries from "../invite/queries.js";
import type * as position_mutations from "../position/mutations.js";
import type * as position_queries from "../position/queries.js";
import type * as requiredStaffing_mutations from "../requiredStaffing/mutations.js";
import type * as requiredStaffing_queries from "../requiredStaffing/queries.js";
import type * as shop_mutations from "../shop/mutations.js";
import type * as shop_queries from "../shop/queries.js";
import type * as staffSkill_mutations from "../staffSkill/mutations.js";
import type * as staffSkill_queries from "../staffSkill/queries.js";
import type * as testing from "../testing.js";
import type * as user_mutations from "../user/mutations.js";
import type * as user_queries from "../user/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  constants: typeof constants;
  helpers: typeof helpers;
  "invite/mutations": typeof invite_mutations;
  "invite/queries": typeof invite_queries;
  "position/mutations": typeof position_mutations;
  "position/queries": typeof position_queries;
  "requiredStaffing/mutations": typeof requiredStaffing_mutations;
  "requiredStaffing/queries": typeof requiredStaffing_queries;
  "shop/mutations": typeof shop_mutations;
  "shop/queries": typeof shop_queries;
  "staffSkill/mutations": typeof staffSkill_mutations;
  "staffSkill/queries": typeof staffSkill_queries;
  testing: typeof testing;
  "user/mutations": typeof user_mutations;
  "user/queries": typeof user_queries;
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
