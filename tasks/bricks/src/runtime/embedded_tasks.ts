// @ts-nocheck

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const finiteOr = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clampMs = (value: unknown, fallback: number, min = 0): number => Math.max(min, Math.round(finiteOr(value, fallback)));

const pick = <T>(values: T[], rng: { nextFloat?: () => number; next?: () => number }): T => {
  const raw = typeof rng?.nextFloat === 'function' ? rng.nextFloat() : (typeof rng?.next === 'function' ? rng.next() : Math.random());
  const idx = Math.max(0, Math.min(values.length - 1, Math.floor(raw * values.length)));
  return values[idx];
};

const shuffle = <T>(items: T[], rng: { nextFloat?: () => number; next?: () => number }): T[] => {
  const output = items.slice();
  for (let i = output.length - 1; i > 0; i -= 1) {
    const raw = typeof rng?.nextFloat === 'function' ? rng.nextFloat() : (typeof rng?.next === 'function' ? rng.next() : Math.random());
    const j = Math.max(0, Math.min(i, Math.floor(raw * (i + 1))));
    const tmp = output[i];
    output[i] = output[j];
    output[j] = tmp;
  }
  return output;
};

const sampleDelayMs = (spec: unknown, rng: { nextFloat?: () => number; next?: () => number }, fallbackMs: number): number => {
  const record = asRecord(spec);
  if (!record) return fallbackMs;
  const minMs = finiteOr(record.minMs ?? record.min_ms, fallbackMs);
  const maxMs = finiteOr(record.maxMs ?? record.max_ms, minMs);
  const lo = Math.min(minMs, maxMs);
  const hi = Math.max(minMs, maxMs);
  const raw = typeof rng?.nextFloat === 'function' ? rng.nextFloat() : (typeof rng?.next === 'function' ? rng.next() : Math.random());
  return Math.max(0, Math.round(lo + (hi - lo) * raw));
};

const normalizeKey = (key: string): string => String(key || '').toLowerCase();

const DEFAULT_LETTERS = 'BCDFGHJKLMNPQRSTVWXYZ'.split('');

export interface EmbeddedTaskResult {
  taskId: string;
  taskType: string;
  correct: boolean;
  response: string | null;
  expectedResponse: string;
  reactionTimeMs: number | null;
  startedAtMs: number;
  endedAtMs: number;
  payload: Record<string, unknown>;
}

export interface RunEmbeddedTaskArgs {
  container: HTMLElement;
  taskId: string;
  taskConfig: Record<string, unknown>;
  rng: { nextFloat?: () => number; next?: () => number };
  autoRespond?: boolean;
  autoResponder?: Record<string, unknown> | null;
  now: () => number;
}

export const resolveEmbeddedTaskConfig = (config: Record<string, any>, taskId?: string | null): { taskId: string; taskConfig: Record<string, unknown> } => {
  const params = asRecord(config?.bricks?.completionParams) ?? {};
  const id = String(taskId ?? params.taskId ?? params.task_id ?? 'sternberg_task');
  const registry = asRecord(config?.bricks?.embeddedTasks) ?? {};
  const taskConfig = asRecord(registry[id]) ?? { type: 'sternberg' };
  return { taskId: id, taskConfig };
};

