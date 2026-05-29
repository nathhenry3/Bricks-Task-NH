import { test, expect } from "@playwright/test";

test("bricks evanderHons loads, renders trial canvas, and auto-starts with auto=true", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("http://127.0.0.1:4173/?config=bricks/evanderHons&auto=true", { waitUntil: "domcontentloaded" });

  // Canvas (the PixiJS conveyor stage) should appear within a reasonable time.
  // Auto-responder drives through any instruction screens automatically.
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  console.log("Canvas is visible — task loaded and trial stage rendered");

  // The "Click to begin" start overlay should appear (auto-responder will click it).
  const startOverlay = page.locator(".trial-start-overlay");
  const startBtn = page.locator(".exp-continue-btn");

  if (await startOverlay.isVisible()) {
    const btnText = await startBtn.innerText();
    console.log("Start overlay text:", btnText);
    expect(btnText.trim().length).toBeGreaterThan(0);

    // In auto=true mode the autoresponder should click through; wait for it to advance.
    await page.waitForTimeout(5_000);
    // After auto-click the overlay should disappear and the conveyor game should be running.
    await expect(startOverlay).toBeHidden({ timeout: 10_000 });
    console.log("Start overlay dismissed — conveyor trial is running");
  } else {
    // The auto-responder already clicked through; trials are already underway.
    console.log("Start overlay already dismissed — trial already running");
  }

  // Canvas should still be visible with the game running.
  await expect(canvas).toBeVisible();

  // No fatal JS errors.
  const fatalErrors = errors.filter(e =>
    !e.includes("WebSocket") &&
    (e.includes("TypeError") || e.includes("Cannot read") || e.includes("is not a function") || e.includes("Uncaught"))
  );
  expect(fatalErrors, `Fatal JS errors: ${fatalErrors.join("\n")}`).toHaveLength(0);

  console.log("PASS: bricks evanderHons loaded, canvas visible, trial started.");
});
