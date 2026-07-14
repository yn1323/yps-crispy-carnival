# Function Budget

Use these rules when functions are hitting execution limits, transaction size
errors, or returning excessively large payloads to the client.

## Core Principle

Convex functions run inside transactions with budgets for time, reads, and
writes. Staying well within these limits is not just about avoiding errors, it
reduces latency and contention.

## Limits to Know

These are the current values from the
[Convex limits docs](https://docs.convex.dev/production/state/limits). Check
that page for the latest numbers.

| Resource                          | Limit                                                 |
| --------------------------------- | ----------------------------------------------------- |
| Query/mutation execution time     | 1 second (user code only, excludes DB operations)     |
| Action execution time             | 10 minutes                                            |
| Data read per transaction         | 16 MiB                                                |
| Data written per transaction      | 16 MiB                                                |
| Documents scanned per transaction | 32,000 (includes documents filtered out by `.filter`) |
| Index ranges read per transaction | 4,096 (each `db.get` and `db.query` call)             |
| Documents written per transaction | 16,000                                                |
| Individual document size          | 1 MiB                                                 |
| Function return value size        | 16 MiB                                                |

## Symptoms

- "Function execution took too long" errors
- "Transaction too large" or read/write set size errors
- Slow queries that read many documents
- Client receiving large payloads that slow down page load
- `npx convex insights --details` showing high bytes read

## Common Causes

### Unbounded collection

A query that calls `.collect()` on a table without a reasonable limit. As the
table grows, the query reads more and more documents.

Passing a caller-controlled count directly to `.take(count)` is also unbounded.

For native pagination, `paginationOpts.numItems` is only the initial page-size
target. Reactive pagination may return a different number of items, so a
validated `numItems` is not a hard result limit.

### Silent truncation

A fixed `.take(limit)` inside a count or analytics job can stay within function
budgets while returning an incomplete value as if it were exact.

Choose one contract:

- maintain an exact counter on writes, or use a resumable cursor-based job that
  persists its accumulator across bounded invocations
- enforce the same hard maximum on writes when the cap is a product invariant
- return or persist `isTruncated`, `lowerBound`, and the applied limit when the
  capped result is intentional

### Large document reads on hot paths

Reading documents with large fields (rich text, embedded media references, long
arrays) when only a small subset of the data is needed for the current view.

### Mutation doing too much work

A single mutation that updates hundreds of documents, backfills data, or
rebuilds derived state in one transaction.

### Returning too much data to the client

A query returning full documents when the client only needs a few fields.

## Fix Order

### 1. Bound your reads

Never `.collect()` without a limit on a table that can grow unbounded.

```ts
// Bad: unbounded read, breaks as the table grows
const messages = await ctx.db.query("messages").collect();
```

```ts
// Good: fixed, server-owned limit
const messages = await ctx.db
  .query("messages")
  .withIndex("by_channel", (q) => q.eq("channelId", channelId))
  .order("desc")
  .take(50);
```

Reject unreasonable caller-controlled `.take()` counts and pagination targets
or read budgets where appropriate. For Convex native pagination, do not treat
`numItems` as a hard result cap. Validate with `paginationOptsValidator` and
pass `args.paginationOpts` unchanged to `.paginate()` so `endCursor`,
`maximumRowsRead`, `maximumBytesRead`, and `id` retain their native behavior.

### 2. Read smaller shapes

If the list page only needs title, author, and date, do not read full documents
with rich content fields.

Use digest or summary tables for hot list pages. See `hot-path-rules.md` for the
digest table pattern.

### 3. Break large mutations into batches

If a mutation needs to update hundreds of documents, split it into a
self-scheduling chain.

```ts
// Bad: one mutation updating every row
export const backfillAll = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const docs = await ctx.db.query("items").collect();
    for (const doc of docs) {
      await ctx.db.patch(doc._id, { newField: computeValue(doc) });
    }
    return null;
  },
});
```

```ts
// Good: cursor-based batch processing
export const backfillBatch = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("items")
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });

    for (const doc of result.page) {
      if (doc.newField === undefined) {
        await ctx.db.patch(doc._id, { newField: computeValue(doc) });
      }
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.items.backfillBatch, {
        cursor: result.continueCursor,
      });
    }

    return null;
  },
});
```

### 4. Move heavy work to actions

Queries and mutations run inside Convex's transactional runtime with strict
budgets. If you need to do CPU-intensive computation, call external APIs, or
process large files, use an action instead.

Actions run outside the transaction and can call mutations to write results
back. In Shiftori, persist the authenticated request intent first and schedule
an `internalAction`. A raw public action still needs the documented allowlist,
authentication or capability checks, rate limits, and idempotency contract.

```ts
// Bad: heavy computation inside a mutation
export const processUpload = mutation({
  args: { data: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = expensiveComputation(args.data);
    await ctx.db.insert("results", result);
    return null;
  },
});
```

```ts
// Good: action for heavy work, mutation for the write
export const processUpload = internalAction({
  args: { data: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = expensiveComputation(args.data);
    await ctx.runMutation(internal.results.store, { result });
    return null;
  },
});
```

### 5. Trim return values

Only return what the client needs. If a query fetches full documents but the
component only renders a few fields, map the results before returning.

```ts
// Bad: returns full documents including large content fields
export const list = query({
  args: {},
  returns: v.array(articleDocumentValidator),
  handler: async (ctx) => {
    return await ctx.db.query("articles").take(20);
  },
});
```

```ts
// Good: project to only the fields the client needs
export const list = query({
  args: {},
  returns: v.array(articleListItemValidator),
  handler: async (ctx) => {
    const articles = await ctx.db.query("articles").take(20);
    return articles.map((a) => ({
      _id: a._id,
      title: a.title,
      author: a.author,
      createdAt: a._creationTime,
    }));
  },
});
```

### 6. Replace `ctx.runQuery` and `ctx.runMutation` with helper functions

Inside queries and mutations, `ctx.runQuery` and `ctx.runMutation` have overhead
compared to calling a plain TypeScript helper function. They run in the same
transaction but pay extra per-call cost.

```ts
// Bad: unnecessary overhead from ctx.runQuery inside a mutation
export const createProject = mutation({
  args: { name: v.string() },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    return await ctx.db.insert("projects", { ...args, ownerId: user._id });
  },
});
```

```ts
// Good: plain helper function, no extra overhead
export const createProject = mutation({
  args: { name: v.string() },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    return await ctx.db.insert("projects", { ...args, ownerId: user._id });
  },
});
```

Exception: components require `ctx.runQuery`/`ctx.runMutation`. Use them there,
but prefer helpers everywhere else.

### 7. Avoid unnecessary `runAction` calls

`runAction` from within an action creates a separate function invocation with
its own memory and CPU budget. The parent action just sits idle waiting. Replace
with a plain TypeScript function call unless you need a different runtime (e.g.
calling Node.js code from the Convex runtime).

```ts
// Bad: runAction overhead for no reason
export const processItems = internalAction({
  args: { items: v.array(itemValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const item of args.items) {
      await ctx.runAction(internal.items.processOne, { item });
    }
    return null;
  },
});
```

```ts
// Good: plain function call
export const processItems = internalAction({
  args: { items: v.array(itemValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const item of args.items) {
      await processOneItem(ctx, { item });
    }
    return null;
  },
});
```

## Verification

1. No function execution or transaction size errors
2. `npx convex insights --details` shows reduced bytes read
3. Large mutations are batched and self-scheduling
4. Client payloads are reasonably sized for the UI they serve
5. `ctx.runQuery`/`ctx.runMutation` in queries and mutations replaced with
   helpers where possible
6. Sibling functions with similar patterns were checked
7. Caller-controlled `.take()` counts and pagination read budgets are validated,
   and `numItems` is not treated as a hard result cap
8. Fixed-cap aggregates expose truncation or are backed by an enforced product
   limit
