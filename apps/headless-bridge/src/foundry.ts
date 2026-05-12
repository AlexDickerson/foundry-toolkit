import type { Page } from 'playwright';
import type { BridgeEnv } from './env.js';

const LOG = '[headless-bridge]';

// Foundry VTT page routes (relative to the route prefix, e.g. /foundry):
//   /setup  -- world management (requires admin auth if FOUNDRY_ADMIN_KEY is set)
//   /join   -- user login for the currently-active world
//   /game   -- in-world view; the api-bridge module activates here

export async function loginToWorld(page: Page, env: BridgeEnv): Promise<void> {
  const { foundryUrl, foundryRoutePath, foundryAdminKey, bridgeGmUser, bridgeGmPass, bridgeWorldId } = env;
  const base = `${foundryUrl}${foundryRoutePath}`;

  console.info(`${LOG} Navigating to ${base}`);
  await page.goto(base, { waitUntil: 'networkidle', timeout: 30_000 });

  const landed = page.url();
  console.info(`${LOG} Landed on: ${landed}`);

  if (landed.includes('/game')) {
    console.info(`${LOG} Already in-world -- nothing to do`);
    return;
  }

  if (!landed.includes('/join')) {
    await handleSetup(page, foundryUrl, foundryRoutePath, foundryAdminKey, bridgeWorldId);
  }

  await handleJoin(page, foundryUrl, foundryRoutePath, bridgeGmUser, bridgeGmPass);
}

async function handleSetup(
  page: Page,
  foundryUrl: string,
  routePath: string,
  adminKey: string,
  worldId: string,
): Promise<void> {
  // Foundry shows an admin password form when the admin key is set and the
  // client has no valid session cookie. The input name varies by version.
  const adminInput = page.locator('input[name="adminKey"], input[name="key"], input[name="password"]').first();
  const needsAuth = await adminInput.isVisible({ timeout: 5_000 }).catch(() => false);

  if (needsAuth) {
    if (!adminKey) {
      throw new Error(
        'Foundry setup requires admin authentication but FOUNDRY_ADMIN_KEY is not set. ' +
          'Set FOUNDRY_ADMIN_KEY to the Foundry admin password, or pre-launch the world manually ' +
          'so the headless browser can go straight to /join.',
      );
    }
    console.info(`${LOG} Submitting admin key`);
    await adminInput.fill(adminKey);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    console.info(`${LOG} Admin auth done -- now on: ${page.url()}`);
  }

  // Admin auth may have redirected straight to /join if a world was already active.
  if (page.url().includes('/join')) return;

  // networkidle fires before Foundry's JS renders the world list. Wait for any
  // package element to appear in the DOM before searching for the specific world.
  console.info(`${LOG} Waiting for world list to render`);
  await page
    .locator('[data-package-id], [data-id], li.package, article.package')
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => {
      console.warn(`${LOG} World list did not appear within 20s -- proceeding anyway`);
    });

  // Find the world card by its ID (= directory slug under Data/worlds/).
  // v14 uses data-package-id; older builds used data-id -- try both.
  console.info(`${LOG} Locating world "${worldId}" in setup`);
  const worldCard = page.locator(`[data-package-id="${worldId}"], [data-id="${worldId}"]`).first();
  const cardVisible = await worldCard.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!cardVisible) {
    const found = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll('[data-package-id], [data-id]'))
          .slice(0, 10)
          .map((el) => ({
            tag: el.tagName,
            packageId: el.getAttribute('data-package-id'),
            dataId: el.getAttribute('data-id'),
          })),
      )
      .catch(() => []);
    console.error(`${LOG} Package elements on page: ${JSON.stringify(found)}`);
    throw new Error(
      `World "${worldId}" not found on the Foundry setup page. ` +
        "Check that BRIDGE_WORLD_ID matches the world's directory slug " +
        '(the name shown under each world card in the setup UI, not the display title). ' +
        `Worlds live in Data/worlds/<slug>/.`,
    );
  }

  // v14 uses <a data-action="worldLaunch"> inside the card; older builds used
  // a <button>. Match a wide net of possible launch controls.
  const launchBtn = worldCard
    .locator(
      [
        '[data-action="worldLaunch"]',
        '[data-action="launchWorld"]',
        '[data-action="launch"]',
        'button:has-text("Launch")',
        'a:has-text("Launch")',
      ].join(', '),
    )
    .first();
  if (!(await launchBtn.isVisible({ timeout: 2_000 }).catch(() => false))) {
    const cardHtml = await worldCard.evaluate((el) => el.outerHTML.slice(0, 2000)).catch(() => '');
    console.error(`${LOG} World card HTML: ${cardHtml}`);
    throw new Error(
      `Could not find a Launch button for world "${worldId}". ` +
        'The world card was found but no recognised launch control. See logged card HTML above.',
    );
  }

  console.info(`${LOG} Launching world "${worldId}"`);
  await launchBtn.click();

  const joinUrl = `${foundryUrl}${routePath}/join`;
  await page.waitForURL((url) => url.href.startsWith(joinUrl), { timeout: 90_000 });
  console.info(`${LOG} World active`);
}

async function handleJoin(
  page: Page,
  foundryUrl: string,
  routePath: string,
  username: string,
  password: string,
): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  console.info(`${LOG} Selecting user "${username}"`);

  const userSelect = page.locator('select[name="userid"], select#select-character, select').first();
  await userSelect.waitFor({ state: 'visible', timeout: 15_000 });
  await userSelect.selectOption({ label: username });

  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  if (password && (await passwordInput.isVisible({ timeout: 2_000 }).catch(() => false))) {
    await passwordInput.fill(password);
  }

  await page.locator('button[type="submit"]').first().click();
  console.info(`${LOG} Joining -- waiting for world to load (up to 2 min)`);

  const gameUrl = `${foundryUrl}${routePath}/game`;
  await page.waitForURL((url) => url.href.startsWith(gameUrl), { timeout: 120_000 });
  console.info(`${LOG} In-world as "${username}" -- api-bridge module is initialising`);
}
