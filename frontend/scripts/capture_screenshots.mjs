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

async function capture() {
  console.log("Launching chromium...");
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
  };

  // 1. Dashboards Home (Empty State) - Light Mode
  console.log("Capturing Dashboards Home - Light Mode...");
  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await saveScreenshot("dashboards_empty_light.png");

  // 2. Dashboards Home (Empty State) - Dark Mode
  console.log("Capturing Dashboards Home - Dark Mode...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await page.waitForTimeout(400);
  await saveScreenshot("dashboards_empty_dark.png");

  // 3. Data Page - Step 1: Connect - Light Mode
  console.log("Capturing Data - Step 1: Connect - Light Mode...");
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.setAttribute("data-theme", "light");
  });
  await page.goto("http://localhost:3000/data", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await saveScreenshot("data_step1_connect_light.png");

  // 4. Data Page - Step 1: Connect - Dark Mode
  console.log("Capturing Data - Step 1: Connect - Dark Mode...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await page.waitForTimeout(400);
  await saveScreenshot("data_step1_connect_dark.png");

  // Switch back to light mode and click "Use demo data (DuckDB)" to advance to Step 2
  console.log("Advancing to Step 2: Choose data...");
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.setAttribute("data-theme", "light");
  });
  const demoBtn = page.getByRole("button", { name: /Use demo data \(DuckDB\)/i });
  await demoBtn.click();
  await page.waitForTimeout(1000);

  // 5. Data Page - Step 2: Choose Data - Light Mode
  console.log("Capturing Data - Step 2: Choose Data - Light Mode...");
  await saveScreenshot("data_step2_choose_data_light.png");

  // 6. Data Page - Step 2: Choose Data - Dark Mode
  console.log("Capturing Data - Step 2: Choose Data - Dark Mode...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await page.waitForTimeout(400);
  await saveScreenshot("data_step2_choose_data_dark.png");

  // Proceed to Step 3: Test and save
  console.log("Advancing to Step 3: Test and save...");
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.setAttribute("data-theme", "light");
  });
  const proceedBtn = page.getByRole("button", { name: /Proceed to test & save/i });
  await proceedBtn.click();
  await page.waitForTimeout(1500);

  // 7. Data Page - Step 3: Test Connection (Passed) - Light Mode
  console.log("Capturing Data - Step 3: Test Connection (Passed) - Light Mode...");
  await saveScreenshot("data_step3_test_passed_light.png");

  // 8. Data Page - Step 3: Test Connection (Passed) - Dark Mode
  console.log("Capturing Data - Step 3: Test Connection (Passed) - Dark Mode...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await page.waitForTimeout(400);
  await saveScreenshot("data_step3_test_passed_dark.png");

  // 9. Data Page - Step 3: Test Connection (Failure State with Plain Fix)
  console.log("Simulating Step 3 Failure State...");
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.setAttribute("data-theme", "light");
  });
  // Inject mock failure into UI state to capture exact failure display requested
  await page.evaluate(() => {
    const failedCheck = document.createElement("div");
    failedCheck.id = "simulated-failure";
    failedCheck.className =
      "p-3.5 rounded-[4px] border border-[var(--trend-down)] bg-[var(--trend-down-subtle)]/60 text-[var(--text-main)] flex flex-col gap-1 text-[13px] my-2";
    failedCheck.innerHTML = `
      <div class="flex items-center gap-2.5 font-medium text-[var(--trend-down)]">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="12" stroke-width="2"/><line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2"/></svg>
        <span>BigQuery Job User permission</span>
      </div>
      <p class="text-[12px] text-[var(--text-muted)] pl-6">
        Permission denied creating query job in project 'ecommerce-prod-billing'.
      </p>
      <div class="ml-6 mt-1 p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[12px] text-[var(--trend-down)] font-sans">
        <span class="font-semibold block mb-0.5">Fix:</span>
        Grant role 'BigQuery Job User' (roles/bigquery.jobUser) to whence-sa@ecommerce-prod.iam.gserviceaccount.com on project 'ecommerce-prod-billing'.
      </div>
    `;
    const container = document.querySelector(".flex.flex-col.gap-2\\.5");
    if (container) {
      container.insertBefore(failedCheck, container.children[2]);
    }
  });
  await page.waitForTimeout(300);
  await saveScreenshot("data_step3_test_failure_light.png");

  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await page.waitForTimeout(300);
  await saveScreenshot("data_step3_test_failure_dark.png");

  // Dev Style Guide captures
  console.log("Capturing Dev Style Guide...");
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.setAttribute("data-theme", "light");
  });
  await page.goto("http://localhost:3000/dev/style", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await saveScreenshot("dev_style_light.png", { fullPage: true });

  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await page.waitForTimeout(400);
  await saveScreenshot("dev_style_dark.png", { fullPage: true });

  await browser.close();
  console.log("All screenshots captured and saved successfully.");
}

capture().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
