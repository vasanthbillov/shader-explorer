import { iridescentBody, iridescentLighting } from "./iridescent";
import {
  type ShaderProject,
  type UniformDefinition,
  now,
  uid,
} from "../shared/types";
export const baseUniforms: UniformDefinition[] = [
  {
    name: "uScale",
    type: "float",
    group: "Noise",
    default: 4,
    min: 0.1,
    max: 12,
    step: 0.05,
  },
  {
    name: "uIntensity",
    type: "float",
    group: "Lighting",
    default: 1.2,
    min: 0,
    max: 3,
    step: 0.01,
  },
  {
    name: "uRoughness",
    type: "float",
    group: "Lighting",
    default: 0.35,
    min: 0.02,
    max: 1,
    step: 0.01,
  },
  {
    name: "uMetallic",
    type: "float",
    group: "Lighting",
    default: 0.9,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    name: "uStrength",
    type: "float",
    group: "Distortion",
    default: 0.3,
    min: 0,
    max: 1,
    step: 0.01,
  },
  { name: "uTint", type: "color", group: "Color", default: "#b99cff" },
];
const vertexBody =
  "// Modify the local position before projection.\n// Engine inputs: position, normal, uv, uTime\n";
const bodies = [
  iridescentBody,
  `float n = fbm(position * uScale + uTime * 0.12);\nfloat cracks = pow(1.0 - abs(sin(n * 20.0)), 12.0);\ncolor = mix(vec3(0.035,0.008,0.012), vec3(1.6,0.24,0.01), cracks);\ncolor += vec3(0.3,0.02,0.0) * n;`,
  `float waves = sin(uv.x * 30.0 + uTime) * 0.3 + fbm(vec3(uv * uScale * 3.0, uTime * 0.25));\ncolor = mix(vec3(0.01,0.06,0.18), vec3(0.01,0.65,0.9), waves);\ncolor += vec3(0.5,0.9,1.0) * pow(max(waves,0.0),8.0);`,
  `// A bounded 16-step volume march through a procedural cloud.\nvec3 ray = vec3((uv - 0.5) * 3.2, 1.5);\nfloat transmittance = 1.0;\nvec3 cloudColor = vec3(0.0);\nfor (int i = 0; i < 16; i++) {\n  vec3 samplePosition = ray - vec3(0.0, 0.0, float(i) * 0.2);\n  float envelope = 1.0 - smoothstep(0.6, 1.4, length(samplePosition * vec3(0.7, 1.0, 1.0)));\n  float density = smoothstep(0.3, 0.7, fbm(samplePosition * uScale * 0.7 + vec3(uTime * 0.05))) * envelope * 0.35;\n  vec3 light = mix(vec3(0.3, 0.16, 0.4), vec3(1.0, 0.8, 0.7), float(i) / 16.0);\n  cloudColor += transmittance * density * light;\n  transmittance *= 1.0 - density;\n}\ncolor = cloudColor + transmittance * vec3(0.045, 0.07, 0.16);`,
  `vec2 p = uv * 2.0 - 1.0;\nfloat ring = exp(-35.0 * abs(length(p) - 0.65 - 0.04*sin(atan(p.y,p.x)*8.0+uTime)));\ncolor = iridescence(atan(p.y,p.x)*0.3 + uTime*0.1)*ring*2.0;`,
  `float facets = floor(voronoi(uv * uScale * 3.0)*6.0)/6.0;\ncolor = mix(vec3(0.06,0.2,0.4), vec3(0.4,0.9,1.0), facets);\ncolor += iridescence(dot(normal,viewDir))*fresnel(normal,viewDir,2.0);`,
  `vec2 grid = abs(fract(uv * uScale * 3.0)-0.5);\nfloat line = 1.0-smoothstep(0.015,0.045,min(grid.x,grid.y));\ncolor = mix(vec3(0.015,0.008,0.04),iridescence(uv.y+uTime*0.08),line);\ncolor *= scanlines(uv,uTime,180.0);`,
  `vec3 q = domainWarp(vec3(uv * uScale,uTime*0.12),1.8);\nfloat n = fbm(q);\ncolor = mix(vec3(0.015,0.008,0.04), vec3(0.7,0.16,0.65), smoothstep(0.25,0.8,n));\ncolor += vec3(0.13,0.03,0.2)*n;`,
  `float light = toonRamp(lambert(normal, vec3(1.0,1.0,2.0)),4.0);\ncolor = uTint * (0.15 + light);\ncolor *= smoothstep(0.08,0.15,abs(dot(normal,viewDir)));`,
  `float n = fbm(position * uScale);\nfloat threshold = 0.35 + sin(uTime * 0.4) * 0.2;\nif(n < threshold) discard;\ncolor = mix(vec3(1.5,0.25,0.02),uTint,smoothstep(threshold,threshold+0.06,n));`,
  `float h = fbm(vec3(uv * uScale,0.0));\ncolor = mix(vec3(0.03,0.12,0.1),vec3(0.32,0.45,0.2),smoothstep(0.3,0.55,h));\ncolor = mix(color,vec3(0.9,0.85,0.75),smoothstep(0.6,0.8,h));\ncolor *= 0.6+0.4*h;`,
  `vec2 p = (uv-0.5)*2.0;\nfloat d = length(p);\ncolor = vec3(sin(d*20.0-uTime),sin(d*20.0-uTime+0.4),sin(d*20.0-uTime+0.8))*0.5+0.5;\ncolor *= 1.0-smoothstep(0.3,1.4,d);`,
];
const info: [string, ShaderProject["category"], string[], string, string[]][] =
  [
    [
      "Iridescent Sphere",
      "Materials",
      ["Fresnel", "Noise", "Iridescent"],
      "A flowing spectral material with luminous contours, layered noise, and a polished Fresnel rim.",
      ["fbm", "iridescence", "fresnel"],
    ],
    [
      "Lava Surface",
      "Materials",
      ["Noise", "Fire", "Emissive"],
      "Molten orange seams cut through dark volcanic rock.",
      ["fbm"],
    ],
    [
      "Ocean Surface",
      "Environment",
      ["Water", "Noise", "Waves"],
      "Layered turquoise waves with bright, stylized crests.",
      ["fbm"],
    ],
    [
      "Stylized Clouds",
      "Raymarching",
      ["Clouds", "Noise"],
      "A bounded procedural cloud study in soft dusk colors.",
      ["fbm"],
    ],
    [
      "Energy Field",
      "VFX / Effects",
      ["Glow", "Iridescent"],
      "An animated spectral ring with rippling edges.",
      ["iridescence"],
    ],
    [
      "Crystal Material",
      "Materials",
      ["Fresnel", "Crystal"],
      "Cool faceted colors with a stylized iridescent finish.",
      ["voronoi", "iridescence", "fresnel"],
    ],
    [
      "Holographic Grid",
      "Experimental",
      ["Grid", "Iridescent"],
      "A chromatic grid with animated holographic scanlines.",
      ["iridescence", "scanlines"],
    ],
    [
      "Fluid Smoke",
      "VFX / Effects",
      ["Noise", "Smoke"],
      "Domain-warped procedural wisps, shaded in violet.",
      ["domainWarp", "fbm"],
    ],
    [
      "Toon Surface",
      "Stylized",
      ["Toon", "Lighting"],
      "A crisp illustrated material with stepped lighting.",
      ["toonRamp", "lambert"],
    ],
    [
      "Dissolve Object",
      "VFX / Effects",
      ["Noise", "Fire"],
      "Noise-driven erosion with a luminous burning edge.",
      ["fbm"],
    ],
    [
      "Procedural Terrain",
      "Procedural",
      ["Terrain", "Noise"],
      "An earthy height-field palette driven by fractal noise.",
      ["fbm"],
    ],
    [
      "Chromatic Post Effect",
      "Post Processing",
      ["Color", "Waves"],
      "An animated radial wave study with separated color bands.",
      [],
    ],
  ];
