import { escapeHtml, pushJsPsychContinueScreen } from "./ui";
import {
  buildInstructionScreens,
  renderInstructionScreenHtml,
  renderTaskIntroCardHtml,
  renderBlockIntroCardHtml,
  type InstructionFlowPages,
  type InstructionScreenRenderContext,
} from "./instructionFlow";

export interface AppendJsPsychContinuePagesArgs {
  timeline: any[];
  plugin: unknown;
  container: HTMLElement;
  pages: string[];
  phase: string;
  buttonIdPrefix: string;
  html?: (page: string, index: number) => string;
  data?: (index: number) => Record<string, unknown>;
}

export function appendJsPsychContinuePages(args: AppendJsPsychContinuePagesArgs): void {
  const {
    timeline,
    plugin,
    container,
    pages,
    phase,
    buttonIdPrefix,
    html = (page) => `<p>${escapeHtml(page)}</p>`,
    data = (index) => ({ pageIndex: index }),
  } = args;

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index] ?? "";
    pushJsPsychContinueScreen(
      timeline,
      plugin,
      container,
      html(page, index),
      phase,
      `${buttonIdPrefix}-${index}`,
      data(index),
    );
  }
}

export interface AppendJsPsychInstructionScreensArgs {
  timeline: any[];
  plugin: unknown;
  container: HTMLElement;
  pages: string[];
  section: keyof InstructionFlowPages;
  buttonIdPrefix: string;
  title?: string | null;
  blockLabel?: string | null;
  phase?: string;
  renderHtml?: (ctx: InstructionScreenRenderContext) => string;
  data?: (ctx: InstructionScreenRenderContext) => Record<string, unknown>;
}

export function appendJsPsychInstructionScreens(args: AppendJsPsychInstructionScreensArgs): void {
  const screens = buildInstructionScreens({
    pages: args.pages,
    section: args.section,
    title: args.title,
    blockLabel: args.blockLabel,
    buttonIdPrefix: args.buttonIdPrefix,
  });

  for (const screen of screens) {
    const ctx = screen.ctx;
    pushJsPsychContinueScreen(
      args.timeline,
      args.plugin,
      args.container,
      args.renderHtml ? args.renderHtml(ctx) : renderInstructionScreenHtml(ctx),
      args.phase ?? ctx.section,
      screen.buttonId,
      args.data ? args.data(ctx) : { pageIndex: ctx.pageIndex },
    );
  }
}

export interface AppendJsPsychTaskIntroScreenArgs {
  timeline: any[];
  plugin: unknown;
  container: HTMLElement;
  title: string;
  participantId?: string | null;
  phase?: string;
  buttonId?: string;
  data?: Record<string, unknown>;
}

export function appendJsPsychTaskIntroScreen(args: AppendJsPsychTaskIntroScreenArgs): void {
  pushJsPsychContinueScreen(
    args.timeline,
    args.plugin,
    args.container,
    renderTaskIntroCardHtml({ title: args.title, participantId: args.participantId }),
    args.phase ?? "intro_start",
    args.buttonId ?? "continue-intro-start",
    args.data,
  );
}

export interface AppendJsPsychBlockIntroScreenArgs {
  timeline: any[];
  plugin: unknown;
  container: HTMLElement;
  blockLabel: string;
  introText?: string | null;
  showBlockLabel?: boolean;
  phase?: string;
  buttonId?: string;
  data?: Record<string, unknown>;
}

export function appendJsPsychBlockIntroScreen(args: AppendJsPsychBlockIntroScreenArgs): void {
  pushJsPsychContinueScreen(
    args.timeline,
    args.plugin,
    args.container,
    renderBlockIntroCardHtml({
      blockLabel: args.blockLabel,
      introText: args.introText,
      showBlockLabel: args.showBlockLabel,
    }),
    args.phase ?? "block_start",
    args.buttonId ?? "continue-block-start",
    args.data,
  );
}
