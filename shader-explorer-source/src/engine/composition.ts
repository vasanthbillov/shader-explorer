import { modules as builtins } from "../content/modules";
import {
  type ShaderProject,
  type ShaderModuleVersion,
  type ShaderBuild,
  type UniformDefinition,
  type Diagnostic,
  type SourceLocation,
  uid,
} from "../shared/types";
export class CompositionError extends Error {}
const key = (m: { id: string; version: string }) => `${m.id}@${m.version}`;
export function resolveModules(
  project: ShaderProject,
  registry: ShaderModuleVersion[] = builtins,
): ShaderModuleVersion[] {
  const records = new Map(
    [...registry, ...project.customModules].map((m) => [key(m), m]),
  );
  const chosen = new Map<string, string>(),
    visiting = new Set<string>(),
    done = new Set<string>(),
    result: ShaderModuleVersion[] = [];
  const visit = (ref: { id: string; version: string }) => {
    const k = key(ref);
    if (visiting.has(k))
      throw new CompositionError(`Circular dependency: ${k}`);
    if (done.has(k)) return;
    const m = records.get(k);
    if (!m) throw new CompositionError(`Missing module: ${k}`);
    if (chosen.has(m.id) && chosen.get(m.id) !== m.version)
      throw new CompositionError(`Conflicting versions of ${m.id}`);
    chosen.set(m.id, m.version);
    visiting.add(k);
    [...m.dependencies]
      .sort((a, b) => key(a).localeCompare(key(b)))
      .forEach(visit);
    visiting.delete(k);
    done.add(k);
    result.push(m);
  };
  project.modules
    .filter((m) => m.enabled)
    .sort((a, b) => key(a).localeCompare(key(b)))
    .forEach(visit);
  for (const e of project.effects.filter((e) => e.enabled && e.moduleId)) {
    const ref = project.modules.find((m) => m.id === e.moduleId);
    if (!ref)
      throw new CompositionError(`Effect ${e.name} needs ${e.moduleId}`);
    visit(ref);
  }
  const symbols = new Set<string>();
  for (const m of result) {
    if (/\bvoid\s+main\s*\(|#version/.test(m.source))
      throw new CompositionError(`${m.name} cannot declare main() or #version`);
    for (const s of m.exports) {
      if (symbols.has(s))
        throw new CompositionError(`Duplicate exported symbol: ${s}`);
      symbols.add(s);
    }
  }
  return result;
}
export const reserved = new Set([
  "uTime",
  "uDelta",
  "uResolution",
  "uPointer",
  "modelMatrix",
  "modelViewMatrix",
  "projectionMatrix",
  "normalMatrix",
  "cameraPosition",
  "position",
  "normal",
  "uv",
  "color",
  "fragColor",
  "viewDir",
  "vUv",
  "vWorldPosition",
  "vWorldNormal",
]);
export function validateUniform(u: UniformDefinition, value: unknown) {
  if (!/^[a-zA-Z_]\w*$/.test(u.name))
    throw new CompositionError(`Invalid uniform name: ${u.name}`);
  if (u.min !== undefined && u.max !== undefined && u.min > u.max)
    throw new CompositionError(`${u.name} has inverted bounds`);
  if (
    u.type === "int" &&
    [u.min, u.max, u.step].some((v) => v !== undefined && !Number.isInteger(v))
  )
    throw new CompositionError(`${u.name} requires integer bounds and steps`);
  if (u.step !== undefined && u.step <= 0)
    throw new CompositionError(`${u.name} needs a positive step`);
  if (reserved.has(u.name))
    throw new CompositionError(`Reserved uniform name: ${u.name}`);
  if (u.type === "color") {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))
      throw new CompositionError(`${u.name} needs a hex color`);
    return;
  }
  if (u.type === "sampler2D") {
    if (u.storage === "constant")
      throw new CompositionError("Textures must be uniform variables.");
    if (typeof value !== "string")
      throw new CompositionError(`${u.name} needs a texture asset`);
    return;
  }
  if (u.type === "bool") {
    if (typeof value !== "boolean")
      throw new CompositionError(`${u.name} needs a boolean`);
    return;
  }
  const values = Array.isArray(value) ? value : [value];
  const count = u.type.startsWith("vec") ? Number(u.type.slice(3)) : 1;
  if (
    values.length !== count ||
    (count > 1 && !Array.isArray(value)) ||
    values.some(
      (v) =>
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        (u.type === "int" && !Number.isInteger(v)) ||
        (u.min !== undefined && v < u.min) ||
        (u.max !== undefined && v > u.max),
    )
  )
    throw new CompositionError(`Invalid value for ${u.name}`);
}
export function constantDeclaration(
  definition: UniformDefinition,
  value: unknown,
) {
  const scalar = (n: number) => {
    const s = String(n);
    return /[.eE]/.test(s) ? s : `${s}.0`;
  };
  let literal: string;
  if (definition.type === "bool") literal = String(value);
  else if (definition.type === "int") literal = String(value);
  else if (definition.type === "color") {
    const hex = String(value).slice(1);
    const rgb = [0, 2, 4]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) =>
        c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
      );
    literal = `vec3(${rgb.map(scalar).join(", ")})`;
  } else if (definition.type.startsWith("vec"))
    literal = `${definition.type}(${(value as number[]).map(scalar).join(", ")})`;
  else literal = scalar(value as number);
  return `const ${definition.type === "color" ? "vec3" : definition.type} ${definition.name} = ${literal};`;
}
export function assemble(
  project: ShaderProject,
  registry: ShaderModuleVersion[] = builtins,
): ShaderBuild {
  const resolved = resolveModules(project, registry),
    defs = new Map<string, UniformDefinition>();
  for (const u of [
    ...project.uniformDefinitions,
    ...resolved.flatMap((m) => m.uniforms),
  ]) {
    if (
      defs.has(u.name) &&
      JSON.stringify(defs.get(u.name)) !== JSON.stringify(u)
    )
      throw new CompositionError(`Conflicting uniform: ${u.name}`);
    validateUniform(u, project.uniforms[u.name] ?? u.default);
    defs.set(u.name, u);
  }
  if (!defs.has("uIntensity"))
    defs.set("uIntensity", {
      name: "uIntensity",
      type: "float",
      group: "Material",
      default: 1,
    });
  const definitions = [...defs.values()];
  const uniforms = definitions.filter((d) => d.storage !== "constant");
  const maps = {
    vertex: [] as SourceLocation[],
    fragment: [] as SourceLocation[],
  };
  function stage(type: "vertex" | "fragment") {
    const lines: string[] = [];
    const add = (s: string, source = "generated") => {
      s.split("\n").forEach((l, i) => {
        lines.push(l);
        maps[type].push({ source, line: i + 1 });
      });
    };
    add(
      "#version 300 es\nprecision highp float;\nprecision highp int;\nuniform float uTime;\nuniform float uDelta;\nuniform vec2 uResolution;\nuniform vec2 uPointer;\nuniform mat4 modelMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 projectionMatrix;\nuniform vec3 cameraPosition;",
    );
    add(
      type === "vertex"
        ? "in vec3 position;\nin vec3 normal;\nin vec2 uv;\nout vec2 vUv;\nout vec3 vWorldPosition;\nout vec3 vWorldNormal;"
        : "in vec2 vUv;\nin vec3 vWorldPosition;\nin vec3 vWorldNormal;\nout vec4 fragColor;",
    );
    add(
      definitions
        .map((u) =>
          u.storage === "constant"
            ? constantDeclaration(u, project.uniforms[u.name] ?? u.default)
            : `uniform ${u.type === "color" ? "vec3" : u.type} ${u.name};`,
        )
        .join("\n"),
    );
    for (const m of resolved.filter((m) => m.stages.includes(type)))
      add(m.source, m.id);
    const hooks = (s: string) =>
      project.effects
        .filter((e) => e.enabled && e.stage === s)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .forEach((e) => add(e.code, `effect:${e.id}`));
    if (type === "vertex") {
      add("void main() {\nvec3 localPosition = position;");
      hooks("displacement");
      add(project.vertexBody, "vertex");
      add(
        "vUv = uv;\nvec4 world = modelMatrix * vec4(localPosition, 1.0);\nvWorldPosition = world.xyz;\nvWorldNormal = normalize(mat3(transpose(inverse(modelMatrix))) * normal);\ngl_Position = projectionMatrix * modelViewMatrix * vec4(localPosition, 1.0);\n}",
      );
    } else {
      add(
        "void main() {\nvec2 uv = vUv;\nvec3 position = vWorldPosition;\nvec3 normal = normalize(vWorldNormal);\nvec3 viewDir = normalize(cameraPosition - position);\nvec3 color = vec3(0.0);",
      );
      hooks("uv");
      hooks("baseColor");
      add(project.fragmentBody, "fragment");
      hooks("lighting");
      hooks("finalColor");
      add(
        "color *= uIntensity;\ncolor = color / (color + vec3(1.0));\ncolor = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));\nfragColor = vec4(color, 1.0);\n}",
      );
    }
    return lines.join("\n");
  }
  return {
    id: uid(),
    vertex: stage("vertex"),
    fragment: stage("fragment"),
    maps,
    uniforms,
  };
}
export function mapDiagnostics(
  log: string,
  stage: "vertex" | "fragment",
  build: ShaderBuild,
): Diagnostic[] {
  return log
    .split("\n")
    .filter(Boolean)
    .map((message) => {
      const match = message.match(/(?:ERROR:\s*\d+:|\d+\()\s*(\d+)/);
      const assembledLine = match ? Number(match[1]) : undefined;
      const loc = assembledLine
        ? build.maps[stage][assembledLine - 1]
        : undefined;
      return {
        severity: "error",
        message,
        stage,
        source: loc?.source,
        line: loc?.line ?? assembledLine,
        raw: log,
      };
    });
}
