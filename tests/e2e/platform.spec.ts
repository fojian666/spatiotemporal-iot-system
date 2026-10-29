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

for (const width of [320, 390, 640, 675, 900, 1024, 1280]) {
  test(`compact overview and map controls remain reachable at ${width}px`, async ({ page }) => {
    await prepare(page);
    await page.setViewportSize({ width, height: 800 });
    await page.goto(local + '/#/');
    await expect(page.getByRole('heading', { level: 1, name: '一图感知平安' })).toBeVisible({ timeout: 20000 });
    if (width <= 640) {
      const nav = page.getByRole('navigation', { name: '移动端主导航' });
      const links = nav.getByRole('link');
      await expect(links).toHaveCount(7);
      const boxes = await links.evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
      }));
      expect(boxes.every((box, index) => box.scrollWidth <= box.clientWidth + 1 && (!index || boxes[index - 1].right <= box.left + 1))).toBe(true);
    }
    for (const label of ['接入感知节点', '区域健康度', '活动告警', '全无人系统', '实时消息速率']) {
      await expect(page.locator('.kpi').filter({ hasText: label })).toBeVisible();
    }
    await page.goto(local + '/#/simulation');
    const descriptions = page.locator('.scenario-card p');
    await expect(descriptions).toHaveCount(4);
    expect(await descriptions.evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1))).toBe(true);
    await page.goto(local + '/#/map');
    const layers = page.locator('.geo-page .map-layers');
    const tools = page.locator('.geo-page .map-tools');
    await expect(layers).toBeVisible();
    await expect(tools).toBeVisible();
    const layerBox = await layers.boundingBox();
    const toolBox = await tools.boundingBox();
    expect(layerBox!.x + layerBox!.width).toBeLessThanOrEqual(toolBox!.x);
    await layers.getByRole('button', { name: /立体地形/ }).scrollIntoViewIfNeeded();
    await expect(layers.getByRole('button', { name: /立体地形/ })).toBeInViewport();
    await layers.getByRole('button', { name: '卫星过境' }).scrollIntoViewIfNeeded();
    await expect(layers.getByRole('button', { name: '卫星过境' })).toBeInViewport();
  });
}

for (const width of [320, 390, 640, 675, 900, 1024, 1280]) {
  test(`flight summary and plan dialog remain usable at ${width}px`, async ({ page }) => {
    await prepare(page);
    await page.setViewportSize({ width, height: 800 });
    await login(page, '值班长');
    await page.goto(remote + '/#/drone');
    await expect(page.getByRole('heading', { name: '无人机一网统飞' })).toBeVisible();
    const summary = page.locator('.ops-summary');
    for (const label of ['机场', '无人系统', '执行中', '飞行计划', '媒体资产', '待处理线索']) {
      await expect(summary.locator('.ops-summary__item').filter({ hasText: label })).toBeVisible();
    }
    await page.getByRole('button', { name: /任务计划/ }).click();
    await page.getByRole('button', { name: '新建计划' }).click();
    const dialog = page.getByRole('dialog', { name: '新建飞行计划' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '创建计划' }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: '创建计划' })).toBeInViewport();
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toHaveCount(0);
  });
}

