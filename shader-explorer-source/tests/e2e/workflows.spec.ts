import { test, expect, type Page } from "@playwright/test";
async function openExample(page: Page, name = "Iridescent Sphere") {
  await page.goto("./");
  await page.getByLabel("Search shaders").fill(name);
  await page
    .getByRole("button", { name: `Open ${name} in editor`, exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Project name")).toHaveValue(name);
  await expect(page.locator(".code-status")).toContainText(
    /Compiled|Compile error/,
  );
}
async function replaceCode(page: Page, code: string) {
  const input = page.getByRole("textbox", { name: "Editor content" });
  await page.locator(".monaco-editor .view-lines").first().click();
  const mac = await page.evaluate(() => /Macintosh/.test(navigator.userAgent));
  await page.keyboard.press(mac ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(code);
}
test("library filters, favorites, and list view", async ({
  page,
  browserName,
}) => {
  await page.goto("./");
  await expect(page.locator(".shader-card")).toHaveCount(12);
  await page.screenshot({
    path: `output/playwright/library-${browserName}.png`,
    fullPage: true,
  });
  await page.getByLabel("Search shaders").fill("Ocean");
  await expect(page.locator(".shader-card")).toHaveCount(1);
  await expect(page).toHaveURL(/q=Ocean/);
  await page
    .getByRole("button", { name: "Favorite Ocean Surface", exact: true })
    .click();
  await page.getByLabel("Clear search").click();
  await page
    .locator(".library-tabs")
    .getByRole("button", { name: /Favorites/ })
    .click();
  await expect(page.locator(".shader-card")).toHaveCount(1);
  await page.getByLabel("List view").click();
  await expect(page.locator(".shader-grid")).toHaveClass(/list-view/);
});
test("edit, compile failure recovery, save, and reload", async ({ page }) => {
  await openExample(page);
  await expect(page.locator(".code-status")).toContainText("Compiled");
  await replaceCode(page, "color = vec3(1.0, 0.12, 0.4);");
  await page.getByRole("button", { name: /^Compile/ }).click();
  await expect(page.locator(".code-status")).toContainText("Compiled");
  await replaceCode(page, "color = INVALID_GLSL;");
  await page.getByRole("button", { name: /^Compile/ }).click();
  await expect(page.locator(".diagnostics")).toContainText(
    "last successful preview retained",
  );
  await page.getByLabel("Project name").fill("Saved invalid experiment");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".save-status")).toContainText("Saved locally");
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await expect(page.getByLabel("Project name")).toHaveValue(
    "Saved invalid experiment",
  );
  await expect(page.locator(".diagnostics")).toBeVisible();
  await expect(page.locator(".canvas-host canvas")).toBeVisible();
});
test("uniforms, dependency blocking, versions, and restoration", async ({
  page,
}) => {
  await openExample(page);
  await page.getByLabel("uScale", { exact: true }).fill("7");
  await expect(page.getByLabel("uScale", { exact: true })).toHaveValue("7");
  await page.getByLabel("Include noise()", { exact: true }).click();
  await expect(page.getByRole("status")).toContainText("required");
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await page.getByLabel("Version name").fill("Seven");
  await page.getByRole("button", { name: "Save Version", exact: true }).click();
  await expect(page.locator(".version-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("uScale", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByLabel("uScale", { exact: true })).toHaveValue("7");
});
test("package export imports into an independent browser profile", async ({
  page,
  browser,
}) => {
  await openExample(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /Project package/ }).click();
  const download = await event;
  const path = await download.path();
  expect(path).toBeTruthy();
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto(new URL("./", page.url()).href);
  await other.locator("input[type=file]").setInputFiles(path!);
  await expect(other.getByRole("status")).toContainText(
    "Imported Iridescent Sphere",
  );
  await other.getByRole("link", { name: "My Shaders", exact: true }).click();
  await expect(other.locator(".shader-card")).toHaveCount(1);
  await context.close();
});
test("collections create and organize projects", async ({ page }) => {
  await page.goto("./#/collections");
  await page.getByRole("button", { name: "New Collection" }).click();
  await page.getByLabel("Collection name").fill("Light studies");
  await page
    .getByRole("button", { name: "Create Collection", exact: true })
    .click();
  await expect(page.getByRole("link", { name: /Light studies/ })).toBeVisible();
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page
    .getByRole("button", { name: "Add to Collection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Light studies", exact: true })
    .click();
  await page.getByRole("link", { name: "Collections", exact: true }).click();
  await page.getByRole("link", { name: /Light studies/ }).click();
  await expect(page.locator(".shader-card")).toHaveCount(1);
});
test("responsive layouts fit their viewport", async ({ page }) => {
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await openExample(page);
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.locator(".code-panel")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Parameters", exact: true }).click();
  await expect(page.getByLabel("uScale", { exact: true })).toBeVisible();
});
test("every built-in example compiles on the GPU", async ({ page }) => {
  test.setTimeout(180000);
  for (const name of [
    "Iridescent Sphere",
    "Lava Surface",
    "Ocean Surface",
    "Stylized Clouds",
    "Energy Field",
    "Crystal Material",
    "Holographic Grid",
    "Fluid Smoke",
    "Toon Surface",
    "Dissolve Object",
    "Procedural Terrain",
    "Chromatic Post Effect",
  ]) {
    await openExample(page, name);
    await expect(page.locator(".code-status"), name).toContainText("Compiled");
  }
});

test("texture and GLB assets survive a portable package round-trip", async ({
  page,
  browser,
}) => {
  await openExample(page);
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/pixel.png");
  await expect(page.getByRole("status")).toContainText("pixel.png imported");
  await replaceCode(page, "color = texture(uTexture, uv).rgb;");
  await page.getByRole("button", { name: /^Compile/ }).click();
  await expect(page.locator(".code-status")).toContainText("Compiled");
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/triangle.glb");
  await expect(page.locator(".preview-label")).toContainText("CUSTOM");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /Project package/ }).click();
  const file = await event;
  const otherContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const other = await otherContext.newPage();
  await other.goto(new URL("./", page.url()).href);
  await other.locator("input[type=file]").setInputFiles((await file.path())!);
  await expect(other.getByRole("status")).toContainText(
    "Imported Iridescent Sphere",
  );
  await other.getByRole("link", { name: "My Shaders", exact: true }).click();
  await expect(other.locator(".shader-card")).toHaveCount(1);
  await other
    .getByRole("button", {
      name: "Open Iridescent Sphere in editor",
      exact: true,
    })
    .click();
  await expect(other.locator(".code-status")).toContainText("Compiled");
  await expect(other.locator(".preview-label")).toContainText("CUSTOM");
  await expect(other.getByLabel("uTexture", { exact: true })).toContainText(
    "pixel.png",
  );
  await otherContext.close();
});
test("unsupported WebGL2 leaves source and export available", async ({
  page,
}) => {
  await page.addInitScript(
    `{ const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); }; }`,
  );
  await page.goto("./");
  await page
    .getByRole("button", {
      name: "Open Iridescent Sphere in editor",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("WebGL2 unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".monaco-editor .view-lines")).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Project package/ }),
  ).toBeVisible();
});

test("newer recovery drafts survive reload", async ({ page }) => {
  await openExample(page);
  await page.getByLabel("uScale", { exact: true }).fill("8");
  await expect(page.locator(".editor-footnote")).toContainText("Draft secured");
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page
    .getByRole("button", { name: "Recover Draft", exact: true })
    .click();
  await expect(page.getByLabel("uScale", { exact: true })).toHaveValue("8");
  await expect(page.locator(".save-status")).toContainText("Unsaved changes");
});
test("GPU context restoration rebuilds the successful shader", async ({
  page,
}) => {
  await openExample(page);
  const supported = await page
    .locator(".canvas-host canvas")
    .evaluate((canvas) => {
      const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
      const extension = gl?.getExtension("WEBGL_lose_context");
      if (!extension) return false;
      extension.loseContext();
      setTimeout(() => extension.restoreContext(), 1000);
      return true;
    });
  test.skip(!supported, "WEBGL_lose_context is not exposed by this browser.");
  await expect(
    page.getByText("GPU context lost", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("GPU context lost", { exact: true }),
  ).not.toBeVisible();
  await expect(page.locator(".code-status")).toContainText("Compiled");
});

test("bloom can be toggled, saved, and restored with the iridescent preview", async ({
  page,
}) => {
  await openExample(page);
  const toggle = page.getByRole("switch", {
    name: "Preview bloom",
    exact: true,
  });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  const before = await page.locator(".canvas-host canvas").screenshot();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  const after = await page.locator(".canvas-host canvas").screenshot();
  expect(before.equals(after)).toBe(false);
  await toggle.click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".save-status")).toContainText("Saved locally");
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Preview bloom", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".code-status")).toContainText("Compiled");
});

test("create custom functions and live variables from scratch", async ({
  page,
  browserName,
}) => {
  await openExample(page);
  await page.getByLabel("New variable", { exact: true }).click();
  await page.getByLabel("Variable name", { exact: true }).fill("uGain");
  await page.getByLabel("default", { exact: true }).fill("0.6");
  await page.getByRole("button", { name: "Add Variable", exact: true }).click();
  await expect(page.getByLabel("uGain", { exact: true })).toHaveValue("0.6");
  await page.getByRole("button", { name: "New Function", exact: true }).click();
  await page.getByLabel("Function name", { exact: true }).fill("myPulse");
  await page
    .getByLabel("GLSL function source", { exact: true })
    .fill(
      "vec3 myPulse(vec2 uv, float time) { return vec3(uGain * (0.5 + 0.5 * sin(time)), uv); }",
    );
  await page
    .getByLabel("Usage example", { exact: true })
    .fill("color = myPulse(uv, uTime);");
  if (browserName === "chromium")
    await page.screenshot({
      path: "output/playwright/custom-function.png",
      fullPage: true,
    });
  await page
    .getByRole("button", { name: "Create Function", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Include myPulse()", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Fragment Shader", exact: true })
    .click();
  await replaceCode(page, "color = myPulse(uv, uTime);");
  await page.getByRole("button", { name: /^Compile/ }).click();
  await expect(page.locator(".code-status")).toContainText("Compiled");
  await page.getByLabel("uGain", { exact: true }).fill("0.8");
  await expect(page.locator(".code-status")).toContainText("Compiled");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".save-status")).toContainText("Saved locally");
  await page.reload();
  await expect(page.locator(".code-status")).toContainText("Compiled");
  await expect(page.getByLabel("uGain", { exact: true })).toHaveValue("0.8");
  await page.getByRole("button", { name: "Custom 1", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "Include myPulse()", exact: true }),
  ).toBeChecked();
});
test("custom constants compile and persist with their values", async ({
  page,
}) => {
  await openExample(page);
  await page.getByLabel("New variable", { exact: true }).click();
  await page.getByLabel("Variable name", { exact: true }).fill("GAIN");
  await page
    .getByLabel("Variable kind", { exact: true })
    .selectOption("constant");
  await page.getByRole("button", { name: "Add Variable", exact: true }).click();
  await page
    .getByRole("button", { name: "Fragment Shader", exact: true })
    .click();
  await replaceCode(page, "color = vec3(GAIN);");
  await page.getByRole("button", { name: /^Compile/ }).click();
  await expect(page.locator(".code-status")).toContainText("Compiled");
  await page.getByLabel("GAIN", { exact: true }).fill("0.9");
  await expect(page.locator(".code-status")).toContainText("Recompile needed");
  await page.getByRole("button", { name: /^Compile/ }).click();
  await expect(page.locator(".code-status")).toContainText("Compiled");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".save-status")).toContainText("Saved locally");
  await page.reload();
  await expect(page.locator(".code-status")).toContainText("Compiled");
  await expect(page.getByLabel("GAIN", { exact: true })).toHaveValue("0.9");
});
