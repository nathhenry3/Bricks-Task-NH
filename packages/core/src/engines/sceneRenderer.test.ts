/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { SceneRenderer } from "./sceneRenderer";
import type { SceneStimulus } from "./scene";
import type { Point } from "../infrastructure/spatial";

describe("SceneRenderer", () => {
  it("should render shapes to canvas", () => {
    const ctx: any = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      fillStyle: "",
    };
    const canvas: any = {
      width: 400,
      height: 400,
      getContext: vi.fn().mockReturnValue(ctx),
    };
    const renderer = new SceneRenderer(canvas);

    const scene: SceneStimulus = {
      items: [
        { id: "1", category: "shape", features: { type: "circle", color: "red", size: 20 } },
        { id: "2", category: "shape", features: { type: "square", color: "blue", size: 30 } },
      ]
    };

    const slots: Point[] = [
      { x: 100, y: 100 },
      { x: 200, y: 200 },
    ];

    renderer.render(scene, slots);

    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalledTimes(2);
    expect(ctx.arc).toHaveBeenCalledWith(100, 100, 10, 0, Math.PI * 2);
    expect(ctx.rect).toHaveBeenCalledWith(200 - 15, 200 - 15, 30, 30);
  });

  it("should render images to canvas", () => {
    const ctx: any = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    };
    const canvas: any = {
      width: 400,
      height: 400,
      getContext: vi.fn().mockReturnValue(ctx),
    };
    const renderer = new SceneRenderer(canvas);

    const img = new Image();
    // jsdom doesn't set naturalWidth/complete immediately without mock
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "naturalWidth", { value: 100 });

    const scene: SceneStimulus = {
      items: [
        { id: "1", category: "image", features: { src: img, width: 40, height: 40 } },
      ]
    };

    const slots: Point[] = [
      { x: 100, y: 100 },
    ];

    renderer.render(scene, slots);

    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledWith(img, 80, 80, 40, 40);
  });
});
