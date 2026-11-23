# Shader Explorer

A local-first WebGL2 shader workbench for technical artists, built with React, TypeScript, Vite, Three.js, Monaco, Zustand, Zod, and Dexie. The reference images are preserved in `Doc/Plan/`.

## Run locally

```sh
nvm use
npm ci
npm run dev
```

Open the printed localhost URL. Node 20.20.1 is pinned in `.nvmrc`. No account, API key, backend, or external content service is required.

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

Playwright is pinned to 1.56.1 because the newer WebKit binary crashed at startup on the development Mac running macOS 26.0.1. The matching WebKit 26.0 runtime works. The test browsers require their normal OS permissions. GPU support varies by browser and CI host. The cross-browser suite verifies WebGL2 shader compilation as well as editing, storage, versions, import/export, collections, and responsive layouts. `npm run preview` serves the production build.

## What is included

- Responsive library with search, categories, AND-matched tags, grid/list views, pagination, favorites, recents, and collections.
- Twelve original procedural examples and 24 documented, MIT-licensed GLSL functions.
- Editable fragment/vertex bodies, independent custom module sources, generated-source inspection, compilation diagnostics, and manual or debounced live compilation.
- Fixed composition hooks for UVs, displacement, base color, lighting, and final color. Required dependencies are included and protected.
- Real WebGL2 preview with sphere, cube, plane, static GLB, orbit/zoom, timeline, rotation, screenshot, quality, resolution, FPS, and resource counts.
- Dynamic float, integer, boolean, vector, color, and texture uniforms; per-value/group reset; editable metadata and parameter presets.
- IndexedDB projects, immutable versions, recovery drafts, revision conflict detection, and portable project packages.

## Authoring contract

The composition engine owns `#version`, declarations, varyings, and `main()`. Write a shader **body**, without declaring a second entry point. The vertex body modifies `localPosition`. The fragment body reads `uv`, world `position`, world `normal`, and `viewDir`, and writes linear RGB `color`. Engine uniforms include `uTime`, `uDelta`, `uResolution`, and `uPointer`.

Final color receives intensity, Reinhard tone mapping, and gamma encoding. The Iridescent Sphere uses animated vortex-warped cyan/violet/amber films, glossy softbox reflections, and a colored Fresnel rim. Its optional **Bloom** switch adds a preview glow, which is included in screenshots and saved preview settings. Raw GLSL exports need an equivalent bloom pass in the destination renderer. Functions are callable building blocks; adding one does not automatically apply an effect. Toggleable effects are explicit source adapters exposed under **Project actions → Effect Hooks**. Structural changes require compilation. Values update uniforms immediately.

Ctrl/Cmd+Enter compiles; Ctrl/Cmd+S saves. Failed compilation retains the last good preview. Saving invalid GLSL is allowed, including the successful shader snapshot needed to recover the preview on reopening. Performance protection cannot interrupt arbitrary GPU work; use manual compilation and lower resolution when experimenting with expensive code.

Built-in functions are immutable. Customize creates a local copy; exported names must be changed explicitly. Editing a custom function updates its pinned local version. Dependencies and exported symbols are validated before GPU compilation, which remains the authority on GLSL semantics.

## Storage and portability

Everything stays in this browser on this origin. Changing host, port, or deployment origin creates a separate storage namespace. Browser data can be evicted or cleared, so export backups. Temporary sessions remain editable if IndexedDB fails; use package export to retain work. Cold-start offline loading is not provided.

**Save** updates a project, **Save As New** creates an independent identity, and **Save Version** stores an immutable snapshot. Recovery drafts are written after one second of inactivity. Restoring a version preserves history and creates a working draft.

- `.shaderlab.zip`: versioned manifest, project, pinned modules (including disabled custom modules), assets, assembled source when valid, and runtime documentation.
- `.shaderlab.json`: complete asset-free project.
- `.glsl.zip`: assembled vertex/fragment source, uniform contract, and attribution. Other engines, including Unity, need adaptation.
- PNG screenshot: current preview frame.

Imports validate the entire package before database writes, remap identities, reject traversal paths and missing dependencies, and never overwrite an existing project. Limits: 100 entries, 100MB compressed, 200MB expanded.

Images: PNG/JPEG/WebP, at most 10MB and 4096px per dimension. Models: self-contained uncompressed GLB 2.0, at most 20MB and 250,000 triangles; static triangle meshes with normals, without animation, skins, or morph targets. Effects using UVs require model UVs. GLB materials are replaced by the active shader. External model resources are blocked.

