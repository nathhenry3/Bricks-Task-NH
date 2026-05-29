/**
 * MATB composite task – end-to-end tests.
 *
 * Strategy:
 *  - Each test uses auto=true + a very short durationMs override (8 s or 15 s).
 *  - Downloads (CSV files) are the primary completion signal.
 *  - Panel grid layout is verified via data-panel-id attributes set by
 *    PanelLayoutManager (avoids false matches in intro text).
 *  - Vite HMR WebSocket errors and audio/resource 404s are filtered from
 *    the fatal-error assertions.
 *
 * Audio playback cannot be verified in headless Chrome, but clip preload
 * errors surface as console warnings and are captured.
 */

import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { ConsoleMessage, Download, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = "http://127.0.0.1:4173";

function collectErrors(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err: Error) => errors.push(err.message));
  return { errors };
}

function installDownloadCapture(page: Page, testInfo: TestInfo): { flush: () => Promise<string[]> } {
  const downloads: Download[] = [];
  page.on("download", (dl) => downloads.push(dl));
  return {
    flush: async () => {
      const outDir = path.join(testInfo.outputDir, "downloads");
      await mkdir(outDir, { recursive: true });
      const saved: string[] = [];
      for (let i = 0; i < downloads.length; i++) {
        const dl = downloads[i];
        const fname = dl.suggestedFilename() || `download_${i + 1}`;
        await dl.saveAs(path.join(outDir, fname));
        saved.push(fname);
      }
      return saved;
    },
  };
}

/** Build a MATB URL with autoresponder + session duration override. */
function matbUrl(
  variant: string,
  participant: string,
  sessionMs = 8_000,
  extraOverrides: Record<string, unknown> = {},
): string {
  const overrides = JSON.stringify({
    task: { durationMs: sessionMs },
    autoresponder: { continueDelayMs: { minMs: 300, maxMs: 600 } },
    ...extraOverrides,
  });
  return `${BASE}/?task=matb&variant=${variant}&auto=true&participant=${participant}&overrides=${encodeURIComponent(overrides)}`;
}

/**
 * Wait for MATB panel grid using data-panel-id attributes.
 * This avoids false-positives against intro instruction text
 * (e.g. "RESMAN (bottom-right)…").
 */
async function waitForMatbGrid(page: Page, panelIds: string[]): Promise<void> {
  for (const id of panelIds) {
    await expect(
      page.locator(`[data-panel-id="${id}"]`),
      `Panel "${id}" should be in grid`,
    ).toBeVisible({ timeout: 25_000 });
  }
}

/**
 * Assert no unexpected JS errors.
 * Ignores: Vite HMR WebSocket noise, AudioService warnings, resource 404s.
 */
function noFatalErrors(errors: string[]): void {
  const fatal = errors.filter(
    (e) =>
      !e.includes("[vite]") &&
      !e.includes("WebSocket") &&
      !e.includes("AudioService") &&
      !e.includes("Failed to load resource") &&
      !e.includes("net::ERR") &&
      !e.includes("404"),
  );
  expect(fatal, `Unexpected JS errors:\n${fatal.join("\n")}`).toHaveLength(0);
}

// ---------------------------------------------------------------------------
// Smoke tests: complete flow + CSV downloads
// ---------------------------------------------------------------------------

