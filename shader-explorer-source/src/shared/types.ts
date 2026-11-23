import { z } from "zod";
export const categories = [
  "Materials",
  "VFX / Effects",
  "Procedural",
  "Raymarching",
  "Environment",
  "Stylized",
  "Post Processing",
  "Experimental",
] as const;
export const uniformSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_]\w*$/),
  type: z.enum([
    "float",
    "int",
    "bool",
    "vec2",
    "vec3",
    "vec4",
    "color",
    "sampler2D",
  ]),
  group: z.string(),
  storage: z.enum(["uniform", "constant"]).optional(),
  default: z.union([
    z.number().finite(),
    z.boolean(),
    z.string(),
    z.array(z.number().finite()),
  ]),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  wrap: z.enum(["repeat", "clamp", "mirror"]).optional(),
  filter: z.enum(["linear", "nearest"]).optional(),
  colorSpace: z.enum(["srgb", "linear"]).optional(),
});
export type UniformDefinition = z.infer<typeof uniformSchema>;
export type UniformValue = UniformDefinition["default"];
export const moduleSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  source: z.string().max(100000),
  exports: z.array(z.string()),
  dependencies: z.array(z.object({ id: z.string(), version: z.string() })),
  uniforms: z.array(uniformSchema),
  stages: z.array(z.enum(["vertex", "fragment"])),
  usage: z.string(),
  author: z.string(),
  license: z.string(),
  builtin: z.boolean().optional(),
});
export type ShaderModuleVersion = z.infer<typeof moduleSchema>;
export const effectSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  stage: z.enum(["uv", "displacement", "baseColor", "lighting", "finalColor"]),
  order: z.number(),
  moduleId: z.string(),
  code: z.string(),
});
export const projectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(4000),
  category: z.enum(categories),
  tags: z.array(z.string()),
  author: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().nonnegative(),
  vertexBody: z.string().max(200000),
  fragmentBody: z.string().max(200000),
  modules: z.array(
    z.object({ id: z.string(), version: z.string(), enabled: z.boolean() }),
  ),
  customModules: z.array(moduleSchema),
  uniformDefinitions: z.array(uniformSchema),
  uniforms: z.record(
    z.union([
      z.number().finite(),
      z.boolean(),
      z.string(),
      z.array(z.number().finite()),
    ]),
  ),
  effects: z.array(effectSchema),
  assets: z.array(z.string()),
  preview: z.object({
    geometry: z.enum(["sphere", "cube", "plane", "custom"]),
    modelAsset: z.string().optional(),
    playing: z.boolean(),
    bloom: z.boolean().optional(),
    speed: z.number().min(0).max(5),
    rotate: z.boolean(),
    quality: z.enum(["standard", "low"]),
    resolution: z.enum(["auto", "640x360", "1280x720", "1920x1080"]),
  }),
  presets: z.array(
    z.object({
      name: z.string(),
      values: z.record(
        z.union([
          z.number().finite(),
          z.boolean(),
          z.string(),
          z.array(z.number().finite()),
        ]),
      ),
    }),
  ),
  builtin: z.boolean().optional(),
  thumbnail: z.string().max(2000000).optional(),
  lastSuccessful: z
    .object({
      vertex: z.string(),
      fragment: z.string(),
      uniformDefinitions: z.array(uniformSchema).optional(),
      uniforms: z
        .record(
          z.union([
            z.number().finite(),
            z.boolean(),
            z.string(),
            z.array(z.number().finite()),
          ]),
        )
        .optional(),
    })
    .optional(),
});
export type ShaderProject = z.infer<typeof projectSchema>;
export interface AssetRecord {
  id: string;
  hash: string;
  kind: "texture" | "model";
  name: string;
  mime: string;
  blob: Blob;
  width?: number;
  height?: number;
  triangles?: number;
}
export interface ProjectVersion {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  project: ShaderProject;
}
export interface Collection {
  id: string;
  name: string;
  projectIds: string[];
}
export interface LibraryPreference {
  id: string;
  favorite: boolean;
  lastOpened?: string;
}
export interface Draft {
  id: string;
  updatedAt: string;
  project: ShaderProject;
}
export interface SourceLocation {
  source: string;
  line: number;
}
export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  stage?: "vertex" | "fragment";
  line?: number;
  source?: string;
  raw?: string;
}
export interface ShaderBuild {
  id: string;
  vertex: string;
  fragment: string;
  maps: { vertex: SourceLocation[]; fragment: SourceLocation[] };
  uniforms: UniformDefinition[];
}
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
