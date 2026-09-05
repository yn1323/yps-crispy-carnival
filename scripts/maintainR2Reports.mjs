import {
  normalizeReportTarget,
  RETENTION_MS,
  ReportStoreConflictError,
  readReportManifest,
  reportTargetPaths,
} from "./hostedReportStore.mjs";

function targetFromKey(key) {
  const report = /^(?:state\/)?(vrt|playwright)\/pr-([1-9]\d*)(?:\/|\.json$)/.exec(key);
  if (report) return normalizeReportTarget({ reportType: report[1], pullRequest: report[2] });
  const branch = /^(?:(?:state\/)?vrt\/branches\/|baselines\/)(develop|main)(?:\/|\.json$)/.exec(key);
  return branch ? normalizeReportTarget({ reportType: "vrt", sourceBranch: branch[1] }) : null;
}

export async function discoverReportTargets(store) {
  const groups = await Promise.all(["state/", "vrt/", "playwright/", "baselines/"].map((prefix) => store.list(prefix)));
  const targets = new Map();
  for (const object of groups.flat()) {
    const target = targetFromKey(object.key);
    if (target) targets.set(reportTargetPaths(target).manifestKey, target);
  }
  return [...targets.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, target]) => target);
}

async function verifyPullRequest(target, verifySource) {
  if (typeof verifySource !== "function") throw new Error("PR cleanup requires current GitHub state verification");
  const result = await verifySource(target);
  if (!["open", "closed"].includes(result?.status)) throw new Error("Invalid verified PR state");
  return result.status;
}

export async function deleteClosedReport(input, { store, verifySource }) {
  const target = normalizeReportTarget(input);
  if (target.pullRequest === null) throw new Error("Closed report cleanup requires a PR target");
  if ((await verifyPullRequest(target, verifySource)) === "open") return { status: "open", deletedFiles: 0 };
  const paths = reportTargetPaths(target);
  // Validate provenance before removing a state document, even if the PR is already closed.
  await readReportManifest(store, target);
  const objects = await store.list(paths.reportRoot);
  let deletedFiles = 0;
  for (let index = 0; index < objects.length; index += 1_000) {
    if ((await verifyPullRequest(target, verifySource)) === "open") return { status: "open", deletedFiles };
    const keys = objects.slice(index, index + 1_000).map(({ key }) => {
      if (!key.startsWith(paths.reportRoot)) throw new Error("PR deletion escaped its report prefix");
      return key;
    });
    deletedFiles += await store.delete(keys);
  }
  if ((await verifyPullRequest(target, verifySource)) === "open") return { status: "open", deletedFiles };
  if (await store.get(paths.manifestKey)) deletedFiles += await store.delete([paths.manifestKey]);
  return { status: "closed", deletedFiles };
}

export async function recordRetiredBaseline(store, target, baselineKey, now = new Date()) {
  const paths = reportTargetPaths(target);
  if (!paths.baselineRoot || !baselineKey.startsWith(paths.baselineRoot))
    throw new Error("Invalid retired baseline target");
  const generation = baselineKey.slice(paths.baselineRoot.length);
  if (!/^[1-9]\d*-[1-9]\d*\.zip$/.test(generation)) throw new Error("Invalid retired baseline generation");
  const markerKey = `${paths.retiredRoot}${generation.replace(/\.zip$/, ".json")}`;
  const existing = await store.get(markerKey);
  if (existing) return readRetirement(existing, baselineKey);
  const marker = { schemaVersion: 1, baselineKey, retiredAt: now.toISOString() };
  try {
    await store.put(markerKey, Buffer.from(`${JSON.stringify(marker)}\n`), {
      contentType: "application/json",
      ifNoneMatch: "*",
    });
  } catch (error) {
    if (!(error instanceof ReportStoreConflictError)) throw error;
    return readRetirement(await store.get(markerKey), baselineKey);
  }
  return { ...marker, markerKey };
}