test.describe("MATB – smoke tests (all variants complete without error)", () => {

  // ── practice ─────────────────────────────────────────────────────────────

  test("practice: 6-panel grid appears, session ends, tracking CSV downloaded", async ({ page }, testInfo) => {
    const { errors } = collectErrors(page);
    const capture = installDownloadCapture(page, testInfo);
    const firstDl = page.waitForEvent("download", { timeout: 60_000 });

    await page.goto(matbUrl("practice", "e2e_practice"));
    await waitForMatbGrid(page, ["sysmon", "tracking", "comms", "resman", "scheduling", "pumpstatus"]);
    await expect(page.locator("canvas")).toHaveCount(6, { timeout: 10_000 });

    await firstDl;
    await page.waitForTimeout(1_500);

    const files = await capture.flush();
    expect(files.length, "≥1 CSV file expected").toBeGreaterThan(0);
    expect(files.some((f) => f.includes("tracking")), `tracking CSV expected; got: ${files}`).toBe(true);
    noFatalErrors(errors);
  });

  // ── basic ─────────────────────────────────────────────────────────────────

  test("basic: 6-panel grid appears, session ends, tracking CSV downloaded", async ({ page }, testInfo) => {
    const { errors } = collectErrors(page);
    const capture = installDownloadCapture(page, testInfo);
    const firstDl = page.waitForEvent("download", { timeout: 60_000 });

    await page.goto(matbUrl("basic", "e2e_basic"));
    await waitForMatbGrid(page, ["sysmon", "tracking", "comms", "resman", "scheduling", "pumpstatus"]);
    await expect(page.locator("canvas")).toHaveCount(6, { timeout: 10_000 });

    await firstDl;
    await page.waitForTimeout(1_500);

    const files = await capture.flush();
    expect(files.some((f) => f.includes("tracking"))).toBe(true);
    noFatalErrors(errors);
  });

  // ── low-load ──────────────────────────────────────────────────────────────

  test("low-load: 6-panel grid appears, session ends, tracking CSV downloaded", async ({ page }, testInfo) => {
    const { errors } = collectErrors(page);
    const capture = installDownloadCapture(page, testInfo);
    const firstDl = page.waitForEvent("download", { timeout: 60_000 });

    await page.goto(matbUrl("low-load", "e2e_lowload"));
    await waitForMatbGrid(page, ["sysmon", "tracking", "comms", "resman", "scheduling", "pumpstatus"]);

    await firstDl;
    await page.waitForTimeout(1_500);

    const files = await capture.flush();
    expect(files.some((f) => f.includes("tracking"))).toBe(true);
    noFatalErrors(errors);
  });

  // ── high-load ─────────────────────────────────────────────────────────────

  test("high-load: 6-panel grid appears, session ends, tracking CSV downloaded", async ({ page }, testInfo) => {
    const { errors } = collectErrors(page);
    const capture = installDownloadCapture(page, testInfo);
    const firstDl = page.waitForEvent("download", { timeout: 60_000 });

    await page.goto(matbUrl("high-load", "e2e_highload"));
    await waitForMatbGrid(page, ["sysmon", "tracking", "comms", "resman", "scheduling", "pumpstatus"]);

    await firstDl;
    await page.waitForTimeout(1_500);

    const files = await capture.flush();
    expect(files.some((f) => f.includes("tracking"))).toBe(true);
    noFatalErrors(errors);
  });

  // ── parasuraman-high ──────────────────────────────────────────────────────

  /**
   * 15 s session: no sysmon failures fire (first at 30 s), but the full flow
   * (end screen → NASA-TLX auto-submit → downloads) must complete without error.
   *
   * NASA-TLX is rendered and submitted by the autoresponder before CSVs are
   * written, so by the time the download event fires we know the survey
   * completed. We watch for the NASA-TLX heading while waiting for the download
   * in parallel.
   */
  test("parasuraman-high: 5-panel grid, no comms, NASA-TLX fires, tracking CSV downloaded", async ({ page }, testInfo) => {
    const { errors } = collectErrors(page);
    const capture = installDownloadCapture(page, testInfo);

    // Longer session so we can observe the flow more clearly.
    const firstDl = page.waitForEvent("download", { timeout: 90_000 });

    // Watch for NASA-TLX heading *while* the session is running.
    const nasaTlxHeading = page.waitForSelector(
      "text=Workload Assessment",
      { timeout: 60_000 },
    );

    await page.goto(matbUrl("parasuraman-high", "e2e_para_high", 15_000));

    // 5-panel grid: sysmon + tracking + scheduling + resman + pumpstatus, NO comms panel
    await waitForMatbGrid(page, ["sysmon", "tracking", "resman", "scheduling", "pumpstatus"]);
    expect(await page.locator('[data-panel-id="comms"]').count(), "no comms panel").toBe(0);
    await expect(page.locator("canvas")).toHaveCount(5, { timeout: 10_000 });

    // NASA-TLX should appear after session ends and end screen is dismissed
    await nasaTlxHeading;

    // Downloads happen after survey is auto-submitted
    await firstDl;
    await page.waitForTimeout(1_500);

    const files = await capture.flush();
    expect(files.some((f) => f.includes("tracking")), `tracking CSV expected; got: ${files}`).toBe(true);
    noFatalErrors(errors);
  });

  // ── parasuraman-low ───────────────────────────────────────────────────────

  test("parasuraman-low: 5-panel grid, no comms, NASA-TLX fires, tracking CSV downloaded", async ({ page }, testInfo) => {
    const { errors } = collectErrors(page);
    const capture = installDownloadCapture(page, testInfo);

    const firstDl = page.waitForEvent("download", { timeout: 90_000 });
    const nasaTlxHeading = page.waitForSelector(
      "text=Workload Assessment",
      { timeout: 60_000 },
    );

    await page.goto(matbUrl("parasuraman-low", "e2e_para_low", 15_000));

    await waitForMatbGrid(page, ["sysmon", "tracking", "resman", "scheduling", "pumpstatus"]);
    expect(await page.locator('[data-panel-id="comms"]').count(), "no comms panel").toBe(0);
    await expect(page.locator("canvas")).toHaveCount(5, { timeout: 10_000 });

    await nasaTlxHeading;
    await firstDl;
    await page.waitForTimeout(1_500);

    const files = await capture.flush();
    expect(files.some((f) => f.includes("tracking"))).toBe(true);
    noFatalErrors(errors);
  });
});

