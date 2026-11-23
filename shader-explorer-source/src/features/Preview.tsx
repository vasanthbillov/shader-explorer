import { useEffect, useRef, useState } from "react";
import {
  Box,
  Circle,
  Square,
  Upload,
  Maximize,
  Camera,
  Play,
  Pause,
  RotateCcw,
  Rotate3D,
} from "lucide-react";
import { ShaderRenderer, type Metrics } from "../engine/renderer";
import type { ShaderProject, AssetRecord } from "../shared/types";
import { Button } from "../components/ui/button";
import { download } from "../storage/transfer";
export default function Preview({
  project,
  assets,
  onReady,
  onEdit,
  onUpload,
  onError,
  onMetrics,
}: {
  project: ShaderProject;
  assets: AssetRecord[];
  onReady: (engine: ShaderRenderer | null) => void;
  onEdit: (fn: (p: ShaderProject) => void) => void;
  onUpload: () => void;
  onError: (message: string) => void;
  onMetrics: (m: Metrics) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    panel = useRef<HTMLDivElement>(null),
    engine = useRef<ShaderRenderer | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(),
    [error, setError] = useState(""),
    [lost, setLost] = useState(false);
  const metricsCallback = useRef(onMetrics);
  metricsCallback.current = onMetrics;
  useEffect(() => {
    let instance: ShaderRenderer;
    try {
      instance = new ShaderRenderer(host.current!);
      engine.current = instance;
      instance.onMetrics = (m) => {
        setMetrics(m);
        metricsCallback.current(m);
      };
      instance.onContext = setLost;
      onReady(instance);
    } catch (e) {
      setError(
        `WebGL2 could not start. ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }
    return () => {
      onReady(null);
      instance.dispose();
      engine.current = null;
    };
  }, [onReady]);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    e.setBloom(project.preview.bloom ?? false);
    e.playing = project.preview.playing;
    e.speed = project.preview.speed;
    e.rotate = project.preview.rotate;
    e.quality = project.preview.quality;
    e.resolution = project.preview.resolution;
    e.resize();
  }, [project.preview]);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    void e
      .setGeometry(
        project.preview.geometry,
        assets.find((a) => a.id === project.preview.modelAsset),
      )
      .catch((err) => onError(String(err)));
  }, [project.preview.geometry, project.preview.modelAsset, assets]);
  return (
    <section className="preview-panel" ref={panel} aria-label="Shader preview">
      <div className="preview-top">
        <div className="geometry-tabs">
          {(
            [
              ["sphere", "Sphere", Circle],
              ["cube", "Cube", Box],
              ["plane", "Plane", Square],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              className={project.preview.geometry === value ? "selected" : ""}
              onClick={() =>
                onEdit((p) => {
                  p.preview.geometry = value;
                })
              }
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
          <button
            className={project.preview.geometry === "custom" ? "selected" : ""}
            onClick={() => {
              if (project.preview.modelAsset)
                onEdit((p) => {
                  p.preview.geometry = "custom";
                });
              else onUpload();
            }}
          >
            <Upload size={14} />
            <span>Custom</span>
          </button>
        </div>
        <div className="row">
          <button
            className="icon-button"
            title="Fullscreen preview"
            aria-label="Fullscreen preview"
            onClick={() =>
              void panel.current
                ?.requestFullscreen()
                .catch((e) => onError(String(e)))
            }
          >
            <Maximize size={17} />
          </button>
          <button
            className="icon-button"
            title="Capture screenshot"
            aria-label="Capture screenshot"
            onClick={() => {
              if (engine.current)
                download(engine.current.capture(), `${project.name}.png`);
            }}
          >
            <Camera size={17} />
          </button>
        </div>
      </div>
      <div className="canvas-host" ref={host} />
      <div className="preview-vignette" />
      {!error && (
        <span className="preview-label">
          <span className="tiny-dot" />
          LIVE PREVIEW <span>/ {project.preview.geometry.toUpperCase()}</span>
        </span>
      )}
      {error && (
        <div className="preview-error">
          <Box size={28} />
          <strong>WebGL2 unavailable</strong>
          <p>{error}</p>
          <p>You can still edit, save, and export your project.</p>
        </div>
      )}
      {lost && (
        <div className="preview-error">
          <strong>GPU context lost</strong>
          <p>
            Your source is safe. Waiting for the browser to restore the preview…
          </p>
        </div>
      )}
      <div className="preview-timeline">
        <button
          aria-label={
            project.preview.playing ? "Pause animation" : "Play animation"
          }
          onClick={() =>
            onEdit((p) => {
              p.preview.playing = !p.preview.playing;
            })
          }
        >
          {project.preview.playing ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
        </button>
        <button
          aria-label="Reset preview"
          title="Reset camera and timeline"
          onClick={() => engine.current?.reset()}
        >
          <RotateCcw size={15} />
        </button>
        <input
          aria-label="Animation timeline"
          type="range"
          min={0}
          max={30}
          step={0.01}
          value={metrics?.time || 0}
          onChange={(e) => {
            engine.current?.setTime(Number(e.target.value));
            setMetrics((m) => (m ? { ...m, time: Number(e.target.value) } : m));
          }}
        />
        <span className="timeline-time">
          {(metrics?.time || 0).toFixed(2)}
          <small> / 30s</small>
        </span>
        <button
          aria-label="Toggle object rotation"
          aria-pressed={project.preview.rotate}
          title="Rotate object"
          onClick={() =>
            onEdit((p) => {
              p.preview.rotate = !p.preview.rotate;
            })
          }
        >
          <Rotate3D size={17} />
        </button>
      </div>
    </section>
  );
}
