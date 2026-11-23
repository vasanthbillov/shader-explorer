import { create } from "zustand";
import type { ShaderProject, Diagnostic } from "../shared/types";
interface Session {
  project: ShaderProject | null;
  dirty: boolean;
  diagnostics: Diagnostic[];
  compileStatus: string;
  setProject: (p: ShaderProject) => void;
  edit: (fn: (p: ShaderProject) => void) => void;
  markSaved: (p: ShaderProject) => void;
  setDiagnostics: (d: Diagnostic[]) => void;
  setCompileStatus: (s: string) => void;
}
export const useSession = create<Session>((set) => ({
  project: null,
  dirty: false,
  diagnostics: [],
  compileStatus: "Ready",
  setProject: (project) =>
    set({ project, dirty: false, diagnostics: [], compileStatus: "Ready" }),
  edit: (fn) =>
    set((state) => {
      if (!state.project) return {};
      const project = structuredClone(state.project);
      fn(project);
      const signature = (p: ShaderProject) =>
        JSON.stringify([
          p.vertexBody,
          p.fragmentBody,
          p.modules,
          p.customModules,
          p.effects,
          p.uniformDefinitions,
          p.uniformDefinitions
            .filter((d) => d.storage === "constant")
            .map((d) => [d.name, p.uniforms[d.name] ?? d.default]),
        ]);
      const structural = signature(project) !== signature(state.project);
      return {
        project,
        dirty: true,
        ...(structural ? { compileStatus: "Recompile needed" } : {}),
      };
    }),
  markSaved: (project) => set({ project, dirty: false }),
  setDiagnostics: (diagnostics) => set({ diagnostics }),
  setCompileStatus: (compileStatus) => set({ compileStatus }),
}));
