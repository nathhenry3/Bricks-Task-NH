/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { GameState } from './game_state.js';
import { getBrickVisibleWidth } from './brick_logic.js';

const buildConfig = () => ({
  display: {
    canvasWidth: 1200,
    canvasHeight: 760,
    beltHeight: 56,
    beltGap: 50,
    brickWidth: 80,
    brickHeight: 36,
    brickColor: '#fbbf24',
    brickBorderColor: '#111827'
  },
  conveyors: {
    nConveyors: 1,
    lengthPx: { type: 'fixed', value: 1000 },
    speedPxPerSec: { type: 'fixed', value: 30 }
  },
  bricks: {
    completionMode: 'hover_to_clear',
    completionParams: {},
    initialBricks: { type: 'fixed', value: 0 },
    forcedSet: [
      {
        conveyorIndex: 0,
        x: 100,
        width: 100
      }
    ],
    spawn: {
      ratePerSec: { type: 'fixed', value: 0 },
      interSpawnDist: null,
      minSpacingPx: 0,
      byConveyor: true,
      maxActivePerConveyor: 1
    },
    maxBricksPerTrial: 1
  },
  trial: {
    mode: 'max_bricks'
  }
});

describe('GameState hover_to_clear dynamics', () => {
  it('keeps the visible right edge fixed while hovered at matched process rate', () => {
    const gameState: any = new GameState(buildConfig(), { seed: 1 });
    const brick: any = Array.from(gameState.bricks.values())[0];
    expect(brick).toBeTruthy();

    const initialVisibleWidth = getBrickVisibleWidth(brick, 'hover_to_clear');
    const initialRightEdge = brick.x + initialVisibleWidth;

    brick.isHovered = true;
    gameState.step(1000);

    const updated: any = gameState.bricks.get(brick.id);
    expect(updated).toBeTruthy();
    const nextVisibleWidth = getBrickVisibleWidth(updated, 'hover_to_clear');
    const nextRightEdge = updated.x + nextVisibleWidth;

    expect(updated.x).toBeCloseTo(130, 6);
    expect(updated.clearProgress).toBeCloseTo(0.3, 6);
    expect(nextRightEdge).toBeCloseTo(initialRightEdge, 6);
  });
});

describe('GameState conveyor speed scheduling', () => {
  it('does not resample conveyor speed at runtime when dynamic speed is disabled', () => {
    const cfg: any = buildConfig();
    cfg.conveyors.speedPxPerSec = { type: 'fixed', value: 10 };
    const gameState: any = new GameState(cfg, { seed: 2 });
    expect(gameState.conveyors[0].speed).toBe(10);

    gameState.step(100);
    gameState.step(100);
    gameState.step(100);

    expect(gameState.conveyors[0].speed).toBe(10);
    const speedChangeEvents = gameState.events.filter((event: any) => event.type === 'conveyor_speed_changed');
    expect(speedChangeEvents).toHaveLength(0);
  });

  it('supports per-conveyor dynamic speed changes', () => {
    const cfg: any = buildConfig();
    cfg.conveyors.nConveyors = 2;
    cfg.conveyors.speedPxPerSec = { type: 'fixed', value: 20 };
    cfg.conveyors.dynamicSpeed = {
      enable: false,
      intervalMs: { type: 'fixed', value: 100 },
      speedPxPerSec: { type: 'fixed', value: 20 },
      perConveyor: {
        c1: {
          enable: true,
          intervalMs: { type: 'fixed', value: 100 },
          speedPxPerSec: { type: 'fixed', value: 30 }
        }
      }
    };
    cfg.bricks.forcedSet = [];
    const gameState: any = new GameState(cfg, { seed: 3 });

    expect(gameState.conveyors[0].speed).toBe(20);
    expect(gameState.conveyors[1].speed).toBe(20);

    gameState.step(100);
    expect(gameState.conveyors[0].speed).toBe(20);
    expect(gameState.conveyors[1].speed).toBe(30);

    gameState.step(100);
    expect(gameState.conveyors[0].speed).toBe(20);
    expect(gameState.conveyors[1].speed).toBe(30);

    const speedChangeEvents = gameState.events.filter((event: any) => event.type === 'conveyor_speed_changed');
    expect(speedChangeEvents.length).toBeGreaterThanOrEqual(2);
    expect(speedChangeEvents.every((event: any) => event.conveyor_id === 'c1')).toBe(true);
  });
});

