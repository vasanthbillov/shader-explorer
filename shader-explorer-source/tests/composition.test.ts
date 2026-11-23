import { describe, it, expect } from "vitest";
import {
  assemble,
  resolveModules,
  validateUniform,
  mapDiagnostics,
} from "../src/engine/composition";
import { examples, newProject } from "../src/content/projects";
import { modules } from "../src/content/modules";
import { projectSchema, type ShaderModuleVersion } from "../src/shared/types";
const fixture = () => newProject(examples[0]);
describe("built-in content", () => {
  it("ships 12 distinct examples and 24 documented modules", () => {
    expect(examples).toHaveLength(12);
    expect(modules).toHaveLength(24);
    expect(new Set(examples.map((p) => p.fragmentBody)).size).toBe(12);
    expect(modules.every((m) => m.license && m.usage && m.description)).toBe(
      true,
    );
  });
  for (const p of examples)
    it(`validates and assembles ${p.name}`, () => {
      expect(projectSchema.safeParse(p).success).toBe(true);
      const b = assemble(p);
      expect(b.vertex.startsWith("#version 300 es")).toBe(true);
      expect(b.fragment.match(/void main\(\)/g)).toHaveLength(1);
      expect(b.maps.fragment).toHaveLength(b.fragment.split("\n").length);
    });
  it("keeps examples immutable when creating projects", () => {
    const p = fixture();
    p.uniforms.uScale = 9;
    expect(examples[0].uniforms.uScale).toBe(4);
    expect(p.builtin).toBe(false);
    expect(p.id).not.toBe(examples[0].id);
  });
});
describe("dependency resolver", () => {
  it("includes dependencies once in topological order", () => {
    const resolved = resolveModules(fixture());
    const ids = resolved.map((m) => m.id);
    expect(ids.indexOf("hash")).toBeLessThan(ids.indexOf("noise"));
    expect(ids.indexOf("noise")).toBeLessThan(ids.indexOf("fbm"));
    expect(ids.filter((m) => m === "hash")).toHaveLength(1);
  });
  it("is deterministic regardless of selection order", () => {
    const p = fixture(),
      a = assemble(p);
    p.modules.reverse();
    const b = assemble(p);
    expect(a.vertex).toBe(b.vertex);
    expect(a.fragment).toBe(b.fragment);
  });
  it("rejects missing dependencies", () => {
    const p = fixture();
    p.modules.push({ id: "missing", version: "1", enabled: true });
    expect(() => resolveModules(p)).toThrow("Missing module");
  });
  it("rejects cycles", () => {
    const p = fixture();
    p.customModules = [
      {
        ...modules[0],
        id: "cycle",
        dependencies: [{ id: "cycle", version: "1.0.0" }],
      },
    ];
    p.modules = [{ id: "cycle", version: "1.0.0", enabled: true }];
    expect(() => resolveModules(p)).toThrow("Circular dependency");
  });
  it("rejects incompatible versions", () => {
    const p = fixture();
    p.customModules = [{ ...modules[4], version: "2.0.0" }];
    p.modules.push({ id: "hash", version: "2.0.0", enabled: true });
    expect(() => resolveModules(p)).toThrow("Conflicting versions");
  });
  it("rejects duplicate exported symbols", () => {
    const p = fixture();
    p.customModules = [{ ...modules[0], id: "custom", exports: ["fresnel"] }];
    p.modules.push({ id: "custom", version: "1.0.0", enabled: true });
    expect(() => resolveModules(p)).toThrow("Duplicate exported");
  });
  it("rejects generated declarations in module source", () => {
    const p = fixture();
    p.customModules = [
      { ...modules[0], id: "invalid", source: "void main() {}" },
    ];
    p.modules.push({ id: "invalid", version: "1.0.0", enabled: true });
    expect(() => resolveModules(p)).toThrow("cannot declare");
  });
  it("includes explicitly required effect modules", () => {
    const p = fixture();
    p.modules.find((m) => m.id === "fbm")!.enabled = false;
    p.effects.push({
      id: "noise",
      name: "Noise",
      moduleId: "fbm",
      stage: "finalColor",
      order: 0,
      enabled: true,
      code: "color += fbm(vec3(uv,0.0));",
    });
    expect(resolveModules(p).some((m) => m.id === "fbm")).toBe(true);
  });
});
describe("uniform validation", () => {
  it.each([NaN, Infinity, -1, 20])(
    "rejects invalid bounded number %s",
    (value) => {
      expect(() =>
        validateUniform(
          {
            name: "uX",
            type: "float",
            group: "Test",
            default: 0,
            min: 0,
            max: 10,
          },
          value,
        ),
      ).toThrow();
    },
  );
  it("rejects fractional int values and malformed vectors", () => {
    expect(() =>
      validateUniform(
        { name: "uX", type: "int", group: "Test", default: 0 },
        1.5,
      ),
    ).toThrow();
    expect(() =>
      validateUniform(
        { name: "uX", type: "vec3", group: "Test", default: [0, 0, 0] },
        [1, 2],
      ),
    ).toThrow();
  });
  it("rejects reserved uniform names", () => {
    expect(() =>
      validateUniform(
        { name: "uTime", type: "float", group: "Test", default: 0 },
        0,
      ),
    ).toThrow("Reserved");
  });
  it("rejects conflicting declarations", () => {
    const p = fixture();
    p.uniformDefinitions.push({ ...p.uniformDefinitions[0], max: 100 });
    expect(() => assemble(p)).toThrow("Conflicting uniform");
  });
  it("maps diagnostics back to editable shader lines", () => {
    const b = assemble(fixture());
    const line =
      b.maps.fragment.findIndex(
        (l) => l.source === "fragment" && l.line === 3,
      ) + 1;
    expect(
      mapDiagnostics(`ERROR: 0:${line}: unknown token`, "fragment", b)[0],
    ).toMatchObject({ source: "fragment", line: 3, stage: "fragment" });
  });
  it("keeps unmapped driver logs accessible", () => {
    const b = assemble(fixture());
    expect(mapDiagnostics("Linking failed", "fragment", b)[0].message).toBe(
      "Linking failed",
    );
  });
  it("does not include disabled hook code", () => {
    const p = fixture();
    p.effects.push({
      id: "disabled",
      name: "Disabled",
      enabled: false,
      stage: "finalColor",
      order: 0,
      moduleId: "",
      code: "INVALID_HOOK",
    });
    expect(assemble(p).fragment).not.toContain("INVALID_HOOK");
  });
});
