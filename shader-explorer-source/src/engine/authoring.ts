import { modules } from "../content/modules";
import {
  type ShaderProject,
  type ShaderModuleVersion,
  type UniformDefinition,
  moduleSchema,
  uniformSchema,
  uid,
} from "../shared/types";
import { reserved, resolveModules, validateUniform } from "./composition";
const keywords = new Set(
  "attribute const uniform varying layout centroid flat smooth noperspective break continue do for while switch case default if else in out inout float double int void bool true false invariant discard return mat2 mat3 mat4 vec2 vec3 vec4 ivec2 ivec3 ivec4 bvec2 bvec3 bvec4 uint uvec2 uvec3 uvec4 lowp mediump highp precision sampler2D samplerCube struct main".split(
    " ",
  ),
);
export function validateUserName(name: string) {
  if (
    !/^[a-zA-Z_]\w*$/.test(name) ||
    /^gl_/i.test(name) ||
    name.includes("__") ||
    keywords.has(name) ||
    reserved.has(name)
  )
    throw Error(
      "Use a unique GLSL identifier, excluding keywords and engine names.",
    );
}
export const functionTemplate = (name: string) =>
  `vec3 ${name}(vec2 uv, float time) {\n  // Return a color. Custom uniforms are available here too.\n  return 0.5 + 0.5 * cos(time + uv.xyx + vec3(0.0, 2.0, 4.0));\n}`;
export const functionUsage = (name: string) => `color = ${name}(uv, uTime);`;
export interface FunctionDraft {
  symbol: string;
  description: string;
  source: string;
  usage: string;
  stages: ShaderModuleVersion["stages"];
  dependencies: ShaderModuleVersion["dependencies"];
}
export function makeCustomFunction(
  project: ShaderProject,
  draft: FunctionDraft,
): ShaderModuleVersion {
  const symbol = draft.symbol.trim();
  validateUserName(symbol);
  const registry = [...modules, ...project.customModules];
  if (
    registry.some((m) => m.exports.includes(symbol)) ||
    project.uniformDefinitions.some((d) => d.name === symbol)
  )
    throw Error("That name is already used by a function or variable.");
  const uncommented = draft.source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  if (
    !new RegExp(
      `\\b(?:void|float|int|uint|bool|[biu]?vec[234]|mat[234])\\s+${symbol}\\s*\\(`,
    ).test(uncommented)
  )
    throw Error(
      `Declare ${symbol}(...) in the GLSL source. The exported name must match.`,
    );
  if (!draft.stages.length) throw Error("Select at least one shader stage.");
  const module = moduleSchema.parse({
    id: uid(),
    version: "1.0.0",
    name: `${symbol}()`,
    category: "Custom",
    description: draft.description.trim() || "Custom GLSL function.",
    source: draft.source,
    exports: [symbol],
    dependencies: draft.dependencies,
    uniforms: [],
    stages: draft.stages,
    usage: draft.usage.trim(),
    author: "Local artist",
    license: "MIT",
    builtin: false,
  });
  const candidate = structuredClone(project);
  candidate.customModules.push(module);
  candidate.modules.push({
    id: module.id,
    version: module.version,
    enabled: true,
  });
  resolveModules(candidate);
  return module;
}
export function makeVariable(
  project: ShaderProject,
  input: UniformDefinition,
  editing: string | null = null,
) {
  const definition = uniformSchema.parse({
    ...input,
    name: input.name.trim(),
    group: input.group.trim() || "Custom",
  });
  validateUserName(definition.name);
  validateUniform(definition, definition.default);
  if (
    project.uniformDefinitions.some(
      (d) => d.name === definition.name && d.name !== editing,
    ) ||
    [...modules, ...project.customModules].some((m) =>
      m.exports.includes(definition.name),
    )
  )
    throw Error("That name is already used by a function or variable.");
  return definition;
}
