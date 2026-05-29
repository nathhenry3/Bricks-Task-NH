import { describe, it, expect } from "vitest";
import { createScene, diffScenes, type SceneItem } from "./scene";

describe("SceneStimulus logic", () => {
  const item1: SceneItem = { id: "1", category: "A", features: { color: "red" } };
  const item2: SceneItem = { id: "2", category: "B", features: { color: "blue" } };
  const item3: SceneItem = { id: "3", category: "A", features: { color: "green" } };

  describe("diffScenes", () => {
    it("should return empty array if scenes are identical", () => {
      const scene1 = createScene([item1, item2]);
      const scene2 = createScene([item1, item2]);
      const diff = diffScenes(scene1, scene2);
      expect(diff.changedIndices).toHaveLength(0);
      expect(diff.isChanged).toBe(false);
    });

    it("should identify changed items by identity", () => {
      const scene1 = createScene([item1, item2]);
      const scene2 = createScene([item1, item3]); // item2 replaced by item3 at index 1
      const diff = diffScenes(scene1, scene2);
      expect(diff.changedIndices).toEqual([1]);
      expect(diff.isChanged).toBe(true);
    });

    it("should throw if scenes have different lengths", () => {
      const scene1 = createScene([item1]);
      const scene2 = createScene([item1, item2]);
      expect(() => diffScenes(scene1, scene2)).toThrow(/must have the same number of items/);
    });
  });
});
