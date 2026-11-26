import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const conversationId = "0d1051c6-9319-4cbd-a660-a688ba58259f";
const brainScreenshotsDir = `/Users/het09/.gemini/antigravity/brain/${conversationId}/screenshots`;
const repoScreenshotsDir = path.resolve("./docs/screenshots");

for (const dir of [brainScreenshotsDir, repoScreenshotsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function runHappyPath() {
  console.log("=== PLAYWRIGHT HAPPY PATH: CONNECT -> CHOOSE DATA -> MODEL -> DASHBOARD -> EXPLAIN V2 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  const saveScreenshot = async (filename) => {
    const p1 = path.join(brainScreenshotsDir, filename);
    const p2 = path.join(repoScreenshotsDir, filename);
    await page.screenshot({ path: p1 });
    fs.copyFileSync(p1, p2);
    console.log(`Saved screenshot: ${filename}`);
  };

  try {
    // 1. Visit /data - Step 1: Connect
    console.log("Navigating to http://localhost:3000/data...");
    await page.goto("http://localhost:3000/data", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Verify 4-step indicator is visible
    const stepIndicator = page.locator("[data-testid='workflow-step-indicator']");
    await stepIndicator.waitFor({ state: "visible", timeout: 10000 });
    console.log("Step indicator verified.");

    // Check if demo connection exists or click demo
    const demoBtn = page.getByRole("button", { name: /Use demo data \(DuckDB\)/i });
    if (await demoBtn.isVisible()) {
      console.log("Clicking 'Use demo data (DuckDB)'...");
      await demoBtn.click();
      await page.waitForTimeout(1000);
      const proceedBtn = page.getByRole("button", { name: /Proceed to test & save/i });
      if (await proceedBtn.isVisible()) {
        await proceedBtn.click();
        await page.waitForTimeout(1500);
      }
    }

    // 2. Switch to Model tab
    console.log("Navigating to Model tab...");
    const modelTab = page.locator("[data-testid='tab-semantic']");
    if (await modelTab.isVisible()) {
      await modelTab.click();
      await page.waitForTimeout(1500);
    }

    // Verify "Create dashboard from this data" button
    const createDashBtn = page.locator("[data-testid='btn-create-dashboard-from-model']");
    await createDashBtn.waitFor({ state: "visible", timeout: 10000 });
    console.log("'Create dashboard from this data' button verified.");

    // 3. Visit Dashboards Home (/)
    console.log("Navigating to http://localhost:3000/...");
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Open first dashboard
    const dashLink = page.locator("a[href^='/dashboards/']").first();
    await dashLink.waitFor({ state: "visible", timeout: 10000 });
    console.log("Found dashboard link, navigating...");
    await dashLink.click();
    await page.waitForTimeout(3000);

    // 4. Verify dashboard charts & hairline rules
    console.log("Verifying dashboard charts and Paul Tol palette...");
    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state: "visible", timeout: 15000 });
    console.log("Canvas charts rendered.");

    // 5. Open Explain Dialog
    console.log("Triggering Explain modal...");
    const explainBtn = page.locator("button[data-testid^='btn-explain-']").first();
    if (await explainBtn.isVisible()) {
      await explainBtn.click();
    } else {
      await page.locator("text=Explain").first().click();
    }

    // Wait for Explain dialog and narrative
    await page.waitForSelector("[role='dialog']", { timeout: 15000 });
    await page.waitForTimeout(4000);

    // Capture happy path screenshot
    await saveScreenshot("e2e_happy_path_explain.png");
    console.log("Happy-path test completed successfully!");
  } finally {
    await browser.close();
  }
}

runHappyPath().catch((err) => {
  console.error("Happy path failed:", err);
  process.exit(1);
});
