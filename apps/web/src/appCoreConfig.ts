import type { CoreConfig } from "@experiments/core";

export const coreDefaultConfig: CoreConfig = {
  selection: {
    taskId: "bricks",
  },
  participant: {
    participantParamCandidates: ["PROLIFIC_PID", "SONA_ID", "participant", "survey_code"],
    studyParamCandidates: ["STUDY_ID", "study_id"],
    sessionParamCandidates: ["SESSION_ID", "session_id"],
  },
  completion: {
    redirect: {
      enabled: false,
      completeUrlTemplate: "",
      incompleteUrlTemplate: "",
    },
  },
  data: {
    localSave: true,
    filePrefix: "experiments",
    localSaveFormat: "csv",
  },
  autoresponder: {
    enabled: false,
    continueDelayMs: { minMs: 800, maxMs: 2600 },
    responseRtMs: { meanMs: 720, sdMs: 210, minMs: 180, maxMs: 3200 },
    timeoutRate: 0.08,
    errorRate: 0.12,
    interActionDelayMs: { minMs: 450, maxMs: 1200 },
    holdDurationMs: { minMs: 220, maxMs: 860 },
    maxTrialDurationMs: 90000,
  },
  ui: {
    pageBackground: "linear-gradient(180deg, #e8edf4 0%, #f7fafc 100%)",
  },
  eeg: {
    enabled: false,
    bridgeUrl: "http://127.0.0.1:8787",
    requireBridge: false,
    eventTypes: ["task_start", "task_end", "trial_start", "trial_end"],
    includeEventPayload: false,
  },
};
