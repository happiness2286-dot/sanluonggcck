const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('response', res => { if (res.status() >= 400) console.log('HTTP 4xx/5xx:', res.status(), res.url()); });

  console.log('Testing GitHub Pages live URL: https://happiness2286-dot.github.io/sanluonggcck/#/print/traveler/PO485-01');
  await page.goto('https://happiness2286-dot.github.io/sanluonggcck/#/print/traveler/PO485-01', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const error404 = await page.$('text=Lỗi kết nối máy chủ');
  console.log('Live Error 404 present?:', !!error404);

  const sheet = await page.$('[data-testid="job-traveler-sheet"]');
  console.log('Live Traveler Sheet present?:', !!sheet);

  console.log('Testing Live TopRoleBar buttons on GitHub Pages...');
  await page.click('button:has-text("Tổ Trưởng / QC")');
  await page.waitForTimeout(1000);
  console.log('Live URL after QC click:', page.url());

  await page.click('button:has-text("Kế Hoạch & Tuần")');
  await page.waitForTimeout(1000);
  console.log('Live URL after Schedule click:', page.url());

  await browser.close();
  console.log('ALL LIVE TESTS SUCCESSFUL!');
})();