describe('GameState drop accounting', () => {
  it('applies drop penalties for every brick that is destroyed in the same frame', () => {
    const cfg: any = buildConfig();
    cfg.conveyors.nConveyors = 2;
    cfg.conveyors.lengthPx = { type: 'fixed', value: 200 };
    cfg.conveyors.speedPxPerSec = { type: 'fixed', value: 50 };
    cfg.bricks.completionMode = 'hold_duration';
    cfg.bricks.completionParams = {};
    cfg.bricks.dropPenalty = { enable: true };
    cfg.bricks.forcedSet = [
      { conveyorIndex: 0, x: 120, width: 80, value: 3 },
      { conveyorIndex: 1, x: 120, width: 80, value: 4 },
    ];

    const gameState: any = new GameState(cfg, { seed: 7 });
    expect(gameState.bricks.size).toBe(2);

    gameState.stats.points = 20;
    gameState.step(1000);

    expect(gameState.stats.dropped).toBe(2);
    expect(gameState.stats.points).toBe(13);
    expect(gameState.consumeDroppedVisuals()).toHaveLength(2);
  });

  it('caps drop popup loss to the applied HUD loss when points floor is reached', () => {
    const cfg: any = buildConfig();
    cfg.conveyors.lengthPx = { type: 'fixed', value: 200 };
    cfg.conveyors.speedPxPerSec = { type: 'fixed', value: 50 };
    cfg.bricks.completionMode = 'hold_duration';
    cfg.bricks.completionParams = {};
    cfg.bricks.dropPenalty = { enable: true };
    cfg.bricks.forcedSet = [{ conveyorIndex: 0, x: 120, width: 80, value: 5 }];

    const gameState: any = new GameState(cfg, { seed: 11 });
    gameState.stats.points = 4;
    gameState.step(1000);

    expect(gameState.stats.points).toBe(0);
    const drops = gameState.consumeDroppedVisuals();
    expect(drops).toHaveLength(1);
    expect(Number(drops[0]?.lostPoints ?? NaN)).toBe(4);
  });
});


describe('GameState task_sequence dynamics', () => {
  it('shrinks progress only after correct embedded task responses', () => {
    const cfg: any = buildConfig();
    cfg.bricks.completionMode = 'task_sequence';
    cfg.bricks.completionParams = {
      taskId: 'sternberg_task',
      progress_per_correct: 0.5,
      width_scaling: true,
      width_reference_px: 100,
      width_scaling_exponent: 1,
    };
    cfg.bricks.embeddedTasks = {
      sternberg_task: { type: 'sternberg' },
    };
    const gameState: any = new GameState(cfg, { seed: 17 });
    const brick: any = Array.from(gameState.bricks.values())[0];

    const started = gameState.startBrickTaskSequence(brick.id, 'sternberg_task', 'sternberg', gameState.elapsed, { x: brick.x, y: brick.y });
    expect(started.ok).toBe(true);

    gameState.handleBrickTaskCompletion(brick.id, {
      taskId: 'sternberg_task',
      taskType: 'sternberg',
      correct: false,
      payload: { response: 'ArrowLeft', expected_response: 'ArrowRight', correct: false },
    }, gameState.elapsed);
    expect(gameState.bricks.get(brick.id).clearProgress).toBe(0);

    gameState.handleBrickTaskCompletion(brick.id, {
      taskId: 'sternberg_task',
      taskType: 'sternberg',
      correct: true,
      payload: { response: 'ArrowRight', expected_response: 'ArrowRight', correct: true },
    }, gameState.elapsed);
    expect(gameState.bricks.get(brick.id).clearProgress).toBeCloseTo(0.5, 6);

    gameState.handleBrickTaskCompletion(brick.id, {
      taskId: 'sternberg_task',
      taskType: 'sternberg',
      correct: true,
      payload: { response: 'ArrowRight', expected_response: 'ArrowRight', correct: true },
    }, gameState.elapsed);
    expect(gameState.bricks.has(brick.id)).toBe(false);
    expect(gameState.stats.cleared).toBe(1);

    const taskEvents = gameState.events.filter((event: any) => event.type === 'embedded_task_response');
    expect(taskEvents).toHaveLength(3);
  });

  it('moves active task_sequence bricks when conveyor speed is non-zero', () => {
    const cfg: any = buildConfig();
    cfg.bricks.completionMode = 'task_sequence';
    cfg.bricks.completionParams = {
      taskId: 'sternberg_task',
      progress_per_correct: 0.5,
    };
    cfg.bricks.embeddedTasks = {
      sternberg_task: { type: 'sternberg' },
    };
    cfg.conveyors.speedPxPerSec = { type: 'fixed', value: 5 };

    const gameState: any = new GameState(cfg, { seed: 23 });
    const brick: any = Array.from(gameState.bricks.values())[0];
    const initialX = brick.x;

    gameState.step(1000);

    const moved: any = gameState.bricks.get(brick.id);
    expect(moved).toBeTruthy();
    expect(moved.x).toBeCloseTo(initialX + 5, 6);
  });
});