for (const [width, height] of [[320, 568], [375, 812], [390, 1000], [430, 932], [640, 800], [768, 1024], [900, 700], [1024, 1000], [1100, 760], [1280, 800], [1440, 1000], [1920, 1080], [844, 390]]) {
  test(`all seven modules render without overflow or uncaught exceptions at ${width}×${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
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

test('route entrances replay on SPA visits and back, but not on query or telemetry updates', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    const state = window as typeof window & { routeStarts: { route: string; name: string }[]; documentMarker: string };
    state.routeStarts = [];
    state.documentMarker = crypto.randomUUID();
    document.addEventListener('animationstart', event => {
      if (event.animationName.startsWith('route')) state.routeStarts.push({
        route: document.querySelector('main')?.getAttribute('data-route') ?? '', name: event.animationName,
      });
    });
  });
  await page.goto(local + '/#/simulation');
  const documentMarker = await page.evaluate(() => (window as typeof window & { documentMarker: string }).documentMarker);
  const entered = async (route: string) => {
    await expect.poll(() => page.evaluate(path => {
      const events = (window as typeof window & { routeStarts: { route: string; name: string }[] }).routeStarts;
      return events.filter(e => e.route === path).map(e => e.name);
    }, route)).toEqual(expect.arrayContaining(['routeTitle', 'routeTrace']));
  };
  const clear = () => page.evaluate(() => { (window as typeof window & { routeStarts: unknown[] }).routeStarts = []; });
  await entered('/simulation');
  for (const route of ['/', '/map', '/graph', '/platform', '/copilot', '/drone', '/simulation']) {
    await clear();
    await page.locator(`.rail__nav a[href="#${route}"]`).click();
    await entered(route);
    await expect(page.locator('main')).toHaveAttribute('data-route', route);
    expect(await page.evaluate(() => (window as typeof window & { documentMarker: string }).documentMarker)).toBe(documentMarker);
    const timings = await page.locator('.route-title__text, .page-header__icon, .panel, .kpi, .chat-panel, .docs-layout').evaluateAll(nodes => nodes.map(node => {
      const style = getComputedStyle(node);
      return { name: style.animationName, end: parseFloat(style.animationDuration) + parseFloat(style.animationDelay) };
    }));
    expect(timings.filter(t => t.name.startsWith('route')).every(t => t.end <= .621)).toBe(true);
  }
  // Let the initial events finish before testing actual in-place query/data updates.
  await page.waitForFunction(() => !document.getAnimations().some(animation =>
    animation instanceof CSSAnimation && animation.animationName.startsWith('route') && animation.playState === 'running'));
  await clear();
  await page.getByPlaceholder('搜索设备 / 区域').fill('WQ-04');
  await expect(page).toHaveURL(/search=WQ-04/);
  await expect(page.locator('.app-content')).toContainText('WQ-04');
  const clock = page.locator('.sim-clock');
  const clockBefore = await clock.innerText();
  await expect(clock).not.toHaveText(clockBefore);
  await page.waitForFunction(() => !document.getAnimations().some(animation =>
    animation instanceof CSSAnimation && animation.animationName.startsWith('route') && animation.playState === 'running'));
  expect(await page.evaluate(() => (window as typeof window & { routeStarts: unknown[] }).routeStarts)).toEqual([]);
  await clear();
  await page.goBack();
  await entered('/drone');
  expect(await page.evaluate(() => (window as typeof window & { documentMarker: string }).documentMarker)).toBe(documentMarker);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 720 }]) {
  test(`review route surfaces and static reduction at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await prepare(page);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const path of ['/', '/drone', '/platform', '/simulation', '/map', '/graph', '/copilot']) {
      await page.goto(local + '/#' + path);
      const header = page.locator('.page-header, .geo-header');
      await expect(header).toBeVisible();
      await expect(header).toHaveCSS('opacity', '1');
      await expect(header).toHaveCSS('transform', 'none');
      await expect(header.locator('.route-title__text')).toHaveCSS('transform', 'none');
      await expect(header.locator('.route-title__text')).toHaveCSS('opacity', '1');
      const cue = await header.evaluate(node => ({ opacity: getComputedStyle(node, '::after').opacity, duration: getComputedStyle(node, '::after').animationDuration }));
      expect(cue.opacity).toBe('0');
      expect(parseFloat(cue.duration)).toBeLessThanOrEqual(.00001);
      const shot = await page.screenshot({ path: `output/playwright/arrival-${viewport.width}-${path.slice(1) || 'overview'}.png`, animations: 'disabled' });
      await testInfo.attach(`${viewport.width}-${path || 'overview'}`, { body: shot, contentType: 'image/png' });
    }
  });
}