export const examples: ShaderProject[] = info.map(
  ([name, category, tags, description, mods], i) => ({
    schemaVersion: 1,
    id: `example-${i}`,
    name,
    category,
    tags,
    description,
    author: "Shader Explorer",
    createdAt: "2026-11-23T00:00:00.000Z",
    updatedAt: "2026-11-23T00:00:00.000Z",
    revision: 0,
    vertexBody,
    fragmentBody: bodies[i],
    modules: mods.map((id) => ({ id, version: "1.0.0", enabled: true })),
    customModules: [],
    uniformDefinitions: baseUniforms.map((u) => ({
      ...structuredClone(u),
      default: i === 0 && u.name === "uRoughness" ? 0.18 : u.default,
    })),
    uniforms: Object.fromEntries(
      baseUniforms.map((u) => [
        u.name,
        i === 0 && u.name === "uRoughness" ? 0.18 : u.default,
      ]),
    ),
    effects: [
      {
        id: "noise-effect",
        name: "Noise",
        enabled: false,
        stage: "finalColor",
        order: 0,
        moduleId: "fbm",
        code: "color += vec3(fbm(vec3(uv * uScale, uTime * 0.1))) * 0.2;",
      },
      {
        id: "light",
        name: "Lighting",
        enabled: ![2, 3, 4, 6, 7, 10, 11].includes(i),
        stage: "lighting",
        order: 0,
        moduleId: "",
        code:
          i === 0
            ? iridescentLighting
            : "color *= (0.42 + 0.58 * max(dot(normal, normalize(vec3(1.0, 1.5, 2.0))), 0.0));\ncolor += vec3(1.0) * pow(max(dot(reflect(-normalize(vec3(1.0,1.5,2.0)),normal),viewDir),0.0),mix(100.0,4.0,uRoughness)) * uMetallic;",
      },
      {
        id: "distortion",
        name: "Distortion",
        enabled: false,
        stage: "uv",
        order: 0,
        moduleId: "",
        code: "uv += sin(uv.yx * 10.0 + uTime) * uStrength * 0.1;",
      },
    ],
    assets: [],
    preview: {
      geometry: [2, 3, 4, 6, 7, 10, 11].includes(i) ? "plane" : "sphere",
      playing: true,
      bloom: i === 0,
      speed: 1,
      rotate: false,
      quality: "standard",
      resolution: "auto",
    },
    presets: [],
    builtin: true,
    thumbnail: `${import.meta.env.BASE_URL}thumbnails/${i}.png`,
  }),
);
export function newProject(source?: ShaderProject): ShaderProject {
  const p = structuredClone(source || examples[0]);
  if (!source) {
    p.author = "Local artist";
    p.description = "A new shader experiment.";
    p.tags = [];
    delete p.thumbnail;
  }
  if (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    p.preview.playing = false;
  return {
    ...p,
    id: uid(),
    name: source ? `${source.name} copy` : "Untitled Shader",
    builtin: false,
    revision: 0,
    createdAt: now(),
    updatedAt: now(),
  };
}
