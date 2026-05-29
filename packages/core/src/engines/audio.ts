/**
 * General-purpose audio service for experiment tasks.
 *
 * Provides clip playback (pre-loaded audio buffers), tone generation
 * (oscillator), and sequenced playback. Built on the Web Audio API.
 *
 * Usage:
 *   const audio = new AudioService();
 *   await audio.preloadClips({ beep: "/assets/beep.wav", ... });
 *   audio.playClip("beep");
 *   await audio.playSequence(["digit_1", "digit_1", "digit_8"], 80);
 *   audio.dispose();
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioClipManifest {
  [id: string]: string; // id → URL (resolved at load time)
}

export interface PlayClipOptions {
  /** Volume 0-1. Default 1. */
  volume?: number;
  /** Callback when clip finishes playing naturally. */
  onEnd?: () => void;
}

export interface PlayToneOptions {
  /** Volume 0-1. Default 0.25. */
  volume?: number;
  /** Oscillator waveform. Default "sine". */
  waveform?: OscillatorType;
}

export interface SpeakTextOptions {
  /** Speech rate multiplier. Default 1. */
  rate?: number;
  /** Pitch multiplier. Default 1. */
  pitch?: number;
  /** Volume 0-1. Default 1. */
  volume?: number;
  /**
   * Prioritised list of voice names to try (exact match, case-insensitive).
   * The first name that resolves to an available voice is used.
   * E.g. ["Google US English", "Microsoft David - English (United States)"]
   * Falls back to `lang` matching, then browser default, if none are found.
   */
  voiceNames?: string[];
  /**
   * BCP-47 language/locale tag used as a fallback voice selector (e.g. "en-US").
   * Used only if no `voiceNames` match is found.
   * Falls back to the browser default if no matching voice is found.
   */
  lang?: string;
  /** Callback fired when the utterance finishes naturally. */
  onEnd?: () => void;
}

export interface AudioHandle {
  /** Stop the sound immediately. */
  stop(): void;
}

export interface AudioServiceConfig {
  /** Master volume 0-1 applied to all output. Default 1. */
  masterVolume?: number;
}

// ---------------------------------------------------------------------------
// AudioService
// ---------------------------------------------------------------------------

