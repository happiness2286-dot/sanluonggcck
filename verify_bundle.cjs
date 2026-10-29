const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();

  const logs = [];
  page.on('console', (msg) => {
    console.log('PAGE LOG:', msg.type(), msg.text());
    logs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    console.log('PAGE ERROR:', err.message);
    logs.push({ type: 'error', text: err.message });
  });

  console.log('Navigating to http://localhost:5173/admin...');
  await page.goto('http://localhost:5173/admin', { waitUntil: 'networkidle' });
  console.log('Initial URL:', page.url());

  // Check 1: Click "Tổ Trưởng / QC"
  console.log('--- Clicking Tổ Trưởng / QC ---');
  const qcBtn = await page.locator('button:has-text("Tổ Trưởng / QC")').first();
  await qcBtn.click();
  await page.waitForTimeout(1500);
  console.log('QC URL:', page.url());
  const qcVisible = await page.locator('text=Nhật Ký Ca, QA/QC').isVisible();
  const bmVisible = await page.locator('text=BM.GC.01.02').isVisible();
  console.log('QC Title visible:', qcVisible, 'BM.GC.01.02 visible:', bmVisible);

  // Check 2: Click "Kế Hoạch & Tuần"
  console.log('--- Clicking Kế Hoạch & Tuần ---');
  const planBtn = await page.locator('button:has-text("Kế Hoạch & Tuần")').first();
  await planBtn.click();
  await page.waitForTimeout(1500);
  console.log('Schedule URL:', page.url());
  const planVisible = await page.locator('text=Kế Hoạch Ngày QR & Báo Cáo Tuần').isVisible();
  console.log('Schedule Title visible:', planVisible);

  await browser.close();

  const errors = logs.filter(l => l.type === 'error');
  if (errors.length > 0) {
    console.log('ERRORS FOUND:', errors);
  } else {
    console.log('PERFECT! ZERO ERRORS!');
  }
})();
