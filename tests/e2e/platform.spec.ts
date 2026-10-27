import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const local = 'http://127.0.0.1:4175';
const remote = 'http://127.0.0.1:4176';

async function prepare(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('stiot-welcome-seen', '1'));
  // Map imagery/DEM may be offline; exercising that fallback must not depend on the internet.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)
      ? route.continue() : route.abort();
  });
}
async function login(page: Page, role: '观察员' | '值班长' | '管理员') {
  await page.goto(remote + '/#/');
  await page.getByRole('button', { name: `以${role}身份登录`, exact: true }).click();
  await expect(page.locator('.app-content')).toBeVisible();
}

for (const width of [1440, 1024, 390]) {
  test(`all seven modules render without overflow or uncaught exceptions at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await prepare(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const routes = [
      ['/', '一图感知平安'], ['/simulation', '物联仿真沙盘'], ['/map', '时空一张图'],
      ['/graph', '物联网知识图谱'], ['/platform', '文档中心'], ['/copilot', '物联大模型'], ['/drone', '无人机一网统飞'],
    ];
    for (const [path, title] of routes) {
      await page.goto(local + '/#' + path);
      await expect(page.locator('.app-content')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await expect.poll(() => page.locator('.app-content').evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      if (path === '/' || path === '/platform' || path === '/simulation') {
        mkdirSync('output/playwright', { recursive: true });
        const shot = await page.screenshot({ path: `output/playwright/${width}-${path.slice(1) || 'overview'}.png`, animations: 'disabled' });
        await testInfo.attach(`${width}-${path || 'overview'}`, { body: shot, contentType: 'image/png' });
      }
    }
    expect(errors).toEqual([]);
  });
}

test('alert → map → telemetry → browser back preserves device context', async ({ page }) => {
  await prepare(page);
  await page.goto(local + '/#/');
  await page.locator('.alert-row__main').first().click();
  await expect(page).toHaveURL(/alert=normal-1/);
  await page.locator('.alert-row.is-open').getByRole('link', { name: '地图定位' }).click();
  await expect(page).toHaveURL(/map\?focus=WQ-04/);
  await expect(page.locator('.asset-row.is-selected')).toContainText('WQ-04');
  await page.getByRole('link', { name: /遥测/ }).first().click();
  await expect(page).toHaveURL(/simulation\?focus=WQ-04/);
  await expect(page.locator('.simulation-page')).toContainText('WQ-04');
  await page.goBack();
  await expect(page.locator('.asset-row.is-selected')).toContainText('WQ-04');
  await page.goBack();
  await expect(page.locator('.alert-row__main').first()).toHaveAttribute('aria-expanded', 'true');
});

test('telemetry filtering survives reload and can clear empty results', async ({ page }) => {
  await prepare(page);
  await page.goto(local + '/#/simulation?focus=WQ-04');
  const search = page.getByPlaceholder('搜索设备 / 区域');
  await search.fill('not-a-device');
  await expect(page).toHaveURL(/search=not-a-device/);
  await page.reload();
  await expect(search).toHaveValue('not-a-device');
  await page.getByRole('button', { name: /清除筛选/ }).click();
  await expect(search).toHaveValue('');
  await expect(page).not.toHaveURL(/search=/);
});

test('mobile document directory and paging stay usable with reduced motion', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(local + '/#/platform');
  const toggle = page.getByRole('button', { name: /文档目录/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.docs-nav__item').nth(1).click();
  await expect(page.locator('.docs-nav__item').nth(1)).toHaveAttribute('aria-current', 'page');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.locator('.docs-pager__btn.is-next').click();
  await expect(page.locator('.docs-nav__item').nth(2)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('.docs-page-turn')).toHaveCount(0);
});

test('theme and manual motion preferences survive reload; system reduction takes precedence', async ({ page }) => {
  await prepare(page);
  await page.goto(local + '/#/simulation');
  const html = page.locator('html');
  const before = await html.getAttribute('data-theme');
  await page.getByRole('button', { name: '切换主题' }).click();
  await expect(html).not.toHaveAttribute('data-theme', before!);
  const after = await html.getAttribute('data-theme');
  await page.getByRole('button', { name: '减少动态效果' }).click();
  await expect(html).toHaveAttribute('data-motion', 'reduced');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', after!);
  await expect(html).toHaveAttribute('data-motion', 'reduced');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: '减少动态效果' })).toBeDisabled();
  await expect(html).toHaveAttribute('data-motion', 'reduced');
});

test('viewer sees disabled writes but can investigate and browse flight tabs', async ({ page }) => {
  await prepare(page);
  await login(page, '观察员');
  await page.locator('.alert-row__main').first().click();
  await expect(page.locator('.alert-row.is-open .alert-row__actions button')).toBeDisabled();
  await expect(page.locator('.alert-row.is-open').getByRole('link', { name: '地图定位' })).toBeEnabled();
  for (const tab of ['assets', 'routes', 'plans', 'flight', 'media', 'clues']) {
    await page.goto(remote + '/#/drone?tab=' + tab);
    await expect(page.locator('.drone-page')).toBeVisible();
    await expect(page.locator('.ops-tabs .is-active')).toHaveCount(1);
  }
  await page.goto(remote + '/#/drone?tab=plans&search=UGV-01');
  await expect(page.getByRole('textbox', { name: '搜索飞行计划' })).toHaveValue('UGV-01');
  await expect(page.getByText('没有符合条件的飞行计划')).toBeVisible();
});

test('Copilot falls back when upstream unavailable and keeps named-device actions', async ({ page }) => {
  await prepare(page);
  await login(page, '值班长');
  await page.route('**/api/copilot/status', route => route.fulfill({ json: { enabled: true, configured: true, available: true, model: 'test-cloud' } }));
  await page.route('**/api/copilot/chat', route => route.fulfill({ status: 503, json: { detail: 'llm unavailable' } }));
  await page.goto(remote + '/#/copilot');
  await page.getByRole('textbox', { name: '向物联大模型提问' }).fill('WQ-04当前状态');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.copilot-page')).toContainText('WQ-04');
  await expect(page.locator('.chat-message--assistant').last()).toContainText('本地规则引擎');
  await page.getByRole('button', { name: '在地图中定位', exact: true }).click();
  await expect(page).toHaveURL(/map\?focus=WQ-04/);
  await page.goBack();
  // Messages intentionally belong to the mounted chat, so query again after returning.
  await page.getByRole('textbox', { name: '向物联大模型提问' }).fill('WQ-04当前状态');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByRole('button', { name: '查看设备遥测', exact: true }).click();
  await expect(page).toHaveURL(/simulation\?focus=WQ-04/);
});

test('cloud success displays its answer and logout returns to login', async ({ page }) => {
  await prepare(page);
  await login(page, '管理员');
  await page.route('**/api/copilot/status', route => route.fulfill({ json: { enabled: true, configured: true, available: true, model: 'test-cloud' } }));
  await page.route('**/api/copilot/chat', route => route.fulfill({ json: { text: '回归测试云端响应：请人工复核排口读数。', model: 'test-cloud', latencyMs: 10, usage: {} } }));
  await page.goto(remote + '/#/copilot');
  await page.getByRole('textbox', { name: '向物联大模型提问' }).fill('WQ-04当前状态');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('回归测试云端响应：请人工复核排口读数。')).toBeVisible();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '登录操作台' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('iot_console_access_token'))).toBeNull();
});


test('failed flight command rolls the cockpit back to server state', async ({ page }) => {
  await prepare(page);
  await login(page, '值班长');
  const token = await page.evaluate(() => sessionStorage.getItem('iot_console_access_token'));
  const response = await page.request.get('http://127.0.0.1:8020/api/drone/plans', { headers: { Authorization: `Bearer ${token}` } });
  const plan = (await response.json()).items.find((p: any) => p.status === '未开始');
  expect(plan).toBeTruthy();
  await page.route('**/api/drone/plans/*/command', route => route.fulfill({ status: 409, json: { detail: '回归测试：指令被拒绝' } }));
  await page.goto(remote + '/#/drone?tab=flight&plan=' + plan.id);
  const cockpit = page.locator('.flight-cockpit');
  await expect(cockpit).toContainText('未开始');
  await page.locator('.command--primary').click();
  await expect(page.getByText('回归测试：指令被拒绝')).toBeVisible();
  await expect(cockpit).toContainText('未开始');
  await expect(page.locator('.flight-progress strong')).toHaveText('0%');
});

test('offline terrain is marked unavailable and can be retried at tablet width', async ({ page }) => {
  await prepare(page);
  await page.route('**/World_Imagery/MapServer/tile/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }));
  await page.setViewportSize({ width: 1024, height: 900 });
  let probes = 0;
  page.on('request', request => { if (request.url().includes('terrarium')) probes++; });
  await page.goto(local + '/#/map');
  const terrain = page.getByRole('button', { name: /立体地形/ });
  await expect(terrain).toBeVisible();
  await expect(terrain).toHaveAttribute('aria-disabled', 'true');
  const before = probes;
  // Check the real pointer target: aria-disabled alone cannot detect an overlay.
  expect(await terrain.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
  // aria-disabled communicates unavailability; clicking is intentionally a retry.
  await terrain.click({ force: true });
  await expect.poll(() => probes).toBeGreaterThan(before);
  await expect(terrain).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.asset-list')).toBeVisible();
  await page.screenshot({ path: 'output/playwright/1024-map.png', animations: 'disabled' });
});
