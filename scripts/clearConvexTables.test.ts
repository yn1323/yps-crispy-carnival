import { describe, expect, it, vi } from "vitest";

const { execFileSyncMock } = vi.hoisted(() => ({ execFileSyncMock: vi.fn() }));

vi.mock("node:child_process", () => ({ execFileSync: execFileSyncMock }));

import { clearConvexTables } from "./clearConvexTables";

describe("clearConvexTables", () => {
  it("continues through bounded table batches until Convex reports completion", () => {
    execFileSyncMock
      .mockReturnValueOnce('{\n  "cleared": [],\n  "deleted": 1000,\n  "done": false,\n  "nextTable": "users"\n}\n')
      .mockReturnValueOnce('{"cleared":["users"],"deleted":5,"nextTable":"shops","done":false}\n')
      .mockReturnValueOnce('{"cleared":["shops"],"deleted":0,"nextTable":null,"done":true}\n');
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = clearConvexTables({ envFile: ".env.develop" });

    expect(result).toEqual({ clearedTables: ["users", "shops"], totalDeleted: 1005 });
    expect(logSpy.mock.calls.flat().join("\n")).toContain("[clear] バッチ1を実行中");
    expect(logSpy.mock.calls.flat().join("\n")).toContain("最大1000件");
    expect(logSpy.mock.calls.flat().join("\n")).toContain("累計1005件");
    expect(execFileSyncMock).toHaveBeenCalledTimes(3);
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      ["exec", "convex", "run", "--env-file", ".env.develop", "testing:clearAllTables", "{}"],
      expect.objectContaining({ encoding: "utf8" }),
    );
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      ["exec", "convex", "run", "--env-file", ".env.develop", "testing:clearAllTables", '{"tableName":"users"}'],
      expect.objectContaining({ encoding: "utf8" }),
    );
    logSpy.mockRestore();
  });
});
