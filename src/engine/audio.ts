import { validateMusicTrim } from "./validation";
export interface VoiceEffect {
  pitch?: number;
  formant?: number;
  low?: number;
  high?: number;
  echo?: number;
  robot?: number;
}
export interface MusicOptions {
  volume: number;
  loop: boolean;
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  duck: boolean;
}
const processorCode = `
class VoiceProcessor extends AudioWorkletProcessor {
 static get parameterDescriptors(){return [{name:'pitch',defaultValue:0,minValue:-12,maxValue:12},{name:'robot',defaultValue:0,minValue:0,maxValue:1}];}
 constructor(){super();this.buffers=[new Float32Array(32768),new Float32Array(32768)];this.write=0;this.phase=0;this.osc=0;}
 process(inputs,outputs,params){const input=inputs[0],output=outputs[0];if(!input.length)return true;
 const semi=params.pitch[0],ratio=Math.pow(2,semi/12),robot=params.robot[0],window=sampleRate*.045;
 for(let i=0;i<output[0].length;i++){
 this.phase=(this.phase+(1-ratio)/window+1)%1;
 const phase2=(this.phase+.5)%1;
 const gain=(1-Math.cos(this.phase*2*Math.PI))*.5;
 this.osc=(this.osc+35/sampleRate)%1;
 for(let c=0;c<output.length;c++){
 const buf=this.buffers[c%2],dry=input[Math.min(c,input.length-1)][i]||0;buf[this.write]=dry;
 const read=(delay)=>{const index=(this.write-delay+32768)%32768;const j=Math.floor(index);return buf[j]*(1-(index-j))+buf[(j+1)%32768]*(index-j);};
 const shifted=Math.abs(semi)<.01?dry:read(32+this.phase*window)*gain+read(32+phase2*window)*(1-gain);
 output[c][i]=shifted*((1-robot)+robot*Math.sin(this.osc*2*Math.PI));}
 this.write=(this.write+1)%32768;}return true;}
}registerProcessor('bn-voice',VoiceProcessor);`;

