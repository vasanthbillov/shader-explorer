import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import {
  Grid2X2,
  Code2,
  Layers,
  Bookmark,
  BookOpen,
  Settings2,
  Check,
  X,
  Monitor,
  HardDrive,
} from "lucide-react";
import { DataContext } from "./context";
import {
  type ShaderProject,
  type Collection,
  type LibraryPreference,
  uid,
} from "../shared/types";
import { examples, newProject } from "../content/projects";
import { db, saveProject } from "../storage/repository";
import { Dialog } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import Library from "../features/Library";
import Collections from "../features/Collections";
import Docs from "../features/Docs";
const Editor = lazy(() => import("../features/Editor"));
export default function App() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ShaderProject[]>([]),
    [collections, setCollections] = useState<Collection[]>([]),
    [preferences, setPreferences] = useState<LibraryPreference[]>([]),
    [storageError, setStorageError] = useState(""),
    [loading, setLoading] = useState(true),
    [toast, setToast] = useState(""),
    [settings, setSettings] = useState(false);
  const [temporary, setTemporary] = useState<ShaderProject[]>([]);
  const refresh = useCallback(async () => {
    try {
      const [p, c, f] = await Promise.all([
        db.projects.toArray(),
        db.collections.toArray(),
        db.preferences.toArray(),
      ]);
      setProjects(p);
      setCollections(c);
      setPreferences(f);
      setStorageError("");
    } catch (e) {
      setStorageError(
        `Local storage is unavailable. This is a temporary session; export packages to keep your work. ${String(e)}`,
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  async function openProject(p: ShaderProject, quick = false) {
    let target = p;
    if (p.builtin) {
      target = newProject(p);
      target.name = p.name;
      try {
        target = await saveProject(target);
        await refresh();
      } catch {
        setTemporary((t) => [...t, target]);
        setToast("Temporary session — export to preserve this project.");
      }
    }
    try {
      const pref = await db.preferences.get(target.id);
      await db.preferences.put({
        id: target.id,
        favorite: pref?.favorite || false,
        lastOpened: new Date().toISOString(),
      });
    } catch {
      /* Session is usable without IndexedDB. */
    }
    navigate(`/editor/${target.id}${quick ? "?guide=1" : ""}`);
  }
  async function createProject() {
    const p = newProject();
    p.modules = [];
    p.effects = [];
    p.fragmentBody =
      "// Your next idea starts here.\ncolor = vec3(uv, 0.65 + 0.35 * sin(uTime));";
    let target = p;
    try {
      target = await saveProject(p);
      await refresh();
    } catch {
      setTemporary((t) => [...t, p]);
    }
    navigate(`/editor/${target.id}`);
  }
  async function favorites(id: string) {
    try {
      const pref = preferences.find((p) => p.id === id);
      await db.preferences.put({
        id,
        favorite: !pref?.favorite,
        lastOpened: pref?.lastOpened,
      });
      await refresh();
    } catch (e) {
      setToast(String(e));
    }
  }
  const value = {
    projects: [...projects, ...temporary],
    collections,
    preferences,
    storageError,
    loading,
    refresh,
    notify: setToast,
    openProject,
    createProject,
    favorites,
  };
  return (
    <DataContext.Provider value={value}>
      <div className="app-shell">
        <header className="app-header">
          <NavLink to="/" className="brand" aria-label="Shader Explorer home">
            <span className="brand-mark">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>
              <strong>
                Shader Explorer<span className="brand-dot">.</span>
              </strong>
              <small>Real-time GPU Shader Lab</small>
            </span>
          </NavLink>
          <nav className="main-nav" aria-label="Main navigation">
            {[
              ["/", "Library", Grid2X2],
              ["/editor", "Editor", Code2],
              ["/my-shaders", "My Shaders", Layers],
              ["/collections", "Collections", Bookmark],
              ["/docs", "Docs", BookOpen],
            ].map(([to, label, Icon]) => (
              <NavLink
                key={String(to)}
                to={String(to)}
                end={to === "/"}
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                <Icon size={17} />
                <span>{String(label)}</span>
              </NavLink>
            ))}
          </nav>
          <div className="header-actions">
            <span className="local-badge">
              <span />
              Local workspace
            </span>
            <button
              className="icon-button settings-button"
              onClick={() => setSettings(true)}
              aria-label="Preferences"
            >
              <Settings2 size={20} />
            </button>
            <span className="profile-badge">TA</span>
          </div>
        </header>
        {storageError && (
          <div className="storage-banner">
            <HardDrive size={16} />
            {storageError}
          </div>
        )}
        <main>
          <Suspense
            fallback={
              <div className="loading-screen">
                <span className="spinner" />
                Loading your workspace…
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Library />} />
              <Route path="/my-shaders" element={<Library mine />} />
              <Route path="/collections" element={<Collections />} />
              <Route path="/docs" element={<Docs />} />
              <Route
                path="/editor"
                element={
                  <div className="welcome-editor">
                    <Code2 size={44} />
                    <h1>Your next shader starts here.</h1>
                    <p>
                      Start with a blank canvas or explore a working example.
                    </p>
                    <div className="row">
                      <Button
                        variant="default"
                        onClick={() => void createProject()}
                      >
                        Create Shader
                      </Button>
                      <Button onClick={() => void openProject(examples[0])}>
                        Open Iridescent Sphere
                      </Button>
                    </div>
                  </div>
                }
              />
              <Route path="/editor/:id" element={<Editor />} />
              <Route
                path="*"
                element={
                  <div className="welcome-editor">
                    <h1>Page not found</h1>
                    <NavLink to="/">Return to the library</NavLink>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </main>
        <footer className="site-footer">
          <span>
            SHADER EXPLORER <span className="muted">/</span> A playground for
            light, color & code.
          </span>
          <span>
            <span className="tiny-dot" /> All work stays in your browser{" "}
            <span className="footer-version">v1.0</span>
          </span>
        </footer>
      </div>
      <Dialog
        open={settings}
        onOpenChange={setSettings}
        title="Workspace preferences"
        description="A private, local-first creative workspace."
      >
        <div className="settings-info">
          <Monitor />
          <div>
            <strong>WebGL2 renderer</strong>
            <p>
              Preview quality and automatic compilation can be configured in
              each editor session.
            </p>
          </div>
        </div>
        <div className="settings-info">
          <HardDrive />
          <div>
            <strong>Stored on this device</strong>
            <p>
              Your shaders, versions, and assets are saved in this browser.
              Export packages for backups or moving between devices.
            </p>
          </div>
        </div>
        <p className="muted">
          No account, analytics, or cloud upload. Browser storage can be cleared
          by your browser or device.
        </p>
        <Button
          onClick={() => {
            localStorage.removeItem("shader-panels");
            setToast("Panel sizes reset. Reopen the editor to apply.");
          }}
        >
          Reset panel sizes
        </Button>
      </Dialog>
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </DataContext.Provider>
  );
}