Gallery images are captured from the real examples at animation time zero. To refresh them, start the dev server and run `npm run thumbnails`. The script also saves an editor screenshot in `output/playwright/`.

## Architecture

- `src/engine`: deterministic source assembly, dependency resolution, diagnostic mapping, and a React-independent Three.js renderer.
- `src/features`: library, editor, Monaco integration, function controls, parameters, collections, and help.
- `src/storage`: transactional Dexie repository, asset validation, and portable imports/exports. Asset Blobs are serialized to ArrayBuffers for reliable WebKit storage and reconstructed on load; legacy Blob records remain readable.
- `src/content`: original examples and versioned reusable modules.
- `src/shared`: versioned Zod schemas and public contracts.

Monaco and Three.js load only when opening the editor. Each editor owns one renderer. Library thumbnails are static assets or captured saved previews. Resources are disposed on replacement and unmount. Metrics show CPU frame intervals and renderer counts, not precise GPU time or VRAM.

## GitHub Pages

Push the project to a GitHub repository and set **Settings → Pages → Source → GitHub Actions**. The **Deploy to GitHub Pages** workflow verifies and publishes pushes to `main`; it can also be run manually. Hash routes support direct editor links and refreshes. User-provided reference mockups and generated local artifacts are excluded from version control.

The workflow defaults to `/<repository-name>/`. For an account root site or custom domain, change `VITE_BASE_PATH` to `/`. Workers and bundled assets follow Vite's base. Local production builds use relative paths by default.

For a repeatable 1280×720 performance sample on your own hardware, start the dev server and run `npm run benchmark`. It records the browser, CPU, renderer, sampled FPS, compile time, and resource counts in `output/playwright/performance.json`. Hardware targets are recorded separately from browser correctness tests.

The independent verification workflow runs on pull requests or manual dispatch. Pushes to `main` run the deployment workflow, which performs the same checks before publication. Opening a pull request does not publish the site.

## License and attribution

Application code, bundled functions, shaders, and original vector illustrations are MIT licensed; see `LICENSE`. Third-party dependencies retain their own licenses. The supplied design reference images are user-provided references and are not included in the application build.

## Initial implementation validation — November 23, 2026

- Type checking and the production build pass.
- 58 unit/integration tests pass.
- 33 production-build browser tests pass across Chromium 141, Firefox 142, and WebKit 26. They also validate a `/shader-explorer/` deployment base, all 12 shader programs, texture/GLB package transfer, recovery drafts, unsupported WebGL2, context restoration, and responsive widths from 390px to 1440px.
- At 1280×720, each of the 12 examples averaged 119–120 FPS across three samples in Firefox 142 on the Apple M4 Max development Mac. The privacy-limited renderer string was “Apple M1, or similar.” These are local measurements, not a guarantee for other hardware.
- The final `dist/` uses relative paths for local preview. Nothing was published or pushed to a remote repository.

Screenshots and the detailed hardware-specific report are in `output/playwright/`. This generated output is ignored by version control. The editor is loaded on demand; its Monaco bundle currently produces a Vite chunk-size advisory.

The subsequent iridescent material update adds preview bloom and passed 58 unit/integration tests plus 15 targeted browser checks across Chromium, Firefox, and WebKit. The FPS figures above describe the initial version before bloom.

## Custom functions and variables

Use **New Function** in the left panel to write a function from scratch. Choose its exported GLSL name, source, usage example, shader stages, and optional dependencies. The Custom group opens automatically and the source becomes editable in Monaco. Call the function from the vertex or fragment body and compile to apply it. **Browse Library** still adds existing building blocks.

Use the **+** beside Parameters, or **New Variable**, to create a named value. Supported types are float, int, bool, vec2/3/4, color, and sampler2D. Configure defaults, numeric bounds, and a display group. Variables are available inside shader bodies and custom functions:

- **Uniform** values update immediately once the declaration has been compiled.
- **Constant** values generate typed GLSL `const` declarations and require compilation after a value change. Texture samplers are uniforms only.

The variable manager also edits or deletes existing definitions. Names are checked for reserved identifiers and collisions. Renaming a function or variable does not rewrite existing GLSL references; diagnostics identify calls that need updating. Projects, versions, and packages retain custom functions and variable definitions.