export class AudioMixer {
  private ctx?: AudioContext;
  private source?: MediaElementAudioSourceNode;
  private worklet?: AudioWorkletNode;
  private voice?: GainNode;
  private analyser?: AnalyserNode;
  private low?: BiquadFilterNode;
  private high?: BiquadFilterNode;
  private formant?: BiquadFilterNode;
  private echo?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private music?: HTMLAudioElement;
  private musicSource?: MediaElementAudioSourceNode;
  private musicGain?: GainNode;
  private options: MusicOptions = {
    volume: 0.25,
    loop: true,
    start: 0,
    end: 0,
    fadeIn: 1,
    fadeOut: 1,
    duck: false,
  };
  private samples = new Float32Array(256);
  private effect: VoiceEffect = {};
  private playPending = false;
  private musicError?: Error;
  private initializing?: Promise<void>;
  constructor(
    private video: HTMLMediaElement,
    private onError?: (error: Error) => void,
  ) {}
  async init() {
    if (this.initializing) return this.initializing;
    this.initializing = this.initialize();
    try {
      await this.initializing;
    } finally {
      this.initializing = undefined;
    }
  }
  private async initialize() {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    const ctx = (this.ctx = new AudioContext());
    const url = URL.createObjectURL(
      new Blob([processorCode], { type: "text/javascript" }),
    );
    try {
      await ctx.audioWorklet.addModule(url);
    } catch (e) {
      await ctx.close().catch(() => {});
      this.ctx = undefined;
      throw new Error(
        "Audio effects could not initialize. Retry in a recent browser. " +
          (e instanceof Error ? e.message : ""),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
    this.source = ctx.createMediaElementSource(this.video);
    this.worklet = new AudioWorkletNode(ctx, "bn-voice");
    this.low = ctx.createBiquadFilter();
    this.low.type = "lowshelf";
    this.low.frequency.value = 280;
    this.high = ctx.createBiquadFilter();
    this.high.type = "highshelf";
    this.high.frequency.value = 2600;
    this.formant = ctx.createBiquadFilter();
    this.formant.type = "peaking";
    this.formant.Q.value = 0.7;
    this.voice = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.destination = ctx.createMediaStreamDestination();
    this.source
      .connect(this.worklet)
      .connect(this.low)
      .connect(this.high)
      .connect(this.formant)
      .connect(this.voice)
      .connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.analyser.connect(this.destination);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.18;
    this.echo = ctx.createGain();
    this.echo.gain.value = 0;
    this.formant.connect(delay).connect(this.echo).connect(this.voice);
    this.setVoice(this.effect);
    await ctx.resume();
  }
  get stream(): MediaStream | undefined {
    return this.destination?.stream;
  }
  get lastError(): Error | undefined {
    return this.musicError;
  }
  get musicDuration(): number {
    return Number.isFinite(this.music?.duration) ? this.music!.duration : 0;
  }
  setVoice(effect: VoiceEffect) {
    this.effect = effect;
    this.worklet?.parameters
      .get("pitch")
      ?.setValueAtTime(
        Math.max(-12, Math.min(12, effect.pitch ?? 0)),
        this.ctx!.currentTime,
      );
    this.worklet?.parameters
      .get("robot")
      ?.setValueAtTime(
        Math.max(0, Math.min(1, effect.robot ?? 0)),
        this.ctx!.currentTime,
      );
    if (this.low) this.low.gain.value = effect.low ?? 0;
    if (this.high) this.high.gain.value = effect.high ?? 0;
    // A broad resonant EQ gives a formant-like coloration; this is not a
    // spectral-envelope-preserving formant shifter or AI voice conversion.
    if (this.formant) {
      this.formant.frequency.value = 900 * (effect.formant ?? 1);
      this.formant.gain.value = (effect.formant ?? 1) === 1 ? 0 : 5;
    }
    if (this.echo)
      this.echo.gain.value = Math.max(0, Math.min(0.8, effect.echo ?? 0));
  }
  setVoiceVolume(volume: number) {
    if (this.voice) this.voice.gain.value = Math.max(0, Math.min(2, volume));
  }
  async setMusic(url: string | null) {
    this.music?.pause();
    this.musicSource?.disconnect();
    this.musicGain?.disconnect();
    this.music = undefined;
    this.musicError = undefined;
    this.playPending = false;
    if (!url) return;
    await this.init();
    const music = new Audio();
    music.crossOrigin = "anonymous";
    music.src = url;
    music.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        clean();
        reject(
          new Error("Music loading timed out. Try a smaller MP3 or WAV file."),
        );
      }, 20000);
      const clean = () => {
        clearTimeout(timer);
        music.removeEventListener("canplay", ready);
        music.removeEventListener("error", fail);
      };
      const ready = () => {
        clean();
        if (!Number.isFinite(music.duration) || music.duration <= 0)
          reject(new Error("Music duration could not be read."));
        else resolve();
      };
      const fail = () => {
        clean();
        reject(
          new Error("This audio file could not be decoded. Try MP3 or WAV."),
        );
      };
      music.addEventListener("canplay", ready, { once: true });
      music.addEventListener("error", fail, { once: true });
      music.load();
    });
    // A newly selected track starts with its full duration instead of stale
    // trim bounds from the previously selected track.
    this.options = { ...this.options, start: 0, end: 0 };
    this.music = music;
    this.musicSource = this.ctx!.createMediaElementSource(music);
    this.musicGain = this.ctx!.createGain();
    this.musicSource.connect(this.musicGain);
    this.musicGain.connect(this.ctx!.destination);
    this.musicGain.connect(this.destination!);
  }
  setMusicOptions(options: Partial<MusicOptions>) {
    const next = { ...this.options, ...options };
    validateMusicTrim(next.start, next.end, this.music?.duration);
    if (
      !Number.isFinite(next.volume) ||
      next.volume < 0 ||
      next.volume > 2 ||
      !Number.isFinite(next.fadeIn) ||
      next.fadeIn < 0 ||
      !Number.isFinite(next.fadeOut) ||
      next.fadeOut < 0
    )
      throw new Error(
        "Music volume must be between 0 and 2 and fades must be non-negative.",
      );
    this.options = next;
  }
  sync(time: number, playing: boolean, duration: number) {
    const m = this.music;
    if (!m || !this.ctx || !this.musicGain || this.musicError) return;
    const o = this.options;
    const end =
      o.end > o.start ? Math.min(o.end, m.duration || o.end) : m.duration || 0;
    const span = end - o.start;
    if (span <= 0) return;
    const target = o.start + (o.loop ? time % span : Math.min(time, span));
    if (Math.abs(m.currentTime - target) > 0.3) m.currentTime = target;
    let level = o.volume;
    if (o.fadeIn > 0) level *= Math.min(1, time / o.fadeIn);
    if (o.fadeOut > 0)
      level *= Math.min(1, Math.max(0, (duration - time) / o.fadeOut));
    if (o.duck && this.analyser) {
      this.analyser.getFloatTimeDomainData(this.samples);
      const rms = Math.sqrt(
        this.samples.reduce((n, v) => n + v * v, 0) / this.samples.length,
      );
      level *= rms > 0.035 ? 0.25 : 1;
    }
    this.musicGain.gain.setTargetAtTime(
      Math.max(0, level),
      this.ctx.currentTime,
      0.07,
    );
    if (playing && (o.loop || time < span)) {
      if (m.paused && !this.playPending) {
        this.playPending = true;
        void m
          .play()
          .catch((e) => {
            // A pause during a pending play is expected when scrubbing or stopping.
            if (e instanceof DOMException && e.name === "AbortError") return;
            this.musicError = new Error(
              "Music playback was blocked or failed. Reselect the track and press Play. " +
                (e instanceof Error ? e.message : ""),
            );
            this.onError?.(this.musicError);
          })
          .finally(() => {
            this.playPending = false;
          });
      }
    } else m.pause();
  }
  dispose() {
    this.music?.pause();
    this.source?.disconnect();
    void this.ctx?.close();
    this.ctx = undefined;
  }
}