function readRetirement(object, baselineKey) {
  let value;
  try {
    value = JSON.parse(Buffer.from(object.body).toString("utf8"));
  } catch {
    throw new Error("Invalid baseline retirement metadata");
  }
  if (
    value.schemaVersion !== 1 ||
    value.baselineKey !== baselineKey ||
    !Number.isFinite(Date.parse(value.retiredAt)) ||
    Object.keys(value).some((key) => !["schemaVersion", "baselineKey", "retiredAt"].includes(key))
  ) {
    throw new Error("Invalid baseline retirement metadata");
  }
  return value;
}

export async function maintainR2Reports(input, { store, verifySource, now = new Date() }) {
  const target = normalizeReportTarget(input);
  const cutoff = now.getTime() - RETENTION_MS;
  if (!Number.isFinite(cutoff)) throw new Error("Invalid report cleanup time");
  if (target.pullRequest !== null && (await verifyPullRequest(target, verifySource)) === "closed") {
    return deleteClosedReport(target, { store, verifySource });
  }
  const paths = reportTargetPaths(target);
  const current = await readReportManifest(store, target);
  const objects = await store.list(paths.reportRoot);
  const generations = new Map();
  for (const object of objects) {
    if (!object.key.startsWith(paths.reportRoot)) throw new Error("Cleanup escaped its report prefix");
    const relative = object.key.slice(paths.reportRoot.length);
    const match = /^([1-9]\d*-[1-9]\d*)\//.exec(relative);
    if (!match) continue;
    const prefix = `${paths.reportRoot}${match[1]}/`;
    const group = generations.get(prefix) ?? [];
    group.push(object);
    generations.set(prefix, group);
  }
  const expired = [...generations.entries()].filter(
    ([prefix, group]) =>
      prefix !== current?.manifest.reportPrefix &&
      group.every(
        (object) =>
          Number.isFinite(new Date(object.lastModified).getTime()) && new Date(object.lastModified).getTime() < cutoff,
      ),
  );
  let deletedFiles = 0;
  for (const [prefix, group] of expired) {
    if (target.pullRequest !== null && (await verifyPullRequest(target, verifySource)) === "closed") {
      const closed = await deleteClosedReport(target, { store, verifySource });
      return { ...closed, deletedFiles: deletedFiles + closed.deletedFiles };
    }
    const refreshed = await readReportManifest(store, target);
    if (refreshed?.manifest.reportPrefix === prefix) continue;
    deletedFiles += await store.delete(group.map(({ key }) => key));
  }
  if (paths.baselineRoot) {
    const baselines = await store.list(paths.baselineRoot);
    for (const object of baselines) {
      if (!object.key.startsWith(paths.baselineRoot)) throw new Error("Cleanup escaped its baseline prefix");
      const generation = object.key.slice(paths.baselineRoot.length);
      if (!/^[1-9]\d*-[1-9]\d*\.zip$/.test(generation)) continue;
      const refreshed = await readReportManifest(store, target);
      if (refreshed?.manifest.baseline?.key === object.key) continue;
      // A crash may leave an old baseline without a retirement marker. Start its grace period now.
      if (new Date(object.lastModified).getTime() >= cutoff) continue;
      const retirement = await recordRetiredBaseline(store, target, object.key, now);
      if (Date.parse(retirement.retiredAt) >= cutoff) continue;
      const final = await readReportManifest(store, target);
      if (final?.manifest.baseline?.key === object.key) continue;
      deletedFiles += await store.delete([object.key]);
      deletedFiles += await store.delete([`${paths.retiredRoot}${generation.replace(/\.zip$/, ".json")}`]);
    }
    // A failed second delete must not leave retirement documents indefinitely.
    const markers = await store.list(paths.retiredRoot);
    for (const marker of markers) {
      const generation = marker.key.slice(paths.retiredRoot.length);
      if (!/^[1-9]\d*-[1-9]\d*\.json$/.test(generation)) continue;
      const baselineKey = `${paths.baselineRoot}${generation.replace(/\.json$/, ".zip")}`;
      if (!(await store.head(baselineKey))) deletedFiles += await store.delete([marker.key]);
    }
  }
  return { status: "pruned", deletedFiles };
}
