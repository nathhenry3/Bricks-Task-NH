import { initJsPsych } from "jspsych";
import CanvasKeyboardResponsePlugin from "@jspsych/plugin-canvas-keyboard-response";
import { extractJsPsychTrialResponse, setCursorHidden, shouldHideCursorForPhase } from "../web/ui";
import { asObject } from "../utils/coerce";

export interface JsPsychRtTimelinePhaseDurations {
  preFixationBlankMs: number;
  fixationMs: number;
  blankMs: number;
  responseMs: number;
  responsePreStimulusBlankMs: number;
  responseStimulusMs: number;
  responsePostStimulusBlankMs: number;
  postResponseStimulusMs: number;
  postResponseBlankMs: number;
}

export interface JsPsychRtTimelineConfig {
  phasePrefix: string;
  responseTerminatesTrial: boolean;
  durations: JsPsychRtTimelinePhaseDurations;
  canvasSize: [number, number];
  allowedKeys: "NO_KEYS" | string | string[];
  baseData: Record<string, unknown>;
  renderFixation: (canvas: HTMLCanvasElement) => void;
  renderBlank: (canvas: HTMLCanvasElement) => void;
  renderStimulus: (canvas: HTMLCanvasElement) => void;
  renderFeedback?: (canvas: HTMLCanvasElement) => void;
  feedback?: {
    enabled: boolean;
    durationMs: number;
    phaseMode: "separate" | "post_response";
  };
  postResponseContent?: "blank" | "stimulus";
  onResponse?: (response: { key: string | null; rtMs: number | null }, data: Record<string, unknown>) => void;
  onStimulusPhaseStart?: () => void;
}

export function initStandardJsPsych(args: {
  displayElement: HTMLElement;
  onTrialStart?: (trial: Record<string, unknown>) => void;
  onFinish?: () => void;
}): ReturnType<typeof initJsPsych> {
  return initJsPsych({
    display_element: args.displayElement,
    on_trial_start: (trial: any) => {
      const data = asObject(trial?.data);
      setCursorHidden(shouldHideCursorForPhase(data?.phase));
      if (args.onTrialStart) args.onTrialStart(trial);
    },
    on_finish: () => {
      setCursorHidden(false);
      if (args.onFinish) args.onFinish();
    },
  });
}

