"use client";

import { useEffect, useRef, useState } from "react";

type Tool = "pen" | "line" | "arrow" | "circle" | "laser";
type Point = { x: number; y: number };
type Stroke = { tool: Tool; points: Point[]; color: string; width: number };
type Corner = "top-left" | "top-right";

const COLORS = ["#E8593C", "#F2C230", "#3B8BD4", "#3AA66B", "#F5F5F0"];
const LASER_LIFE_MS = 650;

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${sec}`;
}

export default function ReviewRecorder() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const composeRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(4);
  const [rate, setRate] = useState(1);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [current, setCurrent] = useState<Stroke | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoMuted, setVideoMuted] = useState(false);

  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [webcamCorner, setWebcamCorner] = useState<Corner>("top-right");
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const [recording, setRecording] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const laserPointsRef = useRef<{ x: number; y: number; t: number }[]>([]);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  // keep canvases sized to the displayed video
  useEffect(() => {
    const resize = () => {
      const overlay = overlayRef.current;
      const wrap = wrapRef.current;
      if (!overlay || !wrap) return;
      overlay.width = wrap.clientWidth;
      overlay.height = wrap.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [videoUrl]);

  function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const pts = s.points;
    if (pts.length < 2) return;

    if (s.tool === "pen") {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (s.tool === "line" || s.tool === "arrow") {
      const a = pts[0];
      const b = pts[pts.length - 1];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (s.tool === "arrow") {
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const head = 12 + s.width;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(
          b.x - head * Math.cos(angle - Math.PI / 7),
          b.y - head * Math.sin(angle - Math.PI / 7)
        );
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(
          b.x - head * Math.cos(angle + Math.PI / 7),
          b.y - head * Math.sin(angle + Math.PI / 7)
        );
        ctx.stroke();
      }
    } else if (s.tool === "circle") {
      const a = pts[0];
      const b = pts[pts.length - 1];
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawLaser(ctx: CanvasRenderingContext2D) {
    const now = performance.now();
    const pts = laserPointsRef.current.filter((p) => now - p.t < LASER_LIFE_MS);
    laserPointsRef.current = pts;
    for (const p of pts) {
      const age = now - p.t;
      const alpha = 1 - age / LASER_LIFE_MS;
      const radius = 9 * alpha + 3;
      ctx.beginPath();
      ctx.fillStyle = `rgba(232, 62, 48, ${alpha})`;
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function redraw() {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    for (const s of strokesRef.current) drawStroke(ctx, s);
    if (currentRef.current) drawStroke(ctx, currentRef.current);
    drawLaser(ctx);
  }

  // always-on redraw loop so the laser trail fades even without new pointer events
  const redrawRef = useRef(redraw);
  redrawRef.current = redraw;
  useEffect(() => {
    let id: number;
    const loop = () => {
      redrawRef.current();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  function posFromEvent(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "laser") return;
    setDrawing(true);
    const p = posFromEvent(e);
    setCurrent({ tool, points: [p], color, width: lineWidth });
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = posFromEvent(e);
    if (tool === "laser") {
      laserPointsRef.current.push({ ...p, t: performance.now() });
      return;
    }
    if (!drawing || !current) return;
    if (tool === "pen") {
      setCurrent({ ...current, points: [...current.points, p] });
    } else {
      setCurrent({ ...current, points: [current.points[0], p] });
    }
  }

  function onPointerUp() {
    if (tool === "laser") return;
    if (current) setStrokes((s) => [...s, current]);
    setCurrent(null);
    setDrawing(false);
  }

  function clearDrawing() {
    setStrokes([]);
    setCurrent(null);
  }

  function undoStroke() {
    setStrokes((s) => s.slice(0, -1));
  }

  function handleFile(file: File) {
    setResultUrl(null);
    setVideoUrl(URL.createObjectURL(file));
    setStrokes([]);
    setCurrentTime(0);
    setDuration(0);
  }

  function setPlaybackRate(r: number) {
    setRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  }

  function stepFrame(dir: 1 | -1) {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, v.currentTime + dir * (1 / 30));
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  }

  function seekTo(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setCurrentTime(t);
  }

  async function toggleWebcam() {
    if (webcamEnabled) {
      webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
      setWebcamEnabled(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      webcamStreamRef.current = stream;
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
        await webcamVideoRef.current.play();
      }
      setWebcamEnabled(true);
    } catch {
      setMicError("Couldn't access the webcam. Check your browser's camera permission.");
    }
  }

  function drawWebcamBubble(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const v = webcamVideoRef.current;
    if (!webcamEnabled || !v || v.readyState < 2) return;
    const radius = Math.max(36, Math.min(w, h) * 0.09);
    const margin = 16;
    const cx = webcamCorner === "top-left" ? margin + radius : w - margin - radius;
    const cy = margin + radius;

    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) return;
    const size = Math.min(vw, vh);
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(v, sx, sy, size, size, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#F5F5F0";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  async function startRecording() {
    const v = videoRef.current;
    const overlay = overlayRef.current;
    const compose = composeRef.current;
    if (!v || !overlay || !compose) return;
    setMicError(null);
    setResultUrl(null);

    compose.width = overlay.width;
    compose.height = overlay.height;
    const ctx = compose.getContext("2d")!;

    let micStream: MediaStream | null = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;
    } catch {
      setMicError(
        "Couldn't access the microphone. Check your browser's mic permission and try again."
      );
      return;
    }

    const drawFrame = () => {
      const w = compose.width;
      const h = compose.height;
      ctx.clearRect(0, 0, w, h);
      const vw = v.videoWidth || w;
      const vh = v.videoHeight || h;
      const scale = Math.min(w / vw, h / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(v, dx, dy, dw, dh);
      ctx.drawImage(overlay, 0, 0, w, h);
      drawWebcamBubble(ctx, w, h);
      rafRef.current = requestAnimationFrame(drawFrame);
    };
    rafRef.current = requestAnimationFrame(drawFrame);

    const canvasStream = compose.captureStream(30);
    const mixed = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...micStream.getAudioTracks(),
    ]);

    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";
    const recorder = new MediaRecorder(mixed, { mimeType: mime });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setResultUrl(URL.createObjectURL(blob));
    };
    recorderRef.current = recorder;
    recorder.start();
    v.currentTime = 0;
    v.play();
    setRecording(true);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    videoRef.current?.pause();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 px-6 py-4">
        <h1 className="text-lg font-medium">Review tool — working prototype</h1>
        <p className="text-sm text-stone-500">
          Nothing here is saved to a server yet. Load a test clip, try the
          tools, record yourself, download the result.
        </p>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {!videoUrl && (
          <label className="flex h-64 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 bg-white text-stone-500 hover:border-stone-400">
            <span className="text-sm font-medium">Load a video to test with</span>
            <span className="text-xs">Any .mp4 or .mov from your computer — this is just for testing</span>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => e.target.files && handleFile(e.target.files[0])}
            />
          </label>
        )}

        {videoUrl && (
          <div className="space-y-4">
            <div
              ref={wrapRef}
              className="relative aspect-video w-full overflow-hidden rounded-xl bg-black"
            >
              <video
                ref={videoRef}
                src={videoUrl}
                controls={false}
                muted={videoMuted}
                className="h-full w-full object-contain"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => {
                  setDuration(e.currentTarget.duration);
                  const overlay = overlayRef.current;
                  const wrap = wrapRef.current;
                  if (overlay && wrap) {
                    overlay.width = wrap.clientWidth;
                    overlay.height = wrap.clientHeight;
                  }
                }}
              />
              <canvas
                ref={overlayRef}
                className="absolute inset-0 h-full w-full touch-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              />
              <video
                ref={webcamVideoRef}
                muted
                playsInline
                className={`pointer-events-none absolute top-4 h-24 w-24 rounded-full border-2 border-stone-100 object-cover shadow-lg ${
                  webcamEnabled ? "block" : "hidden"
                } ${webcamCorner === "top-left" ? "left-4" : "right-4"}`}
              />
              {recording && (
                <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Recording
                </div>
              )}
            </div>

            {/* scrub bar */}
            <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-3">
              <span className="w-10 text-right text-xs tabular-nums text-stone-500">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.01}
                value={Math.min(currentTime, duration || 0)}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-full accent-stone-900"
              />
              <span className="w-10 text-xs tabular-nums text-stone-500">
                {formatTime(duration)}
              </span>
            </div>

            {/* transport controls */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white p-3">
              <button
                onClick={togglePlay}
                className="w-20 rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white"
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button
                onClick={() => stepFrame(-1)}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
              >
                ◀ Frame
              </button>
              <button
                onClick={() => stepFrame(1)}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
              >
                Frame ▶
              </button>
              <button
                onClick={() => setVideoMuted((m) => !m)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  videoMuted ? "bg-stone-900 text-white" : "border border-stone-300"
                }`}
              >
                {videoMuted ? "Video muted" : "Mute video"}
              </button>
              <div className="mx-2 h-5 w-px bg-stone-200" />
              <span className="text-xs text-stone-500">Speed</span>
              {[0.25, 0.5, 0.75, 1].map((r) => (
                <button
                  key={r}
                  onClick={() => setPlaybackRate(r)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    rate === r
                      ? "bg-stone-900 text-white"
                      : "border border-stone-300"
                  }`}
                >
                  {r}x
                </button>
              ))}
            </div>

            {/* drawing tools */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white p-3">
              {(["pen", "line", "arrow", "circle", "laser"] as Tool[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTool(t)}
                  className={`rounded-md px-3 py-1.5 text-sm capitalize ${
                    tool === t ? "bg-stone-900 text-white" : "border border-stone-300"
                  }`}
                >
                  {t === "laser" ? "Laser pointer" : t}
                </button>
              ))}
              <div className="mx-2 h-5 w-px bg-stone-200" />
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`h-7 w-7 rounded-full border-2 ${
                    color === c ? "border-stone-900" : "border-transparent"
                  }`}
                  aria-label={`color ${c}`}
                />
              ))}
              <input
                type="range"
                min={2}
                max={12}
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                className="mx-2 w-24"
              />
              <div className="mx-2 h-5 w-px bg-stone-200" />
              <button
                onClick={undoStroke}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
              >
                Undo
              </button>
              <button
                onClick={clearDrawing}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
              >
                Clear all
              </button>
            </div>

            {/* webcam controls */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white p-3">
              <button
                onClick={toggleWebcam}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  webcamEnabled ? "bg-stone-900 text-white" : "border border-stone-300"
                }`}
              >
                {webcamEnabled ? "Face: on" : "Show my face"}
              </button>
              {webcamEnabled && (
                <>
                  <span className="text-xs text-stone-500">Position</span>
                  <button
                    onClick={() => setWebcamCorner("top-left")}
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      webcamCorner === "top-left"
                        ? "bg-stone-900 text-white"
                        : "border border-stone-300"
                    }`}
                  >
                    Top left
                  </button>
                  <button
                    onClick={() => setWebcamCorner("top-right")}
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      webcamCorner === "top-right"
                        ? "bg-stone-900 text-white"
                        : "border border-stone-300"
                    }`}
                  >
                    Top right
                  </button>
                </>
              )}
            </div>

            {/* recording controls */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white p-3">
              {!recording ? (
                <button
                  onClick={startRecording}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white"
                >
                  Start recording feedback
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Stop recording
                </button>
              )}
              <span className="text-xs text-stone-500">
                Records the video, your drawings, your mic, and your webcam
                (if enabled) into one file. Muting the video only changes what
                you hear while working — it never records the original clip&apos;s
                sound either way.
              </span>
              {micError && <span className="text-xs text-red-600">{micError}</span>}
            </div>

            {resultUrl && (
              <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3">
                <p className="text-sm font-medium">Your recorded feedback</p>
                <video src={resultUrl} controls className="w-full rounded-md" />
                <a
                  href={resultUrl}
                  download="feedback.webm"
                  className="inline-block rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white"
                >
                  Download
                </a>
              </div>
            )}
          </div>
        )}

        <canvas ref={composeRef} className="hidden" />
      </main>
    </div>
  );
}
