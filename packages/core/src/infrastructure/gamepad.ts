/**
 * Gamepad/joystick input service using the browser Gamepad API.
 *
 * The browser Gamepad API is polling-based (not event-driven), so
 * call poll() each animation frame to get the current state. The
 * service also fires callbacks on connect/disconnect.
 *
 * Usage:
 *   const gamepad = new GamepadService({
 *     onConnect: (id) => console.log("connected:", id),
 *   });
 *   // In rAF loop:
 *   const state = gamepad.poll();
 *   if (state) {
 *     const x = state.axes[0]; // -1 to 1
 *     const y = state.axes[1]; // -1 to 1
 *   }
 *   // Cleanup:
 *   gamepad.dispose();
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GamepadServiceConfig {
  /** Which gamepad index to use. Default 0 (first connected). */
  index?: number;
  /** Axis deadzone: values below this magnitude are clamped to 0. Default 0.05. */
  deadzone?: number;
  /** Called when a gamepad connects. */
  onConnect?: (gamepadId: string) => void;
  /** Called when a gamepad disconnects. */
  onDisconnect?: (gamepadId: string) => void;
}

export interface GamepadState {
  /** Normalised axis values, -1 to 1 (after deadzone). */
  axes: number[];
  /** Button pressed states. */
  buttons: boolean[];
  /** Raw Gamepad object, if needed. */
  raw: Gamepad;
}

// ---------------------------------------------------------------------------
// GamepadService
// ---------------------------------------------------------------------------

export class GamepadService {
  private readonly index: number;
  private readonly deadzone: number;
  private readonly onConnect?: (gamepadId: string) => void;
  private readonly onDisconnect?: (gamepadId: string) => void;
  private connected = false;
  private connectListener: ((e: GamepadEvent) => void) | null = null;
  private disconnectListener: ((e: GamepadEvent) => void) | null = null;

  constructor(config?: GamepadServiceConfig) {
    this.index = Math.max(0, Math.round(Number(config?.index ?? 0)));
    this.deadzone = Math.max(0, Number(config?.deadzone ?? 0.05));
    this.onConnect = config?.onConnect;
    this.onDisconnect = config?.onDisconnect;
    this.installListeners();
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Poll the current gamepad state. Returns null if no gamepad is
   * connected at the configured index.
   */
  poll(): GamepadState | null {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
    const gamepads = navigator.getGamepads();
    const gp = gamepads[this.index] ?? null;
    if (!gp) {
      if (this.connected) {
        this.connected = false;
        this.onDisconnect?.("(disconnected)");
      }
      return null;
    }

    if (!this.connected) {
      this.connected = true;
      this.onConnect?.(gp.id);
    }

    const axes = gp.axes.map((v) => this.applyDeadzone(v));
    const buttons = gp.buttons.map((b) => b.pressed);
    return { axes, buttons, raw: gp };
  }

  /**
   * Convenience: get a single axis value. Returns 0 if no gamepad or
   * axis index out of range.
   */
  getAxis(axisIndex: number): number {
    const state = this.poll();
    if (!state || axisIndex < 0 || axisIndex >= state.axes.length) return 0;
    return state.axes[axisIndex];
  }

  /**
   * Convenience: get a single button state.
   */
  getButton(buttonIndex: number): boolean {
    const state = this.poll();
    if (!state || buttonIndex < 0 || buttonIndex >= state.buttons.length) return false;
    return state.buttons[buttonIndex];
  }

  /**
   * Whether a gamepad is currently connected at the configured index.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Release event listeners.
   */
  dispose(): void {
    if (this.connectListener) {
      window.removeEventListener("gamepadconnected", this.connectListener);
      this.connectListener = null;
    }
    if (this.disconnectListener) {
      window.removeEventListener("gamepaddisconnected", this.disconnectListener);
      this.disconnectListener = null;
    }
  }

  // ── Internals ────────────────────────────────────────────────────────

  private applyDeadzone(value: number): number {
    return Math.abs(value) < this.deadzone ? 0 : value;
  }

  private installListeners(): void {
    if (typeof window === "undefined") return;

    this.connectListener = (e: GamepadEvent) => {
      if (e.gamepad.index === this.index) {
        this.connected = true;
        this.onConnect?.(e.gamepad.id);
      }
    };
    this.disconnectListener = (e: GamepadEvent) => {
      if (e.gamepad.index === this.index) {
        this.connected = false;
        this.onDisconnect?.(e.gamepad.id);
      }
    };

    window.addEventListener("gamepadconnected", this.connectListener);
    window.addEventListener("gamepaddisconnected", this.disconnectListener);
  }
}