export class AudioService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private activeSources = new Set<AudioBufferSourceNode | OscillatorNode>();
  private masterVolume: number;
  private activeUtterances = new Set<SpeechSynthesisUtterance>();

  constructor(config?: AudioServiceConfig) {
    this.masterVolume = Math.min(1, Math.max(0, Number(config?.masterVolume ?? 1)));
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Lazily initialise the AudioContext. Must be called after a user gesture
   * on browsers that require it. Safe to call multiple times.
   */
  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const Ctor =
      typeof AudioContext !== "undefined"
        ? AudioContext
        : (globalThis as any).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio API is not supported in this browser");
    const ctx: AudioContext = new Ctor();
    const gain = ctx.createGain();
    gain.gain.value = this.masterVolume;
    gain.connect(ctx.destination);
    this.ctx = ctx;
    this.masterGain = gain;
    return ctx;
  }

  /**
   * Resume the AudioContext if it was suspended (e.g. by autoplay policy).
   */
  async resume(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  }

  /**
   * Release all resources. The service should not be used after this.
   */
  dispose(): void {
    this.stopAll();
    this.buffers.clear();
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
      this.masterGain = null;
    }
  }

  // ── Master volume ────────────────────────────────────────────────────

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.min(1, Math.max(0, Number(volume) || 0));
    if (this.masterGain) {
      this.masterGain.gain.value = this.masterVolume;
    }
  }

  // ── Clip preloading ──────────────────────────────────────────────────

  /**
   * Fetch and decode audio files so they can be played instantly later.
   * Returns the number of clips successfully loaded. Clips that fail to
   * fetch/decode are silently skipped (a warning is logged).
   */
  async preloadClips(manifest: AudioClipManifest): Promise<number> {
    const ctx = this.ensureContext();
    let loaded = 0;
    const entries = Object.entries(manifest);
    const results = await Promise.allSettled(
      entries.map(async ([id, url]) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        this.buffers.set(id, audioBuffer);
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled") loaded += 1;
      else console.warn("[AudioService] preload failed:", r.reason);
    }
    return loaded;
  }

  /**
   * Returns true if a clip with this id has been preloaded.
   */
  hasClip(id: string): boolean {
    return this.buffers.has(id);
  }

  // ── Playback ─────────────────────────────────────────────────────────

  /**
   * Play a preloaded clip by id.
   * Throws if the clip has not been preloaded.
   */
  playClip(id: string, options?: PlayClipOptions): AudioHandle {
    const buffer = this.buffers.get(id);
    if (!buffer) throw new Error(`[AudioService] clip "${id}" not preloaded`);
    const ctx = this.ensureContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const vol = Math.min(1, Math.max(0, Number(options?.volume ?? 1)));
    const gain = ctx.createGain();
    gain.gain.value = vol;
    source.connect(gain);
    gain.connect(this.masterGain ?? ctx.destination);

    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      options?.onEnd?.();
    };
    source.start();

    return {
      stop: () => {
        try { source.stop(); } catch { /* already stopped */ }
        this.activeSources.delete(source);
      },
    };
  }

  /**
   * Play a sequence of clips one after another, with an optional gap
   * (in milliseconds) between each. Returns a promise that resolves
   * when the entire sequence has finished.
   */
  async playSequence(clipIds: string[], gapMs = 0): Promise<void> {
    for (let i = 0; i < clipIds.length; i++) {
      await new Promise<void>((resolve) => {
        this.playClip(clipIds[i], { onEnd: resolve });
      });
      if (gapMs > 0 && i < clipIds.length - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, gapMs));
      }
    }
  }

  /**
   * Play a synthesised tone at the given frequency and duration.
   */
  playTone(frequencyHz: number, durationMs: number, options?: PlayToneOptions): AudioHandle {
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    osc.type = options?.waveform ?? "sine";
    osc.frequency.value = Math.max(20, Number(frequencyHz) || 440);

    const vol = Math.min(1, Math.max(0, Number(options?.volume ?? 0.25)));
    const gain = ctx.createGain();
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(this.masterGain ?? ctx.destination);

    this.activeSources.add(osc);
    const dur = Math.max(1, Number(durationMs) || 100) / 1000;
    const now = ctx.currentTime;
    osc.start(now);
    osc.stop(now + dur);
    osc.onended = () => {
      this.activeSources.delete(osc);
    };

    return {
      stop: () => {
        try { osc.stop(); } catch { /* already stopped */ }
        this.activeSources.delete(osc);
      },
    };
  }

  // ── Speech synthesis ─────────────────────────────────────────────────

  /**
   * Speak a text string using the Web Speech API.
   *
   * Returns an AudioHandle whose `.stop()` cancels the utterance. The
   * returned promise (via `onEnd`) resolves when the utterance finishes.
   *
   * Known limitation: Chrome may not fire `onend` if the AudioContext has
   * been idle for ~15 s. In a live MATB session (prompts every few seconds)
   * this does not occur in practice.
   */
  speakText(text: string, options?: SpeakTextOptions): AudioHandle {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      console.warn("[AudioService] SpeechSynthesis not available");
      return { stop: () => {} };
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate   = Math.max(0.1, Math.min(10, Number(options?.rate   ?? 1)));
    utterance.pitch  = Math.max(0,   Math.min(2,  Number(options?.pitch  ?? 1)));
    utterance.volume = Math.max(0,   Math.min(1,  Number(options?.volume ?? 1)));

    // Voice selection: try named voices first, then lang prefix, then browser default.
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice: SpeechSynthesisVoice | undefined;
    if (options?.voiceNames?.length) {
      for (const name of options.voiceNames) {
        selectedVoice = voices.find((v) => v.name.toLowerCase() === name.toLowerCase());
        if (selectedVoice) break;
      }
    }
    if (!selectedVoice && options?.lang) {
      selectedVoice = voices.find((v) => v.lang.startsWith(options.lang!));
    }
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang  = selectedVoice.lang;
    } else if (options?.lang) {
      utterance.lang = options.lang;
    }

    this.activeUtterances.add(utterance);
    utterance.onend = () => {
      this.activeUtterances.delete(utterance);
      options?.onEnd?.();
    };
    utterance.onerror = () => {
      this.activeUtterances.delete(utterance);
    };

    window.speechSynthesis.speak(utterance);
    return {
      stop: () => {
        // cancel() stops all queued utterances; re-queue any that aren't ours.
        // In practice the comms task only queues one utterance at a time so
        // this is safe. For multi-utterance scenarios use stopSpeech() instead.
        this.activeUtterances.delete(utterance);
        window.speechSynthesis.cancel();
      },
    };
  }

  /**
   * Speak a sequence of text strings one after another.
   * Resolves when the last utterance finishes.
   */
  async speakSequence(texts: string[], options?: SpeakTextOptions): Promise<void> {
    for (const text of texts) {
      await new Promise<void>((resolve) => {
        this.speakText(text, { ...options, onEnd: resolve });
      });
    }
  }

  /**
   * Cancel all pending and active speech utterances.
   */
  stopSpeech(): void {
    this.activeUtterances.clear();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  // ── Bulk control ─────────────────────────────────────────────────────

  /**
   * Immediately stop all currently playing clips, tones, and speech.
   */
  stopAll(): void {
    for (const source of this.activeSources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.activeSources.clear();
    this.stopSpeech();
  }
}