const buildSternbergTrial = (taskId: string, taskConfig: Record<string, unknown>, rng: { nextFloat?: () => number; next?: () => number }) => {
  const lettersRaw = Array.isArray(taskConfig.letters) ? taskConfig.letters : DEFAULT_LETTERS;
  const letters = lettersRaw.map((value) => String(value).trim().toUpperCase()).filter(Boolean);
  const memorySetSize = Math.max(1, Math.min(letters.length - 1, Math.floor(finiteOr(taskConfig.memorySetSize ?? taskConfig.memory_set_size, 4))));
  const shuffled = shuffle(letters, rng);
  const memorySet = shuffled.slice(0, memorySetSize);
  const absentPool = shuffled.slice(memorySetSize);
  const presentProbability = Math.max(0, Math.min(1, finiteOr(taskConfig.probePresentProbability ?? taskConfig.probe_present_probability, 0.5)));
  const raw = typeof rng?.nextFloat === 'function' ? rng.nextFloat() : (typeof rng?.next === 'function' ? rng.next() : Math.random());
  const probePresent = raw < presentProbability || absentPool.length === 0;
  const probe = probePresent ? pick(memorySet, rng) : pick(absentPool, rng);
  const responseKeys = asRecord(taskConfig.responseKeys) ?? {};
  const presentKey = String(responseKeys.present ?? taskConfig.presentKey ?? 'ArrowRight');
  const absentKey = String(responseKeys.absent ?? taskConfig.absentKey ?? 'ArrowLeft');
  return {
    task_id: taskId,
    task_type: 'sternberg',
    memory_set: memorySet,
    probe,
    probe_present: probePresent,
    expected_response: probePresent ? presentKey : absentKey,
    present_key: presentKey,
    absent_key: absentKey,
  };
};

const setStyles = (element: HTMLElement, styles: Record<string, string>) => {
  Object.entries(styles).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
};

export const runEmbeddedTask = (args: RunEmbeddedTaskArgs): Promise<EmbeddedTaskResult> => {
  const taskType = String(args.taskConfig.type ?? 'sternberg');
  if (taskType !== 'sternberg') {
    throw new Error(`Unsupported embedded task type: ${taskType}`);
  }
  return runSternbergTask(args);
};

