import { describe, expect, it } from "vitest";
import { buildConfigReferenceCandidates, toBundledConfigKey, toConfigFetchPath } from "./configResolution";

describe("configResolution", () => {
  it("resolves bare config names to task-scoped then raw fallback", () => {
    const candidates = buildConfigReferenceCandidates({
      requestedConfig: "spotlight",
      taskId: "bricks",
    });
    expect(candidates).toEqual(["bricks/spotlight", "spotlight"]);
  });

  it("resolves unknown bare names to task-scoped then raw fallback", () => {
    const candidates = buildConfigReferenceCandidates({
      requestedConfig: "pilotA",
      taskId: "bricks",
    });
    expect(candidates).toEqual(["bricks/pilotA", "pilotA"]);
  });

  it("keeps path-like references as-is", () => {
    const candidates = buildConfigReferenceCandidates({
      requestedConfig: "bricks/spotlight",
      taskId: "bricks",
    });
    expect(candidates).toEqual(["bricks/spotlight"]);
  });

  it("normalizes bundled config keys from .json and configs prefixes", () => {
    expect(toBundledConfigKey("bricks/default")).toBe("bricks/default");
    expect(toBundledConfigKey("bricks/default.json")).toBe("bricks/default");
    expect(toBundledConfigKey("/configs/bricks/default.json")).toBe("bricks/default");
    expect(toBundledConfigKey("configs/bricks/default")).toBe("bricks/default");
  });

  it("builds fetch paths for logical config names", () => {
    expect(toConfigFetchPath("bricks/default")).toBe("/configs/bricks/default.json");
    expect(toConfigFetchPath("/custom/file.json")).toBe("/custom/file.json");
  });
});
