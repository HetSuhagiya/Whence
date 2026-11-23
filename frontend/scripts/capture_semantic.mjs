import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const artifactDir = "/Users/het09/.gemini/antigravity/brain/0d1051c6-9319-4cbd-a660-a688ba58259f";
const screenshotsDir = path.join(artifactDir, "screenshots");
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function capture() {
  console.log("Launching chromium...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // 1. Semantic Layer Tab - Light Mode
  console.log("Navigating to /data...");
  await page.goto("http://localhost:3000/data", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  console.log("Clicking tab-semantic...");
  const semanticTab = page.locator('[data-testid="tab-semantic"]');
  await semanticTab.waitFor({ state: "visible", timeout: 5000 });
  await semanticTab.click();
  await page.waitForTimeout(1000);

  console.log("Taking light screenshot...");
  await page.screenshot({ path: path.join(screenshotsDir, "data_semantic_layer_light.png") });

  // 2. Semantic Layer Tab - Dark Mode
  console.log("Switching to dark mode...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await page.waitForTimeout(500);

  console.log("Taking dark screenshot...");
  await page.screenshot({ path: path.join(screenshotsDir, "data_semantic_layer_dark.png") });

  await browser.close();
  console.log("Screenshots captured successfully!");
}

capture().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
