import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "./style.css";
const Editor = lazy(() => import("./Editor"));
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  ScanFace,
  Captions,
  AudioLines,
  Moon,
  Sun,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
function App() {
  const [page, setPage] = React.useState(location.pathname);
  const [light, setLight] = React.useState(
    localStorage.getItem("bn-theme") === "light",
  );
  const [menu, setMenu] = React.useState(false);
  React.useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
    localStorage.setItem("bn-theme", light ? "light" : "dark");
  }, [light]);
  React.useEffect(() => {
    const pop = () => setPage(location.pathname);
    addEventListener("popstate", pop);
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(console.error);
}
    return () => removeEventListener("popstate", pop);
  }, []);
  const go = (p: string) => {
    history.pushState({}, "", p);
    setPage(p);
    setMenu(false);
    window.scrollTo(0, 0);
  };
  return (
    <>
      <header className="navbar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            go("/");
          }}
        >
          <img src="/assets/logo.png" alt="BN tech emblem" />
          <b>
            BN<span>edits</span>
            <i>STUDIO</i>
          </b>
        </a>
        <nav className={menu ? "open" : ""}>
          <a
            href="/#features"
            onClick={() => {
              if (page !== "/") go("/");
            }}
          >
            The toolkit
          </a>
          <a
            href="/#how"
            onClick={() => {
              if (page !== "/") go("/");
            }}
          >
            How it works
          </a>
          <a
            href="/about"
            onClick={(e) => {
              e.preventDefault();
              go("/about");
            }}
          >
            About & privacy
          </a>
        </nav>
        <div className="nav-actions">
          <button
            className="icon"
            aria-label="Toggle light and dark theme"
            onClick={() => setLight(!light)}
          >
            {light ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {page !== "/editor" && (
            <button className="primary small" onClick={() => go("/editor")}>
              Open studio <ArrowUpRight size={16} />
            </button>
          )}
          <button
            className="icon menu"
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {page === "/editor" ? (
        <Suspense
          fallback={
            <div className="loading">
              <img src="/assets/logo.png" alt="" />
              Opening your studio…
            </div>
          }
        >
          <Editor />
        </Suspense>
      ) : page === "/about" ? (
        <About go={go} />
      ) : (
        <Landing go={go} />
      )}
      <footer>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            go("/");
          }}
        >
          BN<span>edits</span>
        </a>
        <span>Made for creators. Built around privacy.</span>
        <a
          href="/about"
          onClick={(e) => {
            e.preventDefault();
            go("/about");
          }}
        >
          Credits & privacy <ArrowUpRight size={14} />
        </a>
      </footer>
    </>
  );
}
function Landing({ go }: { go: (p: string) => void }) {
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" /> YOUR FACELESS CREATOR STUDIO
          </div>
          <h1>
            Your story.
            <br />A new <em>face.</em>
          </h1>
          <p>
            Big ideas don’t need a face reveal. Turn your videos into something
            unmistakably you—with cartoon faces, bold captions, and a whole new
            voice.
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={() => go("/editor")}>
              Start creating <ArrowUpRight size={20} />
            </button>
            <a href="#how" className="textlink">
              See how it works <ArrowRight size={17} />
            </a>
          </div>
          <div className="trust">
            <ShieldCheck size={17} />
            <span>On your device. No sign-up. No uploads.</span>
          </div>
        </div>
        <div className="hero-art">
          <div className="art-top">
            <span className="status-dot" /> THE CREATOR IS YOU{" "}
            <span className="tag">100% LOCAL</span>
          </div>
          <div className="poster">
            <div className="poster-grid" />
            <span className="poster-label">
              MAKE A LITTLE
              <br />
              MAIN CHARACTER ENERGY.
            </span>
            <img
              src="/assets/faces/cartoon-01.svg"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
              alt="Original cartoon face"
              className="hero-face"
            />
            <div className="face-frame">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="floating-chip">
              <ScanFace size={15} /> New face. Same you.
            </div>
            <div className="poster-caption">
              STAY <span>BEHIND</span>
              <br />
              THE STORY.
            </div>
            <div className="poster-bottom">
              <span>01 / YOUR NEXT GREAT IDEA</span>
              <span>
                REC <b>●</b>
              </span>
            </div>
          </div>
          <div className="art-controls">
            <AudioLines size={20} />
            <div className="mini-wave">
              {Array.from({ length: 34 }, (_, i) => (
                <i
                  key={i}
                  style={{ height: 8 + Math.sin(i * 2.3) ** 2 * 20 }}
                />
              ))}
            </div>
            <span>00:12 / 00:30</span>
          </div>
          <div className="sticker">
            LESS CAMERA SHY.
            <br />
            <b>MORE CREATIVE.</b>
            <Sparkles size={19} />
          </div>
        </div>
      </section>
      <section className="feature-strip">
        <span>
          <ScanFace />
          100 original faces
        </span>
        <span>
          <Sparkles />
          50 creative filters
        </span>
        <span>
          <AudioLines />
          53 voice effects
        </span>
        <span>
          <Captions />
          Multilingual captions
        </span>
      </section>
      <section id="features" className="section">
        <div className="section-head">
          <div>
            <div className="eyebrow">THE WHOLE CREATIVE KIT</div>
            <h2>One tab. Endless personalities.</h2>
          </div>
          <p>
            From the first frame to the final download.
            <br />
            Keep your workflow simple, and your ideas big.
          </p>
        </div>
        <div className="feature-cards">
          <article className="feature-card face-card">
            <div className="face-row">
              {["human-01", "cartoon-01", "anime-01"].map((id) => (
                <img
                  key={id}
                  src={`/assets/faces/${id}.svg`}
                  alt="Original avatar"
                />
              ))}
            </div>
            <span className="number">01 / CHANGE YOUR LOOK</span>
            <h3>A face for every story.</h3>
            <p>
              Assign original characters to tracked faces. Fine-tune the fit and
              bring expressions along.
            </p>
          </article>
          <article className="feature-card">
            <div className="caption-demo">
              MAKE EVERY
              <br />
              <mark>WORD</mark> COUNT.
            </div>
            <span className="number">02 / GET YOUR MESSAGE ACROSS</span>
            <h3>Captions with character.</h3>
            <p>
              Transcribe locally, edit every word, and give your captions a
              style of their own.
            </p>
          </article>
          <article className="feature-card">
            <div className="voice-demo">
              <AudioLines size={56} />
              <span>
                Original <ArrowRight size={13} /> Radio
              </span>
            </div>
            <span className="number">03 / SET THE TONE</span>
            <h3>Sound like your idea.</h3>
            <p>
              Explore playful voice effects and layer in original music. No
              voice cloning. Just creativity.
            </p>
          </article>
        </div>
      </section>
      <section id="how" className="section how">
        <div>
          <div className="eyebrow">FROM RAW CLIP TO READY</div>
          <h2>
            Less setup.
            <br />
            More “I made that.”
          </h2>
          <button className="primary" onClick={() => go("/editor")}>
            Make your first edit <ArrowUpRight size={18} />
          </button>
        </div>
        <div>
          {[
            [
              "01",
              "Drop your video",
              "Pick a clip from your device. It stays right there.",
            ],
            [
              "02",
              "Make it yours",
              "Choose a face, shape your sound, and add captions.",
            ],
            [
              "03",
              "Download your story",
              "Render in your browser and take your creation anywhere.",
            ],
          ].map(([n, h, p]) => (
            <div className="step" key={n}>
              <span>{n}</span>
              <div>
                <h3>{h}</h3>
                <p>{p}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="privacy-banner">
        <ShieldCheck size={32} />
        <div>
          <h3>Your videos never leave your device.</h3>
          <p>Local processing. No account. No server storing your footage.</p>
        </div>
        <a
          href="/about"
          onClick={(e) => {
            e.preventDefault();
            go("/about");
          }}
        >
          Our privacy promise <ArrowUpRight size={18} />
        </a>
      </section>
      <section className="section faq">
        <div className="eyebrow">GOOD QUESTIONS</div>
        <h2>A little clarity before you create.</h2>
        {[
          [
            "Is BNedits free?",
            "The source and included assets are free to use, with no paid APIs. Hosting providers and browser capabilities have their own limits, so we cannot guarantee any third-party free plan forever.",
          ],
          [
            "Does it work on my phone?",
            "The interface works on mobile. AI models and video export are demanding: use short clips and 480p on low-memory devices. Keep the tab in the foreground during export.",
          ],
          [
            "Do I need an internet connection?",
            "You need a connection for the initial app and model downloads. Models are cached where browser storage permits. Subsequent local editing can work offline, but browsers may evict caches.",
          ],
          [
            "Can I export MP4?",
            "BNedits uses native recording when available, or converts with ffmpeg.wasm. If your device cannot encode MP4, you can download WebM instead.",
          ],
          [
            "Is face replacement guaranteed to hide my identity?",
            "No. Detection can miss faces or lose tracking during motion or occlusion. Review every exported frame before relying on an edit for privacy.",
          ],
        ].map(([q, a]) => (
          <details key={q}>
            <summary>
              {q}
              <ChevronDown size={17} />
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
    </main>
  );
}
function About({ go }: { go: (p: string) => void }) {
  return (
    <main className="section about">
      <div className="eyebrow">MADE FOR INDEPENDENT CREATORS</div>
      <h1>
        A studio that
        <br />
        stays with <em>you.</em>
      </h1>
      <p>
        BNedits is a frontend-only creative editor. Your video, audio, and
        caption content are processed locally. There is no account, upload
        endpoint, database server, analytics, or paid API.
      </p>
      <h2>Privacy & local storage</h2>
      <p>
        Project settings and captions are autosaved in IndexedDB on this
        browser. Video and uploaded audio are not saved: reselect them after
        refresh. Models and application files may be cached. Use the editor’s
        clear-project action to remove settings, and browser site settings to
        clear all caches.
      </p>
      <p>
        When you enable AI features, the browser downloads models and runtime
        files from Hugging Face, Google, or jsDelivr. These services receive
        ordinary network metadata, such as your IP address, but not your video
        or transcript. Font styles use device font fallbacks unless you load
        optional Google Fonts in the caption editor.
      </p>
      <h2>Original assets & credits</h2>
      <p>
        The 100 SVG faces and the three synthesized instrumental music loops
        supplied with this project are original generated assets dedicated under
        CC0 1.0. They do not depict licensed characters. The uploaded BN tech
        emblem is supplied by the project owner; its rights remain with its
        owner.
      </p>
      <p>
        MediaPipe Face Landmarker (Apache 2.0), Transformers.js (Apache 2.0),
        Whisper models (MIT), React (MIT), Vite (MIT), Lucide (ISC), and
        ffmpeg.wasm (MIT wrapper; the bundled FFmpeg core has separate LGPL/GPL
        terms depending on codecs). See THIRD_PARTY.md before redistributing an
        encoder build. Google Fonts have individual open font licenses.
      </p>
      <h2>Honest creative tools</h2>
      <p>
        Voice presets are DSP effects, not AI voice cloning. Landmark-based 2D
        overlays approximate head pose, cannot reconstruct a hidden face, and
        are not an anonymity guarantee. Transcription can make mistakes in any
        language; Telugu and Hindi support does not imply perfect accuracy.
      </p>
      <button className="primary" onClick={() => go("/editor")}>
        Open your studio <ArrowUpRight size={18} />
      </button>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
