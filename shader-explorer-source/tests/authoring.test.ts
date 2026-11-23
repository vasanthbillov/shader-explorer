import { describe, it, expect } from "vitest";
import {
  makeCustomFunction,
  makeVariable,
  functionTemplate,
  functionUsage,
} from "../src/engine/authoring";
import { assemble } from "../src/engine/composition";
import { newProject, examples } from "../src/content/projects";
import { projectSchema, type UniformDefinition } from "../src/shared/types";
import { useSession } from "../src/app/store";
const draft = () => ({
  symbol: "customColor",
  description: "Custom color",
  source: functionTemplate("customColor"),
  usage: functionUsage("customColor"),
  stages: ["fragment"] as ("fragment" | "vertex")[],
  dependencies: [],
});
const variable = (
  overrides: Partial<UniformDefinition> = {},
): UniformDefinition => ({
  name: "uGain",
  type: "float",
  group: "Custom",
  default: 0.5,
  min: 0,
  max: 1,
  step: 0.01,
  ...overrides,
});
describe("custom authoring", () => {
  it("creates an independent callable function with pinned dependencies", () => {
    const p = newProject(examples[0]);
    const m = makeCustomFunction(p, {
      ...draft(),
      dependencies: [{ id: "fbm", version: "1.0.0" }],
    });
    p.customModules.push(m);
    p.modules.push({ id: m.id, version: m.version, enabled: true });
    p.fragmentBody = m.usage;
    const b = assemble(p);
    expect(b.fragment).toContain("vec3 customColor(");
    expect(b.fragment).toContain("float fbm(");
    expect(b.vertex).not.toContain("vec3 customColor(");
  });
  it.each(["float", "gl_Color", "uTime", "invalid name", "bad__name"])(
    "rejects reserved or invalid function name %s",
    (symbol) => {
      expect(() =>
        makeCustomFunction(newProject(), { ...draft(), symbol }),
      ).toThrow();
    },
  );
  it("rejects existing exported symbols and comment-only declarations", () => {
    expect(() =>
      makeCustomFunction(newProject(), { ...draft(), symbol: "noise" }),
    ).toThrow("already used");
    expect(() =>
      makeCustomFunction(newProject(), {
        ...draft(),
        source: "// vec3 customColor() {}",
      }),
    ).toThrow("Declare");
  });
  it("requires a stage and rejects entry points in modules", () => {
    expect(() =>
      makeCustomFunction(newProject(), { ...draft(), stages: [] }),
    ).toThrow("stage");
    expect(() =>
      makeCustomFunction(newProject(), {
        ...draft(),
        source: functionTemplate("customColor") + "\nvoid main() {}",
      }),
    ).toThrow("main");
  });
  it("creates a live uniform without altering source", () => {
    const p = newProject();
    const d = makeVariable(p, variable());
    p.uniformDefinitions.push(d);
    p.uniforms[d.name] = d.default;
    const b = assemble(p);
    expect(b.fragment).toContain("uniform float uGain;");
    expect(b.uniforms.some((u) => u.name === "uGain")).toBe(true);
  });
  it("rejects duplicate variables and invalid defaults", () => {
    expect(() =>
      makeVariable(newProject(), variable({ name: "uScale" })),
    ).toThrow("already used");
    expect(() => makeVariable(newProject(), variable({ default: 2 }))).toThrow(
      "Invalid value",
    );
  });
  it("emits typed constants and excludes them from GPU uniforms", () => {
    const p = newProject();
    for (const d of [
      variable({ name: "GAIN", storage: "constant" }),
      variable({
        name: "AXIS",
        storage: "constant",
        type: "vec3",
        default: [0, 1, -1],
        min: undefined,
        max: undefined,
      }),
      variable({
        name: "ENABLED",
        storage: "constant",
        type: "bool",
        default: true,
      }),
      variable({
        name: "COUNT",
        storage: "constant",
        type: "int",
        step: 1,
        default: 1,
      }),
    ]) {
      p.uniformDefinitions.push(d);
      p.uniforms[d.name] = d.default;
    }
    const b = assemble(p);
    expect(b.fragment).toContain("const float GAIN = 0.5;");
    expect(b.vertex).toContain("const vec3 AXIS = vec3(0.0, 1.0, -1.0);");
    expect(b.fragment).toContain("const bool ENABLED = true;");
    expect(b.fragment).toContain("const int COUNT = 1;");
    expect(b.uniforms.some((u) => u.name === "GAIN")).toBe(false);
  });
  it("rejects constant textures", () => {
    expect(() =>
      makeVariable(
        newProject(),
        variable({ storage: "constant", type: "sampler2D", default: "" }),
      ),
    ).toThrow("Textures");
  });
  it("marks constant value changes for compilation while keeping uniforms live", () => {
    const p = newProject();
    p.uniformDefinitions.push(variable({ name: "GAIN", storage: "constant" }));
    p.uniforms.GAIN = 0.5;
    useSession.getState().setProject(p);
    useSession.getState().setCompileStatus("Compiled");
    useSession.getState().edit((p) => {
      p.uniforms.uScale = 6;
    });
    expect(useSession.getState().compileStatus).toBe("Compiled");
    useSession.getState().edit((p) => {
      p.uniforms.GAIN = 0.7;
    });
    expect(useSession.getState().compileStatus).toBe("Recompile needed");
  });
  it("preserves variable kind and custom source through serialization", () => {
    const p = newProject();
    p.customModules.push(makeCustomFunction(p, draft()));
    p.uniformDefinitions.push(variable({ storage: "constant" }));
    const parsed = projectSchema.parse(JSON.parse(JSON.stringify(p)));
    expect(parsed.customModules[0].source).toBe(
      functionTemplate("customColor"),
    );
    expect(parsed.uniformDefinitions.at(-1)?.storage).toBe("constant");
  });
});
