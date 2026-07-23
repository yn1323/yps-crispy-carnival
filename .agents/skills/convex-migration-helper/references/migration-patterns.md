# Migration Patterns Reference

Common migration patterns, zero-downtime strategies, and verification techniques
for Convex schema and data migrations.

## Contents

- Adding a Required Field
- Deleting a Field
- Changing a Field Type
- Splitting Nested Data Into a Separate Table
- Cleaning Up Orphaned Documents
- Zero-Downtime Strategies
- Bounded Migrations
- Verifying a Migration

## Adding a Required Field

```typescript
// Deploy 1: Schema allows both states
users: defineTable({
  name: v.string(),
  role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
}).index("by_role", ["role"]);

// Migration: backfill the field
export const addDefaultRole = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    if (user.role === undefined) {
      await ctx.db.patch(user._id, { role: "user" });
    }
  },
});

// Deploy 2: After migration completes, make it required
users: defineTable({
  name: v.string(),
  role: v.union(v.literal("user"), v.literal("admin")),
});
```

## Deleting a Field

Mark the field optional first, migrate data to remove it, then remove from
schema:

```typescript
// Deploy 1: Make optional
// isPro: v.boolean()  -->  isPro: v.optional(v.boolean())

// Migration
export const removeIsPro = migrations.define({
  table: "teams",
  migrateOne: async (ctx, team) => {
    if (team.isPro !== undefined) {
      await ctx.db.patch(team._id, { isPro: undefined });
    }
  },
});

// Deploy 2: Remove isPro from schema entirely
```

## Changing a Field Type

Prefer creating a new field. You can combine adding and deleting in one
migration:

```typescript
// Deploy 1: Add new field, keep old field optional
// isPro: v.boolean()  -->  isPro: v.optional(v.boolean()), plan: v.optional(...)

// Migration: convert old field to new field
export const convertToEnum = migrations.define({
  table: "teams",
  migrateOne: async (ctx, team) => {
    if (team.plan === undefined) {
      await ctx.db.patch(team._id, {
        plan: team.isPro ? "pro" : "basic",
        isPro: undefined,
      });
    }
  },
});

// Deploy 2: Remove isPro from schema, make plan required
```

## Splitting Nested Data Into a Separate Table

```typescript
export const extractPreferences = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    if (user.preferences === undefined) return;

    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!existing) {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        ...user.preferences,
      });
    }

    await ctx.db.patch(user._id, { preferences: undefined });
  },
});
```

Make sure your code is already writing to the new `userPreferences` table for
new users before running this migration, so you don't miss documents created
during the migration window.

## Cleaning Up Orphaned Documents

```typescript
export const deleteOrphanedEmbeddings = migrations.define({
  table: "embeddings",
  migrateOne: async (ctx, doc) => {
    const chunk = await ctx.db
      .query("chunks")
      .withIndex("by_embedding", (q) => q.eq("embeddingId", doc._id))
      .first();

    if (!chunk) {
      await ctx.db.delete(doc._id);
    }
  },
});
```

## Zero-Downtime Strategies

During the migration window, your app must handle both old and new data formats.
There are two main strategies.

### Dual Write (Preferred)

Write to both old and new structures. Read from the old structure until
migration is complete.

1. Deploy code that writes both formats, reads old format
2. Run migration on existing data
3. Deploy code that reads new format, still writes both
4. Deploy code that only reads and writes new format

This is preferred because you can safely roll back at any point, the old format
is always up to date.

```typescript
// Bad: only writing to new structure before migration is done
export const createTeam = mutation({
  args: { name: v.string(), isPro: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.insert("teams", {
      name: args.name,
      plan: args.isPro ? "pro" : "basic",
    });
  },
});

// Good: writing to both structures during migration
export const createTeam = mutation({
  args: { name: v.string(), isPro: v.boolean() },
  handler: async (ctx, args) => {
    const plan = args.isPro ? "pro" : "basic";
    await ctx.db.insert("teams", {
      name: args.name,
      isPro: args.isPro,
      plan,
    });
  },
});
```

### Dual Read

Read both formats. Write only the new format.

1. Deploy code that reads both formats (preferring new), writes only new format
2. Run migration on existing data
3. Deploy code that reads and writes only new format

This avoids duplicating writes, which is useful when having two copies of data
could cause inconsistencies. The downside is that rolling back to before step 1
is harder, since new documents only have the new format.

```typescript
// Good: reading both formats, preferring new
function getTeamPlan(team: Doc<"teams">): "basic" | "pro" {
  if (team.plan !== undefined) return team.plan;
  return team.isPro ? "pro" : "basic";
}
```

## Bounded Migrations

Do not choose a single-mutation backfill from a rough document-count threshold.
Check the current Convex read, write, bandwidth, and execution limits, then
measure the actual table volume and expected growth.

Use the migrations component or indexed pagination when the full data set is not
provably bounded well below every applicable limit. A snapshot count alone is
not a durable bound. If a table has a schema-level or business invariant that
keeps it bounded, document that invariant and still leave enough headroom for
retries and concurrent writes.

Avoid unbounded `.collect()` in migration code. Prefer resumable batches with a
cursor, progress reporting, idempotent updates, and a separate completion check.

## Verifying a Migration

Query to check remaining unmigrated documents:

```typescript
import { query } from "./_generated/server";

export const verifyMigration = query({
  handler: async (ctx) => {
    const remaining = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", undefined))
      .take(10);

    return {
      complete: remaining.length === 0,
      sampleRemaining: remaining.map((u) => u._id),
    };
  },
});
```

Or use the component's built-in status monitoring:

```bash
npx convex run --component migrations lib:getStatus --watch
```