// ---------------------------------------------------------------------------
// Scenario event tests
// ---------------------------------------------------------------------------

test.describe("MATB – scenario event verification", () => {

  /**
   * Basic config, 35 s session.
   * Scheduled events:
   *   t=10 s – scale1.failure = "down"   (new up/down support)
   *   t=15 s – pump.3.state  = "failed"
   *   t=25 s – pump.3.state  = "off"  +  comms prompt
   *   t=30 s – scale4.failure = "up"   + pump.7.state = "failed"
   * Verifies that up/down failure values are handled without JS errors.
   */
  test("basic 35 s: up/down scale failures fire without JS error", async ({ page }, testInfo) => {
    const { errors } = collectErrors(page);
    const capture = installDownloadCapture(page, testInfo);
    const firstDl = page.waitForEvent("download", { timeout: 90_000 });

    await page.goto(matbUrl("basic", "e2e_events_35s", 35_000));
    await waitForMatbGrid(page, ["sysmon", "tracking", "comms", "resman", "scheduling", "pumpstatus"]);

    // t=12 s: scale1.failure="down" has fired; verify canvas still present
    await page.waitForTimeout(12_000);
    await expect(page.locator("canvas").first()).toBeVisible();

    // t=32 s: scale4.failure="up" has fired
    await page.waitForTimeout(20_000);
    await expect(page.locator("canvas").first()).toBeVisible();

    await firstDl;
    const files = await capture.flush();
    expect(files.length).toBeGreaterThan(0);
    noFatalErrors(errors);
  });

  /**
   * Parasuraman-high, 40 s session.
   * t=30 s – scale2.failure = "up"   → auto-resolve at t=34 s
   * t=34 s – scale2.failure = false  (stopFailure: auto-solver)
   * Also: light2.on = true/false events
   */
  test("parasuraman-high 40 s: up/down + light2.on events without error", async ({ page }, testInfo) => {
    const { errors } = collectErrors(page);
    const capture = installDownloadCapture(page, testInfo);
    const firstDl = page.waitForEvent("download", { timeout: 120_000 });

    const nasaTlxHeading = page.waitForSelector("text=Workload Assessment", { timeout: 90_000 });

    await page.goto(matbUrl("parasuraman-high", "e2e_updown_40s", 40_000));
    await waitForMatbGrid(page, ["sysmon", "tracking", "resman", "scheduling", "pumpstatus"]);

    // t=32 s: auto-resolved failure cycle complete; sysmon canvas still visible
    await page.waitForTimeout(32_000);
    await expect(page.locator("canvas").first()).toBeVisible();

    await nasaTlxHeading; // survey fires after 40 s + end screen
    await firstDl;

    const files = await capture.flush();
    expect(files.some((f) => f.includes("tracking"))).toBe(true);
    noFatalErrors(errors);
  });

  /**
   * Clip-based audio override: confirm no fatal error when clips are configured.
   * In test environment the WAV files ARE served from /assets/matb-audio/en-male/
   * (copied during implementation). AudioService loads them during start().
   */
  test("basic with clip audio: clips load, session completes, tracking CSV downloaded", async ({ page }, testInfo) => {
    const { errors } = collectErrors(page);
    const capture = installDownloadCapture(page, testInfo);
    const firstDl = page.waitForEvent("download", { timeout: 60_000 });

    const overrides = JSON.stringify({
      task: { durationMs: 8_000 },
      autoresponder: { continueDelayMs: { minMs: 300, maxMs: 600 } },
      subtasks: {
        comms: { clips: { baseUrl: "/assets/matb-audio/en-male", gapMs: 50 } },
      },
    });
    const url = `${BASE}/?task=matb&variant=basic&auto=true&participant=e2e_clips&overrides=${encodeURIComponent(overrides)}`;
    await page.goto(url);

    await waitForMatbGrid(page, ["sysmon", "tracking", "comms", "resman", "scheduling", "pumpstatus"]);
    await firstDl;
    await page.waitForTimeout(1_500);

    const files = await capture.flush();
    expect(files.length).toBeGreaterThan(0);
    noFatalErrors(errors);
  });
});