export function buildJsPsychRtTimelineNodes(config: JsPsychRtTimelineConfig): any[] {
  const {
    phasePrefix,
    responseTerminatesTrial,
    durations,
    canvasSize,
    allowedKeys,
    baseData,
    renderFixation,
    renderBlank,
    renderStimulus,
    renderFeedback,
    feedback,
    postResponseContent = "stimulus",
    onResponse,
    onStimulusPhaseStart,
  } = config;

  const timeline: any[] = [];
  const phaseName = (suffix: string) => (phasePrefix ? `${phasePrefix}_${suffix}` : suffix);

  if (durations.preFixationBlankMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: renderBlank,
      canvas_size: canvasSize,
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: Math.max(0, Math.round(durations.preFixationBlankMs)),
      data: { ...baseData, phase: phaseName("pre_fixation_blank") },
    });
  }

  if (durations.fixationMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: renderFixation,
      canvas_size: canvasSize,
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: Math.max(0, Math.round(durations.fixationMs)),
      data: { ...baseData, phase: phaseName("fixation") },
    });
  }

  if (durations.blankMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: renderBlank,
      canvas_size: canvasSize,
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: Math.max(0, Math.round(durations.blankMs)),
      data: { ...baseData, phase: phaseName("blank") },
    });
  }

  const responseSegments: Array<{ phase: string; durationMs: number; showStimulus: boolean }> = [];
  if (!responseTerminatesTrial) {
    if (durations.responsePreStimulusBlankMs > 0) {
      responseSegments.push({
        phase: phaseName("response_window_pre_stim_blank"),
        durationMs: durations.responsePreStimulusBlankMs,
        showStimulus: false,
      });
    }
    if (durations.responseStimulusMs > 0) {
      responseSegments.push({
        phase: phaseName("response_window_stimulus"),
        durationMs: durations.responseStimulusMs,
        showStimulus: true,
      });
    }
    if (durations.responsePostStimulusBlankMs > 0) {
      responseSegments.push({
        phase: phaseName("response_window_post_stim_blank"),
        durationMs: durations.responsePostStimulusBlankMs,
        showStimulus: false,
      });
    }
  }
  if (responseSegments.length === 0 && durations.responseMs > 0) {
    responseSegments.push({
      phase: phaseName("response_window"),
      durationMs: durations.responseMs,
      showStimulus: true,
    });
  }

  let capturedResponse: { key: string | null; rtMs: number | null } = { key: null, rtMs: null };
  let responseSeen = false;

  responseSegments.forEach((segment, segmentIndex) => {
    const isLast = segmentIndex === responseSegments.length - 1;
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: segment.showStimulus ? renderStimulus : renderBlank,
      canvas_size: canvasSize,
      choices: allowedKeys,
      response_ends_trial: responseTerminatesTrial,
      trial_duration: Math.max(0, Math.round(segment.durationMs)),
      data: { ...baseData, phase: segment.phase },
      on_start: () => {
        if (segment.showStimulus && onStimulusPhaseStart && !responseSeen) {
          onStimulusPhaseStart();
        }
      },
      on_finish: (data: Record<string, unknown>) => {
        if (!responseSeen) {
          const response = extractJsPsychTrialResponse(data);
          if (response.key || response.rtMs != null) {
            capturedResponse = response;
            responseSeen = true;
          }
        }
        if (isLast && onResponse) {
          onResponse(capturedResponse, data);
        }
      },
    });
  });

  if (!responseTerminatesTrial) {
    if (feedback?.enabled && feedback.phaseMode === "post_response" && feedback.durationMs > 0 && renderFeedback) {
      timeline.push({
        type: CanvasKeyboardResponsePlugin,
        stimulus: renderFeedback,
        canvas_size: canvasSize,
        choices: "NO_KEYS",
        response_ends_trial: false,
        trial_duration: Math.max(0, Math.round(feedback.durationMs)),
        data: { ...baseData, phase: phaseName("post_response_feedback") },
      });
    } else {
      const postStimMs = postResponseContent === "blank" ? 0 : durations.postResponseStimulusMs;
      const postBlankMs =
        postResponseContent === "blank"
          ? durations.postResponseStimulusMs + durations.postResponseBlankMs
          : durations.postResponseBlankMs;

      if (postStimMs > 0) {
        timeline.push({
          type: CanvasKeyboardResponsePlugin,
          stimulus: renderStimulus,
          canvas_size: canvasSize,
          choices: "NO_KEYS",
          response_ends_trial: false,
          trial_duration: Math.max(0, Math.round(postStimMs)),
          data: { ...baseData, phase: phaseName("post_response_stimulus") },
        });
      }
      if (postBlankMs > 0) {
        timeline.push({
          type: CanvasKeyboardResponsePlugin,
          stimulus: renderBlank,
          canvas_size: canvasSize,
          choices: "NO_KEYS",
          response_ends_trial: false,
          trial_duration: Math.max(0, Math.round(postBlankMs)),
          data: { ...baseData, phase: phaseName("post_response_blank") },
        });
      }
    }
  }

  if (feedback?.enabled && feedback.durationMs > 0 && renderFeedback) {
    if (responseTerminatesTrial || feedback.phaseMode === "separate") {
      timeline.push({
        type: CanvasKeyboardResponsePlugin,
        stimulus: renderFeedback,
        canvas_size: canvasSize,
        choices: "NO_KEYS",
        response_ends_trial: false,
        trial_duration: Math.max(0, Math.round(feedback.durationMs)),
        data: { ...baseData, phase: phaseName("feedback") },
      });
    }
  }

  return timeline;
}