test('committed alert feedback keeps order and the completed count accurate', async ({ page }) => {
  await prepare(page);
  await page.goto(local + '/#/');
  const rows = page.locator('.alert-row');
  await expect(rows.first()).toBeVisible();
  const titles = await rows.locator('.alert-row__body strong').allTextContents();
  const statuses = await rows.locator('.alert-status').allTextContents();
  const row = rows.nth(statuses.findIndex(status => status.trim() === '待处置'));
  await row.locator('.alert-row__main').click();
  await row.getByRole('button', { name: '联动处置', exact: true }).click();
  await expect(row.locator('.alert-status')).toHaveText('处置中');
  await expect(row.locator('.alert-confirmation')).toHaveCount(1);
  const before = Number(await page.locator('.feed-tabs button').first().locator('[aria-label]').getAttribute('aria-label'));
  await row.getByRole('button', { name: '标记完成', exact: true }).click();
  await expect(row.locator('.alert-status')).toHaveText('已完成');
  await expect(page.locator('.feed-tabs button').first().locator('[aria-label]')).toHaveAttribute('aria-label', String(before - 1));
  expect(await rows.locator('.alert-row__body strong').allTextContents()).toEqual(titles);
  await page.locator('.feed-tabs button').nth(1).click();
  await page.locator('.feed-tabs button').first().click();
  await expect(page.locator('.alert-confirmation')).toHaveCount(0);
});

test('rejected acknowledgement preserves server status, reports failure and can retry', async ({ page }) => {
  await prepare(page);
  await login(page, '值班长');
  await page.route('**/api/alerts/*/ack', route => route.fulfill({ status: 503, json: { detail: 'unavailable' } }));
  const row = page.locator('.alert-row').first();
  await row.locator('.alert-row__main').click();
  const status = await row.locator('.alert-status').textContent();
  await row.locator('.alert-row__actions button').click();
  await expect(page.getByRole('alert')).toHaveText('状态更新失败，请重试。');
  await expect(row.locator('.alert-status')).toHaveText(status!);
  await expect(page.locator('.alert-confirmation')).toHaveCount(0);
  await expect(row.locator('.alert-row__actions button')).toBeEnabled();
});

test('scenario handoff follows commit and does not replay on ticks or rejected writes', async ({ page }) => {
  await prepare(page);
  await page.goto(local + '/#/simulation');
  await page.locator('.scenario-card').nth(1).click();
  await expect(page.locator('.scenario-feedback')).toContainText('场景已切换');
  const once = await page.locator('.scenario-feedback').evaluate(node => { node.setAttribute('data-probe', 'same'); return node.textContent; });
  await expect(page.locator('.scenario-feedback[data-probe="same"]')).toHaveText(once!);
  await expect(page.locator('.scenario-feedback')).toHaveCount(0, { timeout: 4000 });
  await page.waitForTimeout(1100);
  await expect(page.locator('.scenario-feedback')).toHaveCount(0);
  await login(page, '值班长');
  await page.goto(remote + '/#/simulation');
  const selected = await page.locator('.scenario-card.is-active').getAttribute('aria-pressed');
  expect(selected).toBe('true');
  await page.route('**/api/scenarios/*', route => route.fulfill({ status: 503, json: { detail: 'unavailable' } }));
  await page.locator('.scenario-card:not(.is-active)').first().click();
  await expect(page.getByRole('alert')).toHaveText('场景切换失败，请重试。');
  await expect(page.locator('.scenario-feedback')).toHaveCount(0);
});