const runSternbergTask = (args: RunEmbeddedTaskArgs): Promise<EmbeddedTaskResult> => {
  const cfg = args.taskConfig;
  const trial = buildSternbergTrial(args.taskId, cfg, args.rng);
  const memoryDurationMs = clampMs(cfg.memoryDurationMs ?? cfg.memory_duration_ms, 2200, 100);
  const retentionDelayMs = clampMs(cfg.retentionDelayMs ?? cfg.retention_delay_ms, 500, 0);
  const feedbackDurationMs = clampMs(cfg.feedbackDurationMs ?? cfg.feedback_duration_ms, 350, 0);
  const showInstructions = cfg.showInstructions === true;
  const title = String(cfg.title ?? 'Memory task');
  const promptText = String(cfg.promptText ?? 'Remember these letters, then decide whether the probe was in the set.');
  const keyReminder = String(cfg.keyReminder ?? '← No, not in set     Yes, in set →');
  const autoDelayMs = sampleDelayMs(args.autoResponder?.embeddedTaskResponseDelayMs ?? args.autoResponder?.embedded_task_response_delay_ms, args.rng, 900);
  const autoAccuracy = Math.max(0, Math.min(1, finiteOr(args.autoResponder?.embeddedTaskAccuracy ?? args.autoResponder?.embedded_task_accuracy, 1)));

  return new Promise((resolve) => {
    const startedAtMs = args.now();
    let responseStartedAt = startedAtMs;
    let resolved = false;
    const overlay = document.createElement('div');
    overlay.className = 'bricks-embedded-task-overlay';
    setStyles(overlay, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'z-index': '40',
      'pointer-events': 'auto',
      background: 'rgba(15, 23, 42, 0.18)',
      'font-family': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    });

    const panel = document.createElement('div');
    panel.className = 'bricks-embedded-task-panel';
    setStyles(panel, {
      width: 'min(620px, calc(100% - 56px))',
      padding: '28px 34px',
      'border-radius': '18px',
      background: 'rgba(255, 255, 255, 0.97)',
      color: '#0f172a',
      'box-shadow': '0 24px 70px rgba(15, 23, 42, 0.36)',
      border: '1px solid rgba(148, 163, 184, 0.5)',
      'text-align': 'center',
    });

    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    setStyles(titleEl, { 'font-size': '18px', 'font-weight': '700', 'margin-bottom': showInstructions ? '10px' : '4px' });
    panel.appendChild(titleEl);

    if (showInstructions) {
      const prompt = document.createElement('div');
      prompt.textContent = promptText;
      setStyles(prompt, { 'font-size': '15px', 'line-height': '1.4', color: '#334155', 'margin-bottom': '18px' });
      panel.appendChild(prompt);
    }

    const stimulus = document.createElement('div');
    setStyles(stimulus, {
      'min-height': '96px',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'font-size': '44px',
      'font-weight': '800',
      'letter-spacing': '0.26em',
      'font-variant-numeric': 'tabular-nums',
    });
    panel.appendChild(stimulus);

    const reminder = document.createElement('div');
    reminder.textContent = keyReminder;
    setStyles(reminder, {
      'margin-top': '16px',
      padding: '10px 14px',
      'border-radius': '999px',
      background: '#eef2ff',
      color: '#1e293b',
      'font-size': '16px',
      'font-weight': '700',
      'letter-spacing': '0',
    });
    panel.appendChild(reminder);

    const feedback = document.createElement('div');
    setStyles(feedback, {
      'min-height': '24px',
      'margin-top': '14px',
      'font-size': '16px',
      'font-weight': '800',
      color: 'transparent',
    });
    panel.appendChild(feedback);

    overlay.appendChild(panel);
    args.container.appendChild(overlay);

    let acceptResponse = false;
    let autoTimer: number | null = null;
    let phaseTimer: number | null = null;

    const cleanup = () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (autoTimer !== null) window.clearTimeout(autoTimer);
      if (phaseTimer !== null) window.clearTimeout(phaseTimer);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };

    const finish = (responseKey: string | null) => {
      if (resolved || !acceptResponse) return;
      acceptResponse = false;
      const endedAtMs = args.now();
      const normalizedResponse = normalizeKey(responseKey ?? '');
      const expected = String(trial.expected_response);
      const correct = normalizedResponse === normalizeKey(expected);
      const rt = Math.max(0, endedAtMs - responseStartedAt);
      feedback.textContent = correct ? 'Correct' : 'Incorrect';
      feedback.style.color = correct ? '#047857' : '#dc2626';
      panel.style.borderColor = correct ? 'rgba(16, 185, 129, 0.85)' : 'rgba(220, 38, 38, 0.85)';
      panel.style.boxShadow = correct
        ? '0 24px 70px rgba(16, 185, 129, 0.22)'
        : '0 24px 70px rgba(220, 38, 38, 0.22)';
      const result: EmbeddedTaskResult = {
        taskId: args.taskId,
        taskType: 'sternberg',
        correct,
        response: responseKey,
        expectedResponse: expected,
        reactionTimeMs: rt,
        startedAtMs,
        endedAtMs,
        payload: {
          ...trial,
          response: responseKey,
          correct,
          rt_ms: rt,
        },
      };
      window.setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      }, feedbackDurationMs);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      if (![trial.present_key, trial.absent_key].some((candidate) => normalizeKey(candidate) === normalizeKey(key))) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      finish(key);
    };

    window.addEventListener('keydown', onKeyDown, true);

    stimulus.textContent = trial.memory_set.join(' ');
    phaseTimer = window.setTimeout(() => {
      stimulus.textContent = '+';
      phaseTimer = window.setTimeout(() => {
        stimulus.style.letterSpacing = '0.08em';
        stimulus.innerHTML = `<span style="font-size:30px;margin-right:16px;color:#475569">Probe:</span>${trial.probe}`;
        responseStartedAt = args.now();
        acceptResponse = true;
        if (args.autoRespond) {
          const raw = typeof args.rng?.nextFloat === 'function' ? args.rng.nextFloat() : (typeof args.rng?.next === 'function' ? args.rng.next() : Math.random());
          const useCorrect = raw < autoAccuracy;
          const response = useCorrect
            ? String(trial.expected_response)
            : (normalizeKey(String(trial.expected_response)) === normalizeKey(String(trial.present_key)) ? String(trial.absent_key) : String(trial.present_key));
          autoTimer = window.setTimeout(() => finish(response), autoDelayMs);
        }
      }, retentionDelayMs);
    }, memoryDurationMs);
  });
};