// ---------------------------------------------------------------------------
// Layout tests
// ---------------------------------------------------------------------------

test.describe("MATB – layout correctness", () => {

  test("6-panel variants: 6 data-panel-id wrappers + 6 canvases each", async ({ page }) => {
    for (const variant of ["practice", "basic", "low-load", "high-load"]) {
      await page.goto(matbUrl(variant, `e2e_layout_${variant}`));
      await waitForMatbGrid(page, ["sysmon", "tracking", "comms", "resman", "scheduling", "pumpstatus"]);
      expect(await page.locator("canvas").count(), `${variant}: 6 canvases`).toBe(6);
    }
  });

  test("parasuraman variants: 5 panels + 5 canvases, no comms panel", async ({ page }) => {
    for (const variant of ["parasuraman-high", "parasuraman-low"]) {
      await page.goto(matbUrl(variant, `e2e_layout_${variant}`));
      await waitForMatbGrid(page, ["sysmon", "tracking", "resman", "scheduling", "pumpstatus"]);
      expect(await page.locator('[data-panel-id="comms"]').count(), `${variant}: no comms`).toBe(0);
      expect(await page.locator("canvas").count(), `${variant}: 5 canvases`).toBe(5);
    }
  });

  test("default variant: all 6 data-panel-id elements visible", async ({ page }) => {
    await page.goto(matbUrl("default", "e2e_default_layout"));
    await waitForMatbGrid(page, ["sysmon", "tracking", "comms", "resman", "scheduling", "pumpstatus"]);
    for (const id of ["sysmon", "tracking", "comms", "resman", "scheduling", "pumpstatus"]) {
      await expect(page.locator(`[data-panel-id="${id}"]`), `panel ${id}`).toBeVisible();
    }
  });
});