test('Copilot evidence links locate real devices and graph nodes, including static motion', async ({ page }) => {
  await prepare(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(local + '/#/copilot');
  await page.getByRole('textbox', { name: '向物联大模型提问' }).fill('WQ-04当前状态');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const cards = page.locator('.chat-message--assistant').last().locator('.evidence-card');
  await expect(cards.first()).toBeVisible();
  await expect(cards.first()).toHaveCSS('transform', 'none');
  await cards.first().getByRole('link').click();
  await expect(page).toHaveURL(/map\?focus=WQ-04/);
  await expect(page.locator('.asset-row.is-selected')).toContainText('WQ-04');
  await expect(page.locator('.geo-target-body')).toBeVisible();
  await page.goto(local + '/#/copilot');
  await page.getByRole('textbox', { name: '向物联大模型提问' }).fill('MQTT是什么');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const graph = page.locator('.chat-message--assistant').last().locator('.evidence-card--graph').first().getByRole('link');
  const href = await graph.getAttribute('href');
  await graph.click();
  expect(page.url()).toContain(href!.replace('#', ''));
  await expect(page.locator('.kg-detail__body')).toBeVisible();
});

test('moving selection rings replay for different UAV assets but not telemetry', async ({ page }) => {
  await prepare(page);
  await page.route('**/World_Imagery/MapServer/tile/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }));
  await page.goto(local + '/#/map?focus=UAV-01');
  const moving = page.locator('.map-moving--drone');
  await expect(moving).toHaveAttribute('data-selection', 'UAV-01');
  const initialRing = await moving.locator('.map-selection-ring').elementHandle();
  expect(initialRing).toBeTruthy();
  await page.waitForTimeout(1200);
  expect(await initialRing!.evaluate(node => node.isConnected)).toBe(true);
  await page.locator('.asset-row').filter({ hasText: 'UAV-02' }).click();
  await expect(moving).toHaveAttribute('data-selection', 'UAV-02');
  expect(await initialRing!.evaluate(node => node.isConnected)).toBe(false);
  await expect(moving.locator('.map-selection-ring')).toHaveCSS('animation-name', 'selectionLocate');
  await page.waitForTimeout(850);
  await expect(moving.locator('.map-selection-ring')).toHaveCSS('opacity', '0');
});

for (const [width, height] of [[390, 844], [768, 1024], [1440, 720]]) {
  test(`interaction review screenshots in both themes at ${width}×${height}`, async ({ page }) => {
    await prepare(page);
    await page.setViewportSize({ width, height });
    await page.route('**/World_Imagery/MapServer/tile/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }));
    mkdirSync('output/playwright', { recursive: true });
    for (const theme of ['dark', 'light']) {
      await page.goto(local + '/#/simulation');
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: '切换主题', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.locator('.scenario-card:not(.is-active)').first().click();
      await expect(page.locator('.scenario-feedback')).toBeVisible();
      const metric = page.locator('.env-param strong span').first();
      await expect(metric).toHaveCSS('font-size', '12px');
      const feedback = page.locator('.scenario-feedback');
      const bounds = await feedback.boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThan(height - (width <= 640 ? 58 : 0));
      await page.screenshot({ path: `output/playwright/interaction-${width}-${theme}-scenario.png` });
      await page.goto(local + '/#/map?focus=WQ-04');
      await expect(page.locator('.geo-target-body')).toBeVisible();
      await page.screenshot({ path: `output/playwright/interaction-${width}-${theme}-map.png`, animations: 'disabled' });
      await page.goto(local + '/#/copilot');
      await page.getByRole('textbox', { name: '向物联大模型提问' }).fill('WQ-04当前状态');
      await page.getByRole('button', { name: '发送', exact: true }).click();
      const evidence = page.locator('.chat-message--assistant').last().locator('.evidence-card').first();
      await evidence.getByRole('link').waitFor({ state: 'visible' });
      await evidence.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `output/playwright/interaction-${width}-${theme}-evidence.png`, animations: 'disabled' });
    }
  });
}


test('investigation preserves origin and filters across map and telemetry visits', async ({ page }) => {
  await prepare(page);
  await page.goto(local + '/#/');
  await page.locator('.alert-row__main').first().click();
  await page.locator('.alert-row.is-open').getByRole('link', { name: '地图定位' }).click();
  const guide = page.getByRole('complementary', { name: '当前告警调查' });
  await expect(guide).toContainText('WQ-04');
  await expect(guide.getByRole('link', { name: /地图定位/ })).toHaveAttribute('data-visited', 'true');
  await guide.getByLabel('调查参考时段').selectOption('60');
  await guide.getByRole('link', { name: /遥测复核/ }).click();
  await page.getByPlaceholder('搜索设备 / 区域').fill('WQ');
  await guide.getByRole('link', { name: /地图定位/ }).click();
  await guide.getByRole('link', { name: /遥测复核/ }).click();
  await expect(page.getByPlaceholder('搜索设备 / 区域')).toHaveValue('WQ');
  await guide.getByRole('link', { name: '返回原告警' }).click();
  await expect(page.locator('.alert-row.is-open')).toContainText('WQ-04');
  await page.reload();
  await expect(guide.getByLabel('调查参考时段')).toHaveValue('60');
  await guide.getByRole('button', { name: '结束本次调查' }).click();
  await expect(guide).toHaveCount(0);
});

test('investigation preserves chat across evidence visits', async ({ page }) => {
  await prepare(page);
  await page.goto(local + '/#/');
  await page.locator('.alert-row__main').first().click();
  await page.locator('.alert-row.is-open').getByRole('link', { name: '辅助研判' }).click();
  const guide = page.getByRole('complementary', { name: '当前告警调查' });
  await expect(page.locator('.chat-message--assistant .evidence-card').first()).toBeVisible();
  await expect(page.locator('.chat-message--assistant')).toHaveCount(1);
  const input = page.getByPlaceholder('询问实时态势、设备读数、知识概念，或让我生成巡检任务…');
  await input.fill('稍后继续复核');
  await expect(guide.getByRole('link', { name: /辅助研判/ })).toHaveAttribute('data-visited', 'true');
  await page.locator('.chat-message--assistant .evidence-card').first().getByRole('link').click();
  await expect(page).toHaveURL(/map\?focus=WQ-04/);
  await guide.getByRole('link', { name: /辅助研判/ }).click();
  await expect(page.locator('.chat-message--assistant .evidence-card').first()).toBeVisible();
  await expect(page.locator('.chat-message--assistant')).toHaveCount(1);
  await expect(input).toHaveValue('稍后继续复核');
  await guide.getByRole('link', { name: '返回原告警' }).click();
  await expect(page.locator('.alert-row.is-open')).toContainText('WQ-04');
});

for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1440, 720], [844, 390]]) {
  test(`investigation reading review at ${width}px`, async ({ page }, testInfo) => {
    await prepare(page);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(local + '/#/');
    await page.locator('.alert-row__main').first().click();
    await page.locator('.alert-row.is-open').getByRole('link', { name: '辅助研判' }).click();
    await expect(page.locator('.chat-message--assistant .evidence-card').first()).toBeVisible();
    await expect(page.locator('.chat-message--assistant')).toHaveCount(1);
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: '切换主题' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.waitForTimeout(200);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await expect(page.getByRole('complementary', { name: '当前告警调查' })).toBeVisible();
      mkdirSync('output/playwright', { recursive: true });
      const shot = await page.screenshot({ path: `output/playwright/investigation-${width}-${theme}.png`, animations: 'disabled' });
      await testInfo.attach(`${width}-${theme}`, { body: shot, contentType: 'image/png' });
      const input = page.getByRole('textbox', { name: '向物联大模型提问' });
      await input.scrollIntoViewIfNeeded();
      await expect(input).toBeInViewport();
      await input.fill('继续复核');
      if (height <= 560) expect((await page.locator('.chat-scroll').boundingBox())!.height).toBeGreaterThan(100);
      await page.screenshot({ path: `output/playwright/investigation-${width}-${theme}-input.png`, animations: 'disabled' });
      await page.locator('.copilot-page').evaluate(node => { node.scrollTop = 0; });
    }
    await page.getByRole('navigation', { name: '告警调查步骤' }).getByRole('link', { name: /遥测复核/ }).click();
    await page.locator('.device-table-panel .panel-title').scrollIntoViewIfNeeded();
    const title = await page.locator('.device-table-panel .panel-title').boundingBox();
    expect(title!.height).toBeLessThan(32);
    await page.locator('.device-table__row').first().scrollIntoViewIfNeeded();
    await expect(page.locator('.device-table__row').first()).toBeInViewport();
    await page.screenshot({ path: `output/playwright/investigation-${width}-table.png`, animations: 'disabled' });
  });
}


