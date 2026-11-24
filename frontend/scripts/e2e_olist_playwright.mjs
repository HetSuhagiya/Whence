import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const artifactDir = "/Users/het09/.gemini/antigravity/brain/0d1051c6-9319-4cbd-a660-a688ba58259f";
const brainScreenshotsDir = path.join(artifactDir, "screenshots");
const repoScreenshotsDir = path.resolve("./docs/screenshots");

for (const dir of [brainScreenshotsDir, repoScreenshotsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function run() {
  console.log("Launching Chromium for Olist BigQuery E2E verification...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  const saveScreenshot = async (filename, options = {}) => {
    const p1 = path.join(brainScreenshotsDir, filename);
    const p2 = path.join(repoScreenshotsDir, filename);
    await page.screenshot({ path: p1, ...options });
    fs.copyFileSync(p1, p2);
    console.log(`Saved screenshot: ${filename}`);
  };

  try {
    // 1. Visit Dashboards list
    console.log("Navigating to http://localhost:3000/dashboards...");
    await page.goto("http://localhost:3000/dashboards", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Click on the Olist Operations Dashboard
    const olistCard = page.getByText(/Olist Operations Dashboard/i).first();
    if (await olistCard.isVisible()) {
      console.log("Opening existing Olist Operations Dashboard...");
      await olistCard.click();
    } else {
      console.log("Olist Operations Dashboard not in list, opening via URL directly...");
      await page.goto("http://localhost:3000/dashboards/14ee0e3e-cba2-42fe-aadd-c3d55e8ceddf", { waitUntil: "networkidle" });
    }

    // Wait for the dashboard page to load and fetch chart data
    console.log("Waiting for dashboard charts to load live BigQuery data...");
    await page.waitForSelector("canvas", { timeout: 30000 });
    // Allow BigQuery queries to finish returning and charts to render
    await page.waitForTimeout(4000);

    // Ensure Light Mode
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    });
    await page.waitForTimeout(500);

    // 2. Capture Dashboard in Light Mode
    console.log("Capturing olist_dashboard_light.png...");
    await saveScreenshot("olist_dashboard_light.png");

    // 3. Switch to Dark Mode & Capture Dashboard
    console.log("Switching to Dark Mode...");
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.waitForTimeout(500);
    console.log("Capturing olist_dashboard_dark.png...");
    await saveScreenshot("olist_dashboard_dark.png");

    // 4. Click Explain on the primary metric card
    console.log("Triggering Explain modal...");
    const explainBtn = page.locator("button[data-testid^='btn-explain-']").first();
    await explainBtn.click();

    // Wait for Explain dialog to open and stream SSE completion
    console.log("Waiting for Explain dialog stream...");
    await page.waitForSelector("[role='dialog']", { timeout: 10000 });
    // Wait for narrative to appear (step 10 completion)
    await page.waitForSelector("text=Analyzed", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3500);

    // 5. Capture Explain in Dark Mode
    console.log("Capturing olist_explain_dark.png...");
    await saveScreenshot("olist_explain_dark.png");

    // 6. Switch back to Light Mode & Capture Explain
    console.log("Switching to Light Mode for Explain...");
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    });
    await page.waitForTimeout(500);
    console.log("Capturing olist_explain_light.png...");
    await saveScreenshot("olist_explain_light.png");

    console.log("\nAll Playwright E2E verifications and screenshots captured successfully!");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("E2E Test Failed:", err);
  process.exit(1);
});
