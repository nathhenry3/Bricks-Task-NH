/**
 * Multi-panel layout manager for concurrent task displays.
 *
 * Uses CSS Grid to partition a root element into named panels.
 * Each panel is a positioned <div> that sub-tasks render into.
 *
 * Usage:
 *   const layout = new PanelLayoutManager(container, {
 *     rows: 2, cols: 3, gap: "2px",
 *     panels: [
 *       { id: "sysmon",   row: 0, col: 0, label: "SYSMON" },
 *       { id: "tracking", row: 0, col: 1, label: "TRACKING" },
 *       ...
 *     ],
 *   });
 *   const panel = layout.getPanel("sysmon"); // HTMLElement to render into
 *   layout.dispose();
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PanelConfig {
  /** Unique identifier for this panel. */
  id: string;
  /** Zero-based row index. */
  row: number;
  /** Zero-based column index. */
  col: number;
  /** How many rows this panel spans. Default 1. */
  rowSpan?: number;
  /** How many columns this panel spans. Default 1. */
  colSpan?: number;
  /** Optional header label displayed at the top of the panel. */
  label?: string;
  /** CSS background for this panel. Default "transparent". */
  background?: string;
  /** CSS border for this panel. Default "1px solid #444". */
  border?: string;
}

export interface PanelLayoutConfig {
  /** Total number of rows in the grid. */
  rows: number;
  /** Total number of columns in the grid. */
  cols: number;
  /** Panel definitions. */
  panels: PanelConfig[];
  /** CSS gap between panels. Default "2px". */
  gap?: string;
  /** CSS padding around the entire grid. Default "0". */
  padding?: string;
  /** Background colour for the grid root. Default "#1a1a1a". */
  background?: string;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface MountedPanel {
  config: PanelConfig;
  /** The outer wrapper including the optional label. */
  wrapper: HTMLDivElement;
  /** The content area that sub-tasks render into. */
  content: HTMLDivElement;
}

// ---------------------------------------------------------------------------
// PanelLayoutManager
// ---------------------------------------------------------------------------

export class PanelLayoutManager {
  private readonly root: HTMLElement;
  private readonly grid: HTMLDivElement;
  private readonly mounted = new Map<string, MountedPanel>();
  private resizeObserver: ResizeObserver | null = null;

  constructor(root: HTMLElement, config: PanelLayoutConfig) {
    this.root = root;
    this.grid = document.createElement("div");
    this.applyGridStyles(config);
    this.mountPanels(config);
    this.root.appendChild(this.grid);

    // Observe the root for resizes so panels can react if needed.
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.root);
    }
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Return the content element for a panel. Sub-tasks render into this
   * element (create canvases, append DOM nodes, etc.).
   */
  getPanel(id: string): HTMLElement {
    const panel = this.mounted.get(id);
    if (!panel) throw new Error(`[PanelLayoutManager] panel "${id}" not found`);
    return panel.content;
  }

  /**
   * Return all panel ids.
   */
  getPanelIds(): string[] {
    return Array.from(this.mounted.keys());
  }

  /**
   * Force a layout recalculation. Normally handled automatically via
   * ResizeObserver, but can be called manually if the root changes size
   * outside of normal flow.
   */
  resize(): void {
    this.handleResize();
  }

  /**
   * Remove all panels and detach from the DOM.
   */
  dispose(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.mounted.clear();
    if (this.grid.parentNode) {
      this.grid.parentNode.removeChild(this.grid);
    }
  }

  // ── Internals ────────────────────────────────────────────────────────

  private applyGridStyles(config: PanelLayoutConfig): void {
    const s = this.grid.style;
    s.display = "grid";
    s.width = "100%";
    s.height = "100%";
    s.boxSizing = "border-box";
    s.gridTemplateRows = `repeat(${Math.max(1, config.rows)}, 1fr)`;
    s.gridTemplateColumns = `repeat(${Math.max(1, config.cols)}, 1fr)`;
    s.gap = config.gap ?? "2px";
    s.padding = config.padding ?? "0";
    s.background = config.background ?? "#d0d0d0";
    s.overflow = "hidden";
  }

  private mountPanels(config: PanelLayoutConfig): void {
    for (const panelConfig of config.panels) {
      if (this.mounted.has(panelConfig.id)) {
        console.warn(`[PanelLayoutManager] duplicate panel id "${panelConfig.id}", skipping`);
        continue;
      }

      const wrapper = document.createElement("div");
      wrapper.dataset.panelId = panelConfig.id;
      const ws = wrapper.style;
      ws.display = "flex";
      ws.flexDirection = "column";
      ws.overflow = "hidden";
      ws.position = "relative";
      ws.background = panelConfig.background ?? "#f0f0f0";
      ws.border = panelConfig.border ?? "1px solid #c8c8c8";
      ws.boxSizing = "border-box";

      // CSS grid placement (1-based)
      ws.gridRowStart = String(panelConfig.row + 1);
      ws.gridRowEnd = String(panelConfig.row + 1 + (panelConfig.rowSpan ?? 1));
      ws.gridColumnStart = String(panelConfig.col + 1);
      ws.gridColumnEnd = String(panelConfig.col + 1 + (panelConfig.colSpan ?? 1));

      // Optional label header
      if (panelConfig.label) {
        const label = document.createElement("div");
        const ls = label.style;
        ls.textAlign = "center";
        ls.fontSize = "12px";
        ls.fontWeight = "700";
        ls.fontFamily = "sans-serif";
        ls.letterSpacing = "1px";
        ls.textTransform = "uppercase";
        ls.padding = "3px 4px";
        ls.color = "#323232";
        ls.background = "#e0e0e0";
        ls.flexShrink = "0";
        ls.userSelect = "none";
        label.textContent = panelConfig.label;
        wrapper.appendChild(label);
      }

      // Content area
      const content = document.createElement("div");
      const cs = content.style;
      cs.flex = "1";
      cs.position = "relative";
      cs.overflow = "hidden";
      wrapper.appendChild(content);

      this.grid.appendChild(wrapper);
      this.mounted.set(panelConfig.id, { config: panelConfig, wrapper, content });
    }
  }

  private handleResize(): void {
    // Currently a no-op placeholder. Individual panels auto-size via CSS
    // Grid. Sub-tasks can listen for ResizeObserver on their own content
    // element if they need pixel-level awareness.
  }
}
