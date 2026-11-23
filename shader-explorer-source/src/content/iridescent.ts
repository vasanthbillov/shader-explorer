/** Original liquid-film study. Kept as editable GLSL in every project copy. */
export const iridescentBody = `// Liquid interference bands, advected around two soft vortices.
vec3 p = normalize(position);
float clock = uTime * 0.16;
vec2 flow = p.xy;
vec2 vortex = flow - vec2(-0.32, 0.25);
float twist = 2.8 * exp(-dot(vortex, vortex) * 1.7);
float c = cos(twist), s = sin(twist);
flow = mat2(c, -s, s, c) * vortex + vec2(-0.32, 0.25);
vortex = flow - vec2(0.38, -0.32);
twist = -2.4 * exp(-dot(vortex, vortex) * 2.0);
c = cos(twist); s = sin(twist);
flow = mat2(c, -s, s, c) * vortex + vec2(0.38, -0.32);
vec3 q = vec3(flow, p.z * 0.65);
q += 0.19 * sin(q.yzx * 3.2 + vec3(0.0, 2.1, 4.2) + clock);
float silk = fbm(q * uScale * 0.35 + vec3(clock * 0.16));
float stream = q.x * 2.2 + q.y * 1.1 + 0.4 * sin(q.y * 3.0 - q.z * 2.0 + clock);
stream += silk * 0.24;

// Indigo glass between broad violet folds and fine luminous filaments.
float phase = stream * 3.7 - clock;
float cyan = exp(-pow(sin(phase), 2.0) * 32.0);
float violet = exp(-pow(sin(phase - 0.7), 2.0) * 4.0);
float gold = exp(-pow(sin(phase + 1.05), 2.0) * 70.0);
float warmSide = smoothstep(-0.6, 0.8, p.x - p.y * 0.5 + sin(clock) * 0.2);
float threads = pow(0.5 + 0.5 * sin(stream * 76.0 + silk * 6.0), 22.0);
color = vec3(0.008, 0.012, 0.045);
color += vec3(0.25, 0.015, 0.72) * violet * 0.14;
color += vec3(0.015, 0.95, 2.5) * cyan * (1.3 - warmSide * 0.5);
color += vec3(3.8, 0.62, 0.12) * gold * warmSide;
color += mix(vec3(0.1, 0.35, 1.0), vec3(1.3, 0.2, 0.85), warmSide) * threads * 0.12;
vec3 film = pow(iridescence(stream * 0.1 + fresnel(normal, viewDir, 1.4) * 0.5), vec3(1.5, 3.0, 1.0));
color += film * 0.025;

// A slight normal ripple bends the studio reflections across the liquid.
normal = normalize(normal + vec3(sin(phase), cos(phase * 0.8), sin(phase * 0.6)) * 0.045);
float rim = fresnel(normal, viewDir, 3.2);
vec3 rimColor = mix(vec3(0.05, 0.6, 2.0), vec3(1.8, 0.2, 0.65), smoothstep(-0.8, 0.8, p.x + p.y));
color += rimColor * rim * 1.8;`;

export const iridescentLighting = `// Reflected softboxes: broad curved streaks with tight white cores.
vec3 reflection = reflect(-viewDir, normal);
float gloss = 1.0 - uRoughness;
float softWidth = mix(0.12, 0.025, gloss);
float upperBox = exp(-pow((reflection.x + 0.35) / 0.58, 6.0)
                     -pow((reflection.y - 0.62) / softWidth, 2.0));
float sideBox = exp(-pow((reflection.x - 0.73) / (softWidth * 0.65), 2.0)
                    -pow((reflection.y + 0.12) / 0.45, 6.0));
float front = smoothstep(0.0, 0.4, reflection.z);
vec3 sheen = vec3(0.62, 0.82, 1.0) * upperBox * 1.8;
sheen += vec3(1.0, 0.72, 0.86) * sideBox * 1.3;
float pinLight = pow(max(dot(reflection, normalize(vec3(-0.6, 0.8, 1.0))), 0.0), mix(70.0, 350.0, gloss));
color *= 0.7 + 0.3 * max(dot(normal, normalize(vec3(-0.5, 0.8, 1.0))), 0.0);
color += (sheen * front + vec3(pinLight * 3.0)) * mix(0.35, 1.0, uMetallic);`;
