import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';

async function test(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    console.error(`  ✗ ${label}: ${e.message}`);
    process.exitCode = 1;
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log('\n── Dashboard ──');
await page.goto(BASE);
await page.waitForLoadState('networkidle');

await test('Dashboard loads', async () => {
  await page.waitForSelector('.page-title', { timeout: 5000 });
  const title = await page.textContent('.page-title');
  if (!title.includes('Dashboard')) throw new Error(`Got: ${title}`);
});

await test('Stat cards render', async () => {
  const cards = await page.$$('.stat-card');
  if (cards.length < 4) throw new Error(`Only ${cards.length} stat cards`);
});

console.log('\n── CRM & Leads ──');
await page.click('a[href="/crm"]');
await page.waitForLoadState('networkidle');

await test('CRM page loads', async () => {
  await page.waitForSelector('.kanban-board, .empty-state', { timeout: 5000 });
});

await test('Add Lead modal opens', async () => {
  await page.click('button:has-text("Add Lead")');
  await page.waitForSelector('.modal', { timeout: 3000 });
  const title = await page.textContent('.modal-title');
  if (!title.includes('Add Lead')) throw new Error(`Got: ${title}`);
  await page.keyboard.press('Escape');
});

await test('Switch to Directory tab', async () => {
  await page.click('.tab-btn:has-text("Directory")');
  await page.waitForSelector('table', { timeout: 3000 });
  // seed data should show Acme Corp and Tech Supplies
  const rows = await page.$$('tbody tr');
  if (rows.length < 2) throw new Error(`Expected seed data, got ${rows.length} rows`);
});

await test('Add Contact modal opens', async () => {
  await page.click('button:has-text("Add Contact")');
  await page.waitForSelector('.modal', { timeout: 3000 });
  await page.keyboard.press('Escape');
});

console.log('\n── GST Billing ──');
await page.click('a[href="/billing"]');
await page.waitForLoadState('networkidle');

await test('Billing page loads with tabs', async () => {
  await page.waitForSelector('.tab-btn', { timeout: 5000 });
  const tabs = await page.$$('.tab-btn');
  if (tabs.length < 2) throw new Error('Expected 2 tabs');
});

await test('Party and product dropdowns present', async () => {
  // option elements inside a closed select are not "visible"; wait for the select itself
  await page.waitForSelector('select.form-input', { timeout: 5000 });
  const selects = await page.$$('select.form-input');
  if (selects.length < 2) throw new Error(`Expected 2 dropdowns, got ${selects.length}`);
});

await test('Invoice History tab works', async () => {
  await page.click('.tab-btn:has-text("Invoice History")');
  await page.waitForSelector('.card', { timeout: 3000 });
});

console.log('\n── Inventory ──');
await page.click('a[href="/inventory"]');
await page.waitForLoadState('networkidle');

await test('Inventory page loads with stat cards', async () => {
  await page.waitForSelector('table', { timeout: 5000 });
  const rows = await page.$$('tbody tr');
  if (rows.length < 2) throw new Error(`Expected seeded products, got ${rows.length}`);
});

await test('Add Product modal opens', async () => {
  await page.click('button:has-text("Add Product")');
  await page.waitForSelector('.modal', { timeout: 3000 });
  await page.keyboard.press('Escape');
});

await test('Search filters products', async () => {
  await page.fill('input[placeholder*="Search"]', 'Laptop');
  await page.waitForTimeout(300);
  const rows = await page.$$('tbody tr');
  if (rows.length !== 1) throw new Error(`Expected 1 result, got ${rows.length}`);
  await page.fill('input[placeholder*="Search"]', '');
});

console.log('\n── Settings ──');
await page.click('a[href="/settings"]');
await page.waitForLoadState('networkidle');

await test('Settings page has company form', async () => {
  await page.waitForSelector('form', { timeout: 5000 });
  const inputs = await page.$$('input.form-input');
  if (inputs.length < 3) throw new Error(`Too few inputs: ${inputs.length}`);
});

await test('Export button exists', async () => {
  const btn = await page.$('button:has-text("Export")');
  if (!btn) throw new Error('Export button not found');
});

await browser.close();
console.log('\n── All smoke tests done ──\n');
