import React, { useEffect, useRef, useState } from "react";
import {
  Upload,
  ScanFace,
  SlidersHorizontal,
  AudioLines,
  Music2,
  Captions,
  Download,
  Undo2,
  Redo2,
  Play,
  Pause,
  Scissors,
  Trash2,
  Plus,
  Check,
  ShieldCheck,
  ChevronRight,
  RotateCcw,
  FolderOpen,
  X,
  LoaderCircle,
  Volume2,
  ArrowUpRight,
  GripVertical,
  Maximize,
  Settings2,
} from "lucide-react";
import {
  initial,
  type Project,
  type Caption,
  type Assignment,
  saveFile,
  clock,
  uid,
  loadProject,
  saveProject,
} from "./model";
import { filters, voices, captionStyles } from "./catalog";
import { compose, dimensions, preloadFace } from "./compositor";
import { parseSrt, toSrt } from "./srt";
import { validateProject } from "./validate";
import type { Tracker, TrackedFace } from "./engine/tracking";
import type { AudioMixer } from "./engine/audio";
type FaceAsset = { id: string; name: string; category: string; src: string };
type Track = { id: string; name: string; src: string; duration: number };
const tabs = [
  ["faces", "Faces", ScanFace],
  ["filters", "Filters", SlidersHorizontal],
  ["voice", "Voice", AudioLines],
  ["music", "Music", Music2],
  ["captions", "Captions", Captions],
  ["export", "Export", Download],
] as const;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export default function Editor() {
  const [p, setP] = useState<Project>(initial),
    pr = useRef(p);
  pr.current = p;
  const [ready, setReady] = useState(false),
    [saved, setSaved] = useState("Saved locally"),
    [tab, setTab] = useState("faces"),
    [category, setCategory] = useState("All"),
    [assets, setAssets] = useState<FaceAsset[]>([]),
    [tracks, setTracks] = useState<Track[]>([]),
    [source, setSource] = useState(""),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [faces, setFaces] = useState<TrackedFace[]>([]),
    [tracking, setTracking] = useState(false),
    [person, setPerson] = useState(1),
    [selectedClip, setSelectedClip] = useState(0),
    [selectedCaption, setSelectedCaption] = useState(""),
    [search, setSearch] = useState(""),
    [language, setLanguage] = useState("auto"),
    [speechModel, setSpeechModel] = useState<"tiny" | "base">("tiny"),
    [indeterminate, setIndeterminate] = useState(false),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(""),
    [progress, setProgress] = useState(0),
    [exporting, setExporting] = useState(false),
    [voiceGroup, setVoiceGroup] = useState("All"),
    [musicUrl, setMusicUrl] = useState(""),
    [restore, setRestore] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    file = useRef<File | null>(null),
    input = useRef<HTMLInputElement>(null),
    history = useRef<Project[]>([]),
    future = useRef<Project[]>([]),
    tracker = useRef<Tracker | null>(null),
    mixer = useRef<AudioMixer | null>(null),
    faceRef = useRef<TrackedFace[]>([]),
    abort = useRef<AbortController | null>(null),
    exportRef = useRef(false),
    lastTrack = useRef(0),
    sampleTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    pointer = useRef(new Map<number, { x: number; y: number }>());
  const weak =
    ((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8) <=
      4 || navigator.hardwareConcurrency <= 4;
  const tell = (s: string) => setToast(s);
  const edit = (patch: Partial<Project> | ((p: Project) => Project)) => {
    history.current.push(structuredClone(pr.current));
    if (history.current.length > 60) history.current.shift();
    future.current = [];
    setP((old) =>
      typeof patch === "function" ? patch(old) : { ...old, ...patch },
    );
  };
  const undo = () => {
    const old = history.current.pop();
    if (old) {
      future.current.push(pr.current);
      setP(old);
    }
  };
  const redo = () => {
    const next = future.current.pop();
    if (next) {
      history.current.push(pr.current);
      setP(next);
    }
  };
  useEffect(() => {
    loadProject()
      .then((v) => {
        if (v) {
          setP(validateProject(v));
          setRestore(true);
        }
      })
      .catch(() => setSaved("Autosave unavailable"))
      .finally(() => setReady(true));
    fetch("/assets/faces/manifest.json")
      .then((r) => r.json())
      .then(setAssets)
      .catch(() => tell("Face library could not load. Refresh to retry."));
    fetch("/assets/music/manifest.json")
      .then((r) => r.json())
      .then(setTracks)
      .catch(() => tell("Music library could not load. Refresh to retry."));
    return () => {
      tracker.current?.dispose();
      mixer.current?.dispose();
      abort.current?.abort();
      if (sampleTimer.current) clearTimeout(sampleTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaved("Saving…");
    const t = setTimeout(
      () =>
        saveProject(p)
          .then(() => setSaved("Saved locally"))
          .catch(() => setSaved("Storage full — download project settings")),
      500,
    );
    return () => clearTimeout(t);
  }, [p, ready]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    Object.values(p.assignments).forEach((a) =>
      preloadFace(a.asset).catch(() => tell("Could not load face artwork.")),
    );
  }, [p.assignments]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.code === "Space" && source) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [source]);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const v = video.current,
        c = canvas.current;
      if (v && c && !exportRef.current) {
        const d = dimensions(v, weak ? 360 : 540, pr.current.ratio);
        if (c.width !== d.width || c.height !== d.height) {
          c.width = d.width;
          c.height = d.height;
        }
        compose(c, v, pr.current, faceRef.current, v.currentTime);
        if (
          tracker.current &&
          v.readyState >= 2 &&
          performance.now() - lastTrack.current > 90
        ) {
          lastTrack.current = performance.now();
          tracker.current
            .detect(v)
            .then((result) => {
              if (result) {
                faceRef.current = result;
                setFaces(result);
              }
            })
            .catch((e) => {
              tell(e.message);
              tracker.current?.dispose();
              tracker.current = null;
              setTracking(false);
            });
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [source, weak]);
  useEffect(() => {
    if (!mixer.current) return;
    applyAudio();
  }, [
    p.voice,
    p.voiceVolume,
    p.musicVolume,
    p.musicStart,
    p.musicEnd,
    p.fade,
    p.loop,
    p.duck,
  ]);
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );
  useEffect(
    () => () => {
      if (musicUrl.startsWith("blob:")) URL.revokeObjectURL(musicUrl);
    },
    [musicUrl],
  );
  function applyAudio() {
    try {
      const m = mixer.current;
      if (!m) return;
      const v = voices.find((v) => v.id === pr.current.voice);
      m.setVoice(
        v
          ? {
              pitch: v.pitch,
              formant: v.formant,
              low: v.eq,
              high: -v.eq * 0.4,
              echo: v.echo,
              robot: v.robot ? 0.6 : 0,
            }
          : {},
      );
      m.setVoiceVolume(pr.current.voiceVolume);
      m.setMusicOptions({
        volume: pr.current.musicVolume,
        start: pr.current.musicStart,
        end: pr.current.musicEnd,
        fadeIn: pr.current.fade,
        fadeOut: pr.current.fade,
        loop: pr.current.loop,
        duck: pr.current.duck,
      });
    } catch (e) {
      tell(errorText(e));
    }
  }
  async function initAudio() {
    if (!video.current) return;
    if (!mixer.current) {
      const { AudioMixer } = await import("./engine/audio");
      mixer.current = new AudioMixer(video.current, (e) => tell(e.message));
      await mixer.current.init();
      applyAudio();
      if (musicUrl) await mixer.current.setMusic(musicUrl);
    } else await mixer.current.init();
  }
  async function togglePlay() {
    if (!source) return input.current?.click();
    const v = video.current!;
    if (!v.paused) {
      v.pause();
      return;
    }
    try {
      await initAudio();
      const seg = pr.current.segments;
      if (
        seg.length &&
        !seg.some((s) => v.currentTime >= s.start && v.currentTime < s.end)
      )
        v.currentTime = seg[0].start;
      await v.play();
    } catch (e) {
      tell(errorText(e));
    }
  }
  const seek = (n: number) => {
    if (video.current) {
      video.current.currentTime = clamp(n, 0, p.duration);
      setTime(n);
      tracker.current?.reset().catch(() => {});
    }
  };
  function updateTime() {
    const v = video.current!;
    setTime(v.currentTime);
    mixer.current?.sync(v.currentTime, !v.paused, p.duration);
    if (!exportRef.current && !v.paused && p.segments.length) {
      const seg = p.segments;
      const current = seg.findIndex(
        (s) => v.currentTime >= s.start - 0.05 && v.currentTime < s.end,
      );
      if (current < 0) {
        const next = seg.find((s) => s.start > v.currentTime);
        if (next) v.currentTime = next.start;
        else {
          v.pause();
          v.currentTime = seg[0].start;
        }
      }
    }
  }
  function onFile(f?: File) {
    if (!f) return;
    if (!/\.(mp4|mov|webm)$/i.test(f.name)) {
      tell("Choose an MP4, MOV, or WebM file.");
      return;
    }
    if (
      f.size > 500 * 1024 * 1024 &&
      !confirm(
        "This video exceeds 500 MB. Shorter clips are safer on low-memory devices. Continue?",
      )
    )
      return;
    const same = f.name === p.fileName && f.size === p.fileSize;
    if (
      !same &&
      p.fileName &&
      !confirm(
        "Open a new video and reset edits? Download project settings first if needed.",
      )
    )
      return;
    video.current?.pause();
    tracker.current?.dispose();
    tracker.current = null;
    setTracking(false);
    setFaces([]);
    faceRef.current = [];
    file.current = f;
    setSource(URL.createObjectURL(f));
    if (!same) {
      history.current = [];
      future.current = [];
      setP({
        ...initial,
        name: f.name.replace(/\.[^.]+$/, ""),
        fileName: f.name,
        fileSize: f.size,
      });
      setMusicUrl("");
      mixer.current?.setMusic(null);
    }
    setRestore(false);
  }
  function loaded() {
    const v = video.current!;
    if (!Number.isFinite(v.duration) || !v.videoWidth) {
      tell(
        "The browser could not read this file. Try an MP4 encoded with H.264.",
      );
      return;
    }
    setP((old) => ({
      ...old,
      duration: v.duration,
      segments: old.segments.length
        ? old.segments
        : [{ start: 0, end: v.duration }],
    }));
    if (v.duration > 600)
      tell(
        "This clip is over 10 minutes. Trim it down before using AI features or exporting.",
      );
  }
  async function enableTracking() {
    if (!source) {
      tell("Upload a video to start face tracking.");
      return;
    }
    setBusy("Loading face tracker…");
    try {
      const { Tracker } = await import("./engine/tracking");
      const t = new Tracker();
      await t.init(setBusy);
      tracker.current = t;
      setTracking(true);
      const found = await t.detect(video.current!);
      if (found) {
        faceRef.current = found;
        setFaces(found);
        if (found[0]) setPerson(found[0].id);
      }
      tell(
        "Tracking enabled. Play your video to detect faces. Review tracking before sharing.",
      );
    } catch (e) {
      tell(errorText(e));
    } finally {
      setBusy("");
    }
  }
  function assign(asset: string) {
    const a = p.assignments[person] || {
      asset,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      mouth: false,
    };
    edit({ assignments: { ...p.assignments, [person]: { ...a, asset } } });
    if (!tracking)
      tell("Face selected. Enable tracking to attach it to a person.");
  }
  function adjust(patch: Partial<Assignment>) {
    const a = p.assignments[person];
    if (a)
      edit({ assignments: { ...p.assignments, [person]: { ...a, ...patch } } });
  }
  async function chooseMusic(url: string, id: string) {
    setBusy("Loading audio locally…");
    setIndeterminate(true);
    try {
      await initAudio();
      await mixer.current!.setMusic(url || null);
      setMusicUrl(url);
      edit({
        music: id,
        musicStart: 0,
        musicEnd: mixer.current!.musicDuration || 30,
      });
    } catch (e) {
      tell(errorText(e));
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    } finally {
      setBusy("");
    }
  }
  async function generate() {
    if (!file.current) {
      tell("Upload your video first.");
      return;
    }
    if (
      p.captions.length &&
      !confirm("Replace current captions with a new transcription?")
    )
      return;
    setBusy("Preparing audio locally…");
    setProgress(0);
    setIndeterminate(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const { decodeAudio, transcribe } = await import("./engine/captions");
      const audio = await decodeAudio(file.current);
      if (controller.signal.aborted) return;
      const result = await transcribe(
        audio,
        language,
        (v) => {
          setProgress(v.progress);
          setIndeterminate(!!v.indeterminate);
          setBusy(v.status);
        },
        controller.signal,
        speechModel,
      );
      edit({ captions: result as Caption[] });
      tell(
        `Generated ${result.length} caption lines. Review the words and timings.`,
      );
    } catch (e) {
      tell(errorText(e));
    } finally {
      setBusy("");
      abort.current = null;
    }
  }
  function capEdit(id: string, patch: Partial<Caption>) {
    edit({
      captions: p.captions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }
  function splitCaption(c: Caption) {
    const words = c.text.split(/\s+/),
      middle = Math.ceil(words.length / 2),
      at = time > c.start && time < c.end ? time : (c.start + c.end) / 2;
    edit({
      captions: p.captions.flatMap((x) =>
        x.id === c.id
          ? [
              { ...c, end: at, text: words.slice(0, middle).join(" ") },
              {
                ...c,
                id: uid(),
                start: at,
                text: words.slice(middle).join(" ") || "…",
              },
            ]
          : [x],
      ),
    });
  }
  function splitClip() {
    const i = p.segments.findIndex(
      (s) => time > s.start + 0.05 && time < s.end - 0.05,
    );
    if (i < 0) {
      tell("Move the playhead inside a clip to split.");
      return;
    }
    const s = p.segments[i];
    edit({
      segments: [
        ...p.segments.slice(0, i),
        { start: s.start, end: time },
        { start: time, end: s.end },
        ...p.segments.slice(i + 1),
      ],
    });
    setSelectedClip(i + 1);
  }
  async function doExport() {
    if (Object.keys(p.assignments).length && !tracker.current) {
      tell("Enable face tracking before exporting assigned faces.");
      setTab("faces");
      return;
    }
    if (p.music && !musicUrl) {
      tell("Reselect your music track before export, or remove it.");
      setTab("music");
      return;
    }
    if (!source || !p.segments.length) {
      tell("Add a video and keep at least one timeline clip.");
      return;
    }
    video.current!.pause();
    setExporting(true);
    exportRef.current = true;
    setBusy("Preparing your export…");
    setProgress(0);
    setIndeterminate(false);
    abort.current = new AbortController();
    try {
      await initAudio();
      await document.fonts.ready;
      await Promise.all(
        Object.values(p.assignments).map((a) => preloadFace(a.asset)),
      );
      const { exportVideo } = await import("./engine/export");
      const v = video.current!,
        c = canvas.current!,
        d = dimensions(v, p.resolution, p.ratio);
      await tracker.current?.reset();
      const result = await exportVideo({
        video: v,
        canvas: c,
        width: d.width,
        height: d.height,
        start: p.segments[0].start,
        end: p.segments.at(-1)!.end,
        segments: p.segments,
        fps: p.fps,
        format: p.format,
        audioStream: mixer.current?.stream,
        signal: abort.current.signal,
        render: async (t: number) => {
          if (tracker.current) {
            const found = await tracker.current.detect(v);
            if (found) faceRef.current = found;
          }
          mixer.current?.sync(t, true, p.duration);
          compose(c, v, pr.current, faceRef.current, t);
        },
        onProgress: (value: number, phase: string, remaining: number) => {
          setProgress(value * 100);
          setBusy(
            phase +
              (remaining > 0
                ? ` · about ${Math.ceil(remaining)}s remaining`
                : ""),
          );
        },
      });
      saveFile(result.blob, `${p.name || "BNedits"}.${result.extension}`);
      tell(
        result.warning ||
          "Your video is ready. Review the downloaded result before sharing.",
      );
    } catch (e) {
      tell(errorText(e));
    } finally {
      exportRef.current = false;
      setExporting(false);
      setBusy("");
      abort.current = null;
      setPlaying(false);
      mixer.current?.sync(video.current!.currentTime, false, p.duration);
    }
  }
  const activeCap = p.captions.find((c) => c.id === selectedCaption),
    style = activeCap ? { ...p.style, ...activeCap.style } : p.style;
  const styleEdit = (patch: Partial<typeof p.style>) =>
    activeCap
      ? capEdit(activeCap.id, { style: { ...activeCap.style, ...patch } })
      : edit({ style: { ...p.style, ...patch } });
  const assignment = p.assignments[person];
  return (
    <main className="editor">
      <input
        ref={input}
        type="file"
        hidden
        accept="video/mp4,video/quicktime,video/webm,.mov"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {(!window.isSecureContext ||
        !("MediaRecorder" in window) ||
        !("AudioWorkletNode" in window)) && (
        <div className="notice">
          Full editing needs HTTPS (or localhost) and a recent Chrome, Edge, or
          Safari with AudioWorklet and MediaRecorder support. Try Chrome or Edge
          if a feature fails.
        </div>
      )}
      <div className="projectbar">
        <div className="project-name">
          <span className="project-icon">
            <FolderOpen size={18} />
          </span>
          <input
            aria-label="Project name"
            value={p.name}
            maxLength={80}
            onChange={(e) => edit({ name: e.target.value })}
          />
          <span className="save-status">
            <Check size={13} />
            {saved}
          </span>
        </div>
        <div className="row">
          <button
            className="icon"
            aria-label="Undo"
            disabled={!history.current.length || !!busy}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon"
            aria-label="Redo"
            disabled={!future.current.length || !!busy}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
          <span className="divider" />
          <button
            className="secondary small"
            onClick={() => input.current?.click()}
            disabled={!!busy}
          >
            <Upload size={15} /> <span className="hide-phone">Add media</span>
          </button>
          <button className="primary small" onClick={() => setTab("export")}>
            <Download size={16} /> Download
          </button>
        </div>
      </div>
      {restore && (
        <div className="notice">
          Your edits are restored. Reselect{" "}
          <b>{p.fileName || "your original video"}</b> to continue.{" "}
          <button onClick={() => input.current?.click()}>
            Locate video <FolderOpen size={14} />
          </button>
        </div>
      )}
      <div className="workspace">
        <aside className="toolrail">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setSearch("");
              }}
              aria-label={label}
              aria-pressed={tab === id}
            >
              <Icon size={22} />
              <span>{label}</span>
            </button>
          ))}
        </aside>
        <aside className="toolpanel">
          <div className="panel-heading">
            <div className="eyebrow">YOUR CREATIVE TOOLKIT</div>
            <h2>
              {tab === "faces"
                ? "Meet your new face."
                : tab === "filters"
                  ? "Find your signature look."
                  : tab === "voice"
                    ? "Change the tone."
                    : tab === "music"
                      ? "Give it a soundtrack."
                      : tab === "captions"
                        ? "Make every word count."
                        : "Ready for the world."}
            </h2>
            <p>
              {tab === "faces"
                ? "Original characters. A whole new you."
                : tab === "export"
                  ? "Everything rendered right on your device."
                  : "Small details. A big difference."}
            </p>
          </div>
          {tab === "faces" && (
            <>
              <div className="row spread">
                <span className="tiny-label">FACE TRACKING</span>
                <button
                  className={tracking ? "pill on" : "pill"}
                  disabled={!!busy}
                  onClick={() => {
                    if (tracking) {
                      tracker.current?.dispose();
                      tracker.current = null;
                      setTracking(false);
                      faceRef.current = [];
                      setFaces([]);
                    } else enableTracking();
                  }}
                >
                  {tracking ? <Check size={13} /> : <ScanFace size={13} />}{" "}
                  {tracking ? "Enabled" : "Enable"}
                </button>
              </div>
              <p className="hint">
                {faces.length
                  ? `${faces.filter((f) => f.opacity > 0).length} visible · select a person below`
                  : "Track up to 8 visible faces. Review crossings and occlusions."}
              </p>
              <div className="person-row">
                {Array.from(
                  new Set([
                    1,
                    ...faces.map((f) => f.id),
                    ...Object.keys(p.assignments).map(Number),
                  ]),
                )
                  .sort((a, b) => a - b)
                  .map((id) => (
                    <button
                      key={id}
                      className={person === id ? "selected" : ""}
                      onClick={() => setPerson(id)}
                    >
                      Person {id}
                    </button>
                  ))}
              </div>
              <div className="chips">
                {["All", "Human", "Cartoon", "Anime", "Animals/Fun"].map(
                  (x) => (
                    <button
                      key={x}
                      className={category === x ? "selected" : ""}
                      onClick={() => setCategory(x)}
                    >
                      {x}
                    </button>
                  ),
                )}
              </div>
              <input
                className="search"
                placeholder="Find your character…"
                aria-label="Search faces"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="face-grid">
                {assets
                  .filter(
                    (a) =>
                      (category === "All" || a.category === category) &&
                      a.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((a) => (
                    <button
                      key={a.id}
                      className={assignment?.asset === a.src ? "selected" : ""}
                      title={a.name}
                      onClick={() => assign(a.src)}
                    >
                      <img src={a.src} alt="" loading="lazy" />
                      <span>{a.name}</span>
                      {assignment?.asset === a.src && <Check size={13} />}
                    </button>
                  ))}
              </div>
              {assignment && (
                <div className="adjust">
                  <h3>Fine-tune person {person}</h3>
                  <Range
                    label="Size"
                    value={assignment.scale}
                    min={0.5}
                    max={2.5}
                    step={0.01}
                    onChange={(n) => adjust({ scale: n })}
                  />
                  <Range
                    label="Horizontal offset"
                    value={assignment.x}
                    min={-0.3}
                    max={0.3}
                    step={0.005}
                    onChange={(n) => adjust({ x: n })}
                  />
                  <Range
                    label="Vertical offset"
                    value={assignment.y}
                    min={-0.3}
                    max={0.3}
                    step={0.005}
                    onChange={(n) => adjust({ y: n })}
                  />
                  <Range
                    label="Rotation"
                    value={assignment.rotation}
                    min={-90}
                    max={90}
                    step={1}
                    onChange={(n) => adjust({ rotation: n })}
                  />
                  <Toggle
                    label="Mouth sync"
                    checked={assignment.mouth}
                    onChange={(n) => adjust({ mouth: n })}
                  />
                  <p className="hint">
                    Drag the preview to adjust; pinch with two fingers to
                    resize. Tracking is approximate—review the whole clip.
                  </p>
                  <button
                    className="secondary full"
                    onClick={() => {
                      const a = { ...p.assignments };
                      delete a[person];
                      edit({ assignments: a });
                    }}
                  >
                    Remove face
                  </button>
                </div>
              )}
            </>
          )}
          {tab === "filters" && (
            <>
              <Range
                label="Intensity"
                value={p.intensity}
                min={0}
                max={1}
                step={0.01}
                onChange={(n) => edit({ intensity: n })}
              />
              <button
                className="secondary full"
                onClick={() => edit({ filter: "none" })}
              >
                <RotateCcw size={15} />
                Remove filter
              </button>
              <div className="filter-grid">
                {filters.map((f, i) => (
                  <button
                    key={f.id}
                    className={p.filter === f.id ? "selected" : ""}
                    onClick={() => edit({ filter: f.id })}
                  >
                    <div style={{ filter: f.filter }}>
                      <span
                        className="filter-orb"
                        style={{ transform: `rotate(${i * 7}deg)` }}
                      />
                    </div>
                    <span>{f.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === "voice" && (
            <>
              <div className="info-box">
                <AudioLines size={18} />
                <p>
                  Creative voice effects, not AI voice cloning. Pitch and
                  formant effects are approximate.
                </p>
              </div>
              <button
                className={`secondary full ${p.voice === "original" ? "selected" : ""}`}
                onClick={() => edit({ voice: "original" })}
              >
                Keep original voice{" "}
                {p.voice === "original" && <Check size={14} />}
              </button>
              <div className="chips">
                {["All", "Male-style", "Female-style", "Bonus"].map((c) => (
                  <button
                    key={c}
                    className={voiceGroup === c ? "selected" : ""}
                    onClick={() => setVoiceGroup(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <Range
                label="Voice volume"
                value={p.voiceVolume}
                min={0}
                max={2}
                step={0.01}
                onChange={(n) => edit({ voiceVolume: n })}
              />
              <button
                className="primary full"
                disabled={!source || !!busy}
                onClick={async () => {
                  try {
                    await initAudio();
                    applyAudio();
                    await video.current!.play();
                    if (sampleTimer.current) clearTimeout(sampleTimer.current);
                    sampleTimer.current = setTimeout(
                      () => video.current?.pause(),
                      5000,
                    );
                  } catch (e) {
                    tell(errorText(e));
                  }
                }}
              >
                <Play size={15} />
                Preview 5 seconds
              </button>
              <div className="preset-list">
                {voices
                  .filter(
                    (v) =>
                      voiceGroup === "All" ||
                      v.category
                        .toLowerCase()
                        .replace(" ", "-")
                        .startsWith(
                          voiceGroup.toLowerCase().replace("-style", ""),
                        ),
                  )
                  .map((v) => (
                    <button
                      className={p.voice === v.id ? "selected" : ""}
                      key={v.id}
                      onClick={() => edit({ voice: v.id })}
                    >
                      <span className="preset-icon">
                        <AudioLines size={18} />
                      </span>
                      <span>
                        {v.name}
                        <small>{v.category}</small>
                      </span>
                      {p.voice === v.id ? (
                        <Check size={15} />
                      ) : (
                        <ChevronRight size={15} />
                      )}
                    </button>
                  ))}
              </div>
            </>
          )}
          {tab === "music" && (
            <>
              <label className="upload-mini">
                <Upload size={18} />
                Upload your own audio
                <input
                  type="file"
                  accept="audio/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 100 * 1024 * 1024) {
                        tell("Use an audio file under 100 MB.");
                        return;
                      }
                      chooseMusic(URL.createObjectURL(f), "upload:" + f.name);
                    }
                  }}
                />
              </label>
              <div className="tiny-label">ORIGINAL CC0 LOOPS</div>
              <div className="preset-list">
                {tracks.map((t) => (
                  <button
                    key={t.id}
                    className={p.music === t.id ? "selected" : ""}
                    onClick={() => chooseMusic(t.src, t.id)}
                  >
                    <span className="preset-icon">
                      <Music2 size={18} />
                    </span>
                    <span>
                      {t.name}
                      <small>{t.duration}s · CC0</small>
                    </span>
                    {p.music === t.id ? (
                      <Check size={15} />
                    ) : (
                      <Plus size={15} />
                    )}
                  </button>
                ))}
              </div>
              {p.music && (
                <>
                  <p className="hint">
                    Selected: {p.music}
                    {!musicUrl ? " — select again to restore audio." : ""}
                  </p>
                  <button
                    className="secondary full"
                    onClick={() => chooseMusic("", "")}
                  >
                    Remove music
                  </button>
                </>
              )}
              <Range
                label="Music volume"
                value={p.musicVolume}
                min={0}
                max={1}
                step={0.01}
                onChange={(n) => edit({ musicVolume: n })}
              />
              <Range
                label="Voice volume"
                value={p.voiceVolume}
                min={0}
                max={2}
                step={0.01}
                onChange={(n) => edit({ voiceVolume: n })}
              />
              <Range
                label="Fade in / out (seconds)"
                value={p.fade}
                min={0}
                max={5}
                step={0.1}
                onChange={(n) => edit({ fade: n })}
              />
              <div className="two-cols">
                <NumberInput
                  label="Music in (s)"
                  value={p.musicStart}
                  max={Math.min(
                    p.musicEnd - 0.1,
                    (mixer.current?.musicDuration || 3600) - 0.1,
                  )}
                  onChange={(n) => edit({ musicStart: n })}
                />
                <NumberInput
                  label="Music out (s)"
                  value={p.musicEnd}
                  min={p.musicStart + 0.1}
                  max={mixer.current?.musicDuration || 3600}
                  onChange={(n) => edit({ musicEnd: n })}
                />
              </div>
              <Toggle
                label="Loop music"
                checked={p.loop}
                onChange={(n) => edit({ loop: n })}
              />
              <Toggle
                label="Auto-duck under speech"
                checked={p.duck}
                onChange={(n) => edit({ duck: n })}
              />
              <p className="hint">
                Ducking follows audio energy, including loud non-speech sounds.
                Uploaded audio stays on your device.
              </p>
            </>
          )}
          {tab === "captions" && (
            <>
              <label className="field">
                Speech model
                <select
                  value={speechModel}
                  onChange={(e) =>
                    setSpeechModel(e.target.value as "tiny" | "base")
                  }
                >
                  <option value="tiny">Tiny — lower memory, recommended</option>
                  <option value="base">
                    Base — larger, potentially more accurate
                  </option>
                </select>
              </label>
              <label className="field">
                Transcription language
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="auto">Auto-detect</option>
                  <option value="english">English</option>
                  <option value="hindi">Hindi</option>
                  <option value="telugu">Telugu</option>
                  <option value="tamil">Tamil</option>
                  <option value="spanish">Spanish</option>
                </select>
              </label>
              <button
                className="primary full"
                disabled={!!busy || !source}
                onClick={generate}
              >
                <Captions size={17} />
                Generate captions
              </button>
              <p className="hint">
                First use downloads a speech model. Processing is local and may
                take several minutes.
              </p>
              <div className="row">
                <label className="secondary small">
                  Import SRT
                  <input
                    type="file"
                    hidden
                    accept=".srt,text/plain"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const caps = parseSrt(await f.text());
                        if (!caps.length)
                          tell("No valid SRT timestamps found.");
                        else edit({ captions: caps });
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  className="secondary small"
                  onClick={() =>
                    saveFile(
                      new Blob([toSrt(p.captions)], { type: "text/plain" }),
                      "captions.srt",
                    )
                  }
                  disabled={!p.captions.length}
                >
                  Export SRT
                </button>
                <button
                  className="icon"
                  title="Add caption"
                  onClick={() => {
                    const id = uid();
                    edit({
                      captions: [
                        ...p.captions,
                        {
                          id,
                          start: Math.max(
                            0,
                            Math.min(time, (p.duration || 3) - 0.1),
                          ),
                          end: Math.min(p.duration || time + 3, time + 3),
                          text: "Your story starts here.",
                        },
                      ],
                    });
                    setSelectedCaption(id);
                  }}
                >
                  <Plus size={18} />
                </button>
              </div>
              <div className="caption-list">
                {p.captions.map((c, i) => (
                  <div
                    key={c.id}
                    className={`caption-edit ${selectedCaption === c.id ? "selected" : ""}`}
                  >
                    <button
                      className="caption-number"
                      onClick={() => {
                        setSelectedCaption(c.id);
                        seek(c.start);
                      }}
                    >
                      LINE {String(i + 1).padStart(2, "0")}{" "}
                      <ChevronRight size={12} />
                    </button>
                    <textarea
                      aria-label={`Caption ${i + 1} text`}
                      value={c.text}
                      onFocus={() => setSelectedCaption(c.id)}
                      onChange={(e) => capEdit(c.id, { text: e.target.value })}
                    />
                    <div className="two-cols">
                      <NumberInput
                        label="Start"
                        value={c.start}
                        max={c.end - 0.05}
                        onChange={(n) => capEdit(c.id, { start: n })}
                      />
                      <NumberInput
                        label="End"
                        value={c.end}
                        min={c.start + 0.05}
                        max={Math.max(p.duration, c.end)}
                        onChange={(n) => capEdit(c.id, { end: n })}
                      />
                    </div>
                    <div className="row">
                      <button className="micro" onClick={() => splitCaption(c)}>
                        Split
                      </button>
                      <button
                        className="micro"
                        disabled={!p.captions[i + 1]}
                        onClick={() => {
                          const n = p.captions[i + 1];
                          edit({
                            captions: p.captions.flatMap((x) =>
                              x.id === c.id
                                ? [
                                    {
                                      ...c,
                                      end: Math.max(c.end, n.end),
                                      text: c.text + " " + n.text,
                                    },
                                  ]
                                : x.id === n.id
                                  ? []
                                  : [x],
                            ),
                          });
                        }}
                      >
                        Merge next
                      </button>
                      <button
                        className="icon"
                        aria-label="Delete caption"
                        onClick={() =>
                          edit({
                            captions: p.captions.filter((x) => x.id !== c.id),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="row spread">
                <h3>Caption style</h3>
                <button
                  className="micro"
                  onClick={() => setSelectedCaption("")}
                >
                  {activeCap ? "Use global style" : "Global"}
                </button>
              </div>
              <p className="hint">
                Editing{" "}
                {activeCap
                  ? "selected caption"
                  : "all captions without individual overrides"}
                .
              </p>
              <label className="field">
                Style preset
                <select
                  value=""
                  onChange={(e) => {
                    const s = captionStyles.find(
                      (s) => s.id === e.target.value,
                    );
                    if (s)
                      styleEdit({
                        font: s.font,
                        color: s.color,
                        stroke: s.stroke,
                        background: s.background,
                        animation: s.animation,
                      });
                  }}
                >
                  <option value="" disabled>
                    Choose from 50 styles
                  </option>
                  {captionStyles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary full"
                onClick={async () => {
                  try {
                    const { loadCaptionFonts } = await import("./fonts");
                    await loadCaptionFonts();
                    tell("Open fonts loaded.");
                  } catch (e) {
                    tell(errorText(e));
                  }
                }}
              >
                Load optional Google Fonts
              </button>
              <div className="color-row">
                {(["color", "stroke", "background"] as const).map((k) => (
                  <label key={k}>
                    {k}
                    <input
                      type="color"
                      aria-label={k}
                      value={
                        style[k].slice(0, 7).startsWith("#")
                          ? style[k].slice(0, 7)
                          : "#000000"
                      }
                      onChange={(e) => styleEdit({ [k]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
              <button
                className="micro"
                onClick={() => styleEdit({ background: "transparent" })}
              >
                Clear background box
              </button>
              <Range
                label="Font size"
                value={style.size}
                min={16}
                max={100}
                step={1}
                onChange={(n) => styleEdit({ size: n })}
              />
              <Range
                label="Horizontal position"
                value={style.x}
                min={0.05}
                max={0.95}
                step={0.01}
                onChange={(n) => styleEdit({ x: n })}
              />
              <Range
                label="Vertical position"
                value={style.y}
                min={0.05}
                max={0.95}
                step={0.01}
                onChange={(n) => styleEdit({ y: n })}
              />
              <label className="field">
                Alignment
                <select
                  value={style.align}
                  onChange={(e) =>
                    styleEdit({ align: e.target.value as CanvasTextAlign })
                  }
                >
                  {["left", "center", "right"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Animation
                <select
                  value={style.animation}
                  onChange={(e) => styleEdit({ animation: e.target.value })}
                >
                  {[
                    "none",
                    "pop",
                    "typewriter",
                    "highlight",
                    "bounce",
                    "fade",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v === "highlight" ? "Word-by-word highlight" : v}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {tab === "export" && (
            <>
              <div className="export-card">
                <Download size={28} />
                <h3>Your next great story.</h3>
                <p>
                  {clock(p.segments.reduce((s, c) => s + c.end - c.start, 0))} ·{" "}
                  {p.resolution}p · {p.fps} FPS
                </p>
              </div>
              <label className="field">
                Resolution
                <select
                  value={p.resolution}
                  onChange={(e) => edit({ resolution: +e.target.value })}
                >
                  {[480, 720, 1080].map((n) => (
                    <option key={n} value={n}>
                      {n}p {n === 720 ? "— recommended" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Aspect ratio
                <select
                  value={p.ratio}
                  onChange={(e) => edit({ ratio: e.target.value })}
                >
                  {["9:16", "1:1", "16:9", "original"].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Frame rate
                <select
                  value={p.fps}
                  onChange={(e) => edit({ fps: +e.target.value })}
                >
                  {[24, 25, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} fps
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                File format
                <select
                  value={p.format}
                  onChange={(e) =>
                    edit({ format: e.target.value as "mp4" | "webm" })
                  }
                >
                  <option value="mp4">MP4 — native or local conversion</option>
                  <option value="webm">WebM — lighter export</option>
                </select>
              </label>
              <button
                className="primary full"
                onClick={doExport}
                disabled={!!busy || !source}
              >
                <Download size={18} />
                Render & download
              </button>
              <p className="hint">
                Keep this tab visible. Export takes at least the clip’s
                duration; MP4 conversion adds time and memory. If conversion
                fails, try WebM or a shorter 480p clip.
              </p>
              <div className="panel-divider" />
              <button
                className="secondary full"
                onClick={() =>
                  saveFile(
                    new Blob([JSON.stringify(p, null, 2)], {
                      type: "application/json",
                    }),
                    "BNedits-project.json",
                  )
                }
              >
                Download project settings
              </button>
              <label className="secondary full">
                Import project settings
                <input
                  type="file"
                  hidden
                  accept=".json"
                  onChange={async (e) => {
                    try {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const v = JSON.parse(await f.text());
                      if (
                        !v ||
                        !Array.isArray(v.captions) ||
                        !Array.isArray(v.segments) ||
                        !v.style ||
                        typeof v.duration !== "number"
                      )
                        throw new Error("Invalid project file");
                      if (
                        v.captions.some(
                          (c: any) =>
                            typeof c.text !== "string" ||
                            !Number.isFinite(c.start) ||
                            !Number.isFinite(c.end) ||
                            c.end <= c.start,
                        )
                      )
                        throw new Error("Invalid captions");
                      edit(validateProject(v));
                      setRestore(true);
                      tell(
                        "Settings imported. Select the matching source video and music.",
                      );
                    } catch (e) {
                      tell(errorText(e));
                    }
                  }}
                />
              </label>
              <button
                className="danger full"
                onClick={() => {
                  if (
                    confirm(
                      "Clear saved settings and edits? Your original files are untouched.",
                    )
                  ) {
                    video.current?.pause();
                    edit(structuredClone(initial));
                    setSource("");
                    file.current = null;
                    setMusicUrl("");
                    mixer.current?.setMusic(null);
                    setRestore(false);
                  }
                }}
              >
                Clear project
              </button>
            </>
          )}
        </aside>
        <section className="preview-panel">
          <div className="preview-top">
            <span>
              <span className="status-dot" /> LIVE PREVIEW
            </span>
            <span>
              {source
                ? `${weak ? "360" : "540"}p preview`
                : "YOUR NEXT STORY STARTS HERE"}{" "}
              <ShieldCheck size={14} />
            </span>
          </div>
          <div
            className="preview-stage"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) onFile(e.dataTransfer.files[0]);
            }}
          >
            <video
              ref={video}
              src={source || undefined}
              playsInline
              preload="auto"
              onLoadedMetadata={loaded}
              onTimeUpdate={updateTime}
              onPlay={() => setPlaying(true)}
              onPause={() => {
                setPlaying(false);
                mixer.current?.sync(
                  video.current!.currentTime,
                  false,
                  p.duration,
                );
              }}
              onError={() =>
                tell("This codec is unsupported. Try an H.264 MP4 or VP9 WebM.")
              }
              className="source-video"
            />
            {source ? (
              <>
                <canvas
                  ref={canvas}
                  aria-label="Composited video preview. Drag to adjust selected face."
                  className={assignment ? "adjustable" : ""}
                  onPointerDown={(e) => {
                    if (!assignment || exporting) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    pointer.current.set(e.pointerId, {
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                  onPointerMove={(e) => {
                    const old = pointer.current.get(e.pointerId);
                    if (!old || !assignment) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (pointer.current.size === 2) {
                      const other = [...pointer.current.entries()].find(
                        ([id]) => id !== e.pointerId,
                      )![1];
                      const before = Math.hypot(
                          old.x - other.x,
                          old.y - other.y,
                        ),
                        after = Math.hypot(
                          e.clientX - other.x,
                          e.clientY - other.y,
                        );
                      if (before > 2)
                        adjust({
                          scale: clamp(
                            (assignment.scale * after) / before,
                            0.5,
                            2.5,
                          ),
                        });
                    } else
                      adjust({
                        x: clamp(
                          assignment.x + (e.clientX - old.x) / rect.width,
                          -0.3,
                          0.3,
                        ),
                        y: clamp(
                          assignment.y + (e.clientY - old.y) / rect.height,
                          -0.3,
                          0.3,
                        ),
                      });
                    pointer.current.set(e.pointerId, {
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                  onPointerUp={(e) => pointer.current.delete(e.pointerId)}
                  onPointerCancel={(e) => pointer.current.delete(e.pointerId)}
                />
              </>
            ) : (
              <div className="upload-zone">
                <div className="upload-art">
                  <div />
                  <ScanFace size={46} />
                  <span>+</span>
                </div>
                <h2>Give your story a new face.</h2>
                <p>
                  Drop a video here to start creating.
                  <br />
                  Your footage stays on your device.
                </p>
                <button
                  className="primary"
                  onClick={() => input.current?.click()}
                >
                  <Upload size={18} />
                  Choose a video
                </button>
                <span className="upload-formats">
                  MP4, MOV, WEBM · UP TO 500 MB RECOMMENDED
                </span>
                <div className="empty-faces">
                  {["human-01", "cartoon-02", "anime-03", "animals-04"].map(
                    (id) => (
                      <img key={id} src={`/assets/faces/${id}.svg`} alt="" />
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="playback">
            <span className="timecode">
              {clock(time)} <em>/ {clock(p.duration)}</em>
            </span>
            <div className="row">
              <button
                className="icon"
                aria-label="Restart preview"
                disabled={!source || !!busy}
                onClick={() => seek(p.segments[0]?.start || 0)}
              >
                <RotateCcw size={16} />
              </button>
              <button
                className="play-button"
                aria-label={playing ? "Pause" : "Play"}
                disabled={!!busy}
                onClick={togglePlay}
              >
                {playing ? <Pause size={19} /> : <Play size={19} />}
              </button>
              <span className="keyboard-hint">SPACE</span>
            </div>
            <button
              className="icon"
              aria-label="Full screen preview"
              onClick={() =>
                canvas.current
                  ?.requestFullscreen()
                  .catch(() => tell("Fullscreen unavailable in this browser."))
              }
              disabled={!source}
            >
              <Maximize size={17} />
            </button>
          </div>
          <div className="timeline">
            <div className="timeline-toolbar">
              <span className="tiny-label">YOUR TIMELINE</span>
              <div className="row">
                <button
                  className="micro"
                  onClick={splitClip}
                  disabled={!source || !!busy}
                >
                  <Scissors size={14} />
                  Split
                </button>
                <button
                  className="icon"
                  aria-label="Remove selected clip"
                  disabled={p.segments.length < 2 || !!busy}
                  onClick={() => {
                    edit({
                      segments: p.segments.filter((_, i) => i !== selectedClip),
                    });
                    setSelectedClip(0);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <input
              aria-label="Timeline playhead"
              className="seek"
              type="range"
              min="0"
              max={p.duration || 1}
              step="0.01"
              value={time}
              onChange={(e) => seek(+e.target.value)}
              disabled={!source || !!busy}
            />
            <div className="ruler">
              {[0, 0.25, 0.5, 0.75, 1].map((x) => (
                <span key={x}>{clock(p.duration * x)}</span>
              ))}
            </div>
            <div className="timeline-track">
              <span className="track-icon">
                <Play size={14} />
              </span>
              <div className="clip-lane">
                {p.segments.map((s, i) => (
                  <button
                    key={i}
                    className={`video-clip ${selectedClip === i ? "selected" : ""}`}
                    style={{
                      left: `${(s.start / (p.duration || 1)) * 100}%`,
                      width: `${((s.end - s.start) / (p.duration || 1)) * 100}%`,
                    }}
                    onClick={() => {
                      setSelectedClip(i);
                      seek(s.start);
                    }}
                  >
                    <span>
                      {i + 1} · {p.fileName}
                    </span>
                  </button>
                ))}
                {!source && (
                  <span className="empty-lane">
                    Add a video to begin your edit
                  </span>
                )}
              </div>
            </div>
            <div className="timeline-track">
              <span className="track-icon">
                <Captions size={14} />
              </span>
              <div
                className="clip-lane caption-lane"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain"),
                    c = p.captions.find((c) => c.id === id);
                  if (c) {
                    const r = e.currentTarget.getBoundingClientRect(),
                      start = clamp(
                        ((e.clientX - r.left) / r.width) * p.duration,
                        0,
                        Math.max(0, p.duration - (c.end - c.start)),
                      );
                    capEdit(id, { start, end: start + c.end - c.start });
                  }
                }}
              >
                {p.captions.map((c) => (
                  <button
                    key={c.id}
                    draggable
                    className="caption-block"
                    title="Drag to change caption start time"
                    style={{
                      left: `${(c.start / (p.duration || 1)) * 100}%`,
                      width: `${((c.end - c.start) / (p.duration || 1)) * 100}%`,
                    }}
                    onClick={() => {
                      setTab("captions");
                      setSelectedCaption(c.id);
                      seek(c.start);
                    }}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", c.id)
                    }
                  >
                    {c.text}
                  </button>
                ))}
              </div>
            </div>
            {p.segments[selectedClip] && (
              <div className="trim-controls">
                <span className="hint">Clip {selectedClip + 1} trim</span>
                <NumberInput
                  label="In"
                  value={p.segments[selectedClip].start}
                  min={selectedClip ? p.segments[selectedClip - 1].end : 0}
                  max={p.segments[selectedClip].end - 0.05}
                  onChange={(n) =>
                    edit({
                      segments: p.segments.map((s, i) =>
                        i === selectedClip ? { ...s, start: n } : s,
                      ),
                    })
                  }
                />
                <NumberInput
                  label="Out"
                  value={p.segments[selectedClip].end}
                  min={p.segments[selectedClip].start + 0.05}
                  max={p.segments[selectedClip + 1]?.start || p.duration}
                  onChange={(n) =>
                    edit({
                      segments: p.segments.map((s, i) =>
                        i === selectedClip ? { ...s, end: n } : s,
                      ),
                    })
                  }
                />
              </div>
            )}
          </div>
          <div className="editor-footnote">
            <ShieldCheck size={13} />
            {weak
              ? "Low-memory mode · reduced preview quality"
              : "Local processing · your media stays on your device"}
            <span>BNedits / CREATOR STUDIO</span>
          </div>
        </section>
      </div>
      {busy && (
        <div className="modal-backdrop">
          <div
            className="progress-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Processing"
          >
            <img src="/assets/logo.png" alt="" />
            <LoaderCircle className="spin" size={26} />
            <h2>{exporting ? "Making your story." : "Working locally."}</h2>
            <p role="status">{busy}</p>
            <progress max={100} value={indeterminate ? undefined : progress} />
            <span>
              {indeterminate ? "Processing…" : `${Math.round(progress)}%`} ·
              keep this tab open
            </span>
            <button
              className="secondary"
              disabled={!abort.current}
              onClick={() => abort.current?.abort()}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            className="icon"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </main>
  );
}
function errorText(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong. Please retry.";
}
function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <b>{Number(value.toFixed(2))}</b>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(+e.target.value)}
      />
    </label>
  );
}
function NumberInput({
  label,
  value,
  min = 0,
  max = 36000,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="number-field">
      {label}
      <input
        type="number"
        step="0.05"
        min={min}
        max={max}
        value={Number(value.toFixed(2))}
        onChange={(e) => {
          const n = +e.target.value;
          if (Number.isFinite(n)) onChange(clamp(n, min, max));
        }}
      />
    </label>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (n: boolean) => void;
}) {
  return (
    <label className="toggle-field">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