test('viewer investigation clears on logout', async ({ page }) => {
  await prepare(page);
  await login(page, '观察员');
  await page.locator('.alert-row__main').first().click();
  await page.locator('.alert-row.is-open').getByRole('link', { name: '地图定位' }).click();
  const guide = page.getByRole('complementary', { name: '当前告警调查' });
  await expect(guide).toBeVisible();
  await guide.getByRole('link', { name: '返回原告警' }).click();
  await expect(page.locator('.alert-row.is-open .alert-row__actions button')).toBeDisabled();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '登录操作台' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('stiot-investigation-v1'))).toBeNull();
});

test('investigation keeps its origin when the scene changes', async ({ page }) => {
  await prepare(page);
  await page.goto(local + '/#/');
  const guide = page.getByRole('complementary', { name: '当前告警调查' });
  await page.locator('.alert-row__main').first().click();
  await page.locator('.alert-row.is-open').getByRole('link', { name: '地图定位' }).click();
  await guide.getByRole('link', { name: /遥测复核/ }).click();
  await page.locator('.scenario-card:not(.is-active)').first().click();
  await expect(guide).toContainText('原告警不在当前场景');
  await guide.getByRole('link', { name: '查看当前告警' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(guide).toContainText('原告警不在当前场景');
});


test('leaving an unsent investigation question keeps a draft without automatic retry', async ({ page }) => {
  await prepare(page);
  await page.goto(local + '/#/');
  await page.locator('.alert-row__main').first().click();
  await page.locator('.alert-row.is-open').getByRole('link', { name: '辅助研判' }).click();
  await expect(page.locator('.copilot-page')).toBeVisible();
  // Same-task hash navigation deterministically interrupts the 350ms arrival timer.
  await page.evaluate(() => { location.hash = '/map?focus=WQ-04'; });
  const guide = page.getByRole('complementary', { name: '当前告警调查' });
  await expect(page.locator('.geo-page')).toBeVisible();
  await guide.getByRole('link', { name: /辅助研判/ }).click();
  await expect(page.getByRole('textbox', { name: '向物联大模型提问' })).toHaveValue('WQ-04当前状态如何？');
  await page.waitForTimeout(1100);
  await expect(page.locator('.chat-message--user')).toHaveCount(0);
  await expect(guide.getByRole('link', { name: /辅助研判/ })).toHaveAttribute('data-visited', 'false');
});

for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1440, 720], [844, 390]]) {
  test(`live missing readings stay honest at ${width}x${height}`, async ({ page }, testInfo) => {
    await prepare(page);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/auth/ws-ticket', route => route.fulfill({ status: 503, json: { detail: 'offline test socket' } }));
    await page.route('**/api/bootstrap', async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.mode = 'live';
      body.readings = { 'WQ-04': { ph: 7.2, turbidity: 20 }, 'WT-01': { temperature: 20 }, 'UAV-01': { altitude: 70 } };
      body.statuses = Object.fromEntries(Object.keys(body.statuses).map(id => [id, ['WQ-04', 'WT-01', 'UAV-01'].includes(id) ? 'online' : 'offline']));
      body.history = [];
      await route.fulfill({ response, json: body });
    });
    await login(page, '观察员');
    await page.goto(remote + '/#/simulation?focus=WQ-01');
    const inspector = page.locator('.inspector');
    await expect(inspector).toContainText('暂无实时读数');
    await expect(inspector.locator('.inspector-hero strong')).toHaveText('--');
    await inspector.scrollIntoViewIfNeeded();
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: '切换主题' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      mkdirSync('output/playwright', { recursive: true });
      const shot = await page.screenshot({ path: `output/playwright/live-missing-${width}-${theme}.png`, animations: 'disabled' });
      await testInfo.attach(`${width}-${theme}`, { body: shot, contentType: 'image/png' });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    await page.goto(remote + '/#/simulation?focus=WQ-04');
    await expect(inspector.locator('.inspector-hero strong')).toContainText('7.20');
    await expect(inspector.locator('.inspector-hero .sparkline')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /实时读数 · 单点/ })).toBeVisible();
    await inspector.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/playwright/live-partial-${width}.png`, animations: 'disabled' });
    await page.goto(remote + '/#/map?focus=WQ-04');
    await expect(page.locator('.geo-target-body')).toContainText('--');
    await page.goto(remote + '/#/drone');
    await expect(page.locator('.airport-card').first().locator('.airport-card__grid')).toContainText('--');
    await expect(page.locator('.ops-console__readings')).toContainText('altitude');
    await expect(page.locator('.ops-console__readings')).not.toContainText('battery');
    await page.goto(remote + '/#/copilot');
    await page.getByRole('textbox', { name: '向物联大模型提问' }).fill('分析水质');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.locator('.chat-message--assistant').last()).toContainText('无数据');
    await expect(page.locator('.chat-message--assistant').last()).not.toContainText('NaN');
  });
}
