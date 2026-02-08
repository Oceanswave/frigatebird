import { chromium, type Browser, type BrowserContext, type Page, type Cookie } from 'playwright';
import { getCookies } from '@steipete/sweet-cookie';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(process.cwd(), 'auth.json');

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function getXCookies(): Promise<{ auth_token?: string; ct0?: string }> {
  try {
    const result = await getCookies({
      browsers: ['chrome'],
      url: 'https://x.com'
    });
    
    const cookies: { auth_token?: string; ct0?: string } = {};
    
    for (const cookie of result.cookies) {
      if (cookie.name === 'auth_token') {
        cookies.auth_token = cookie.value;
      } else if (cookie.name === 'ct0') {
        cookies.ct0 = cookie.value;
      }
    }
    
    return cookies;
  } catch (error) {
    // console.warn('Failed to get cookies from Chrome:', error);
    return {};
  }
}

export async function extractChromeCookies(): Promise<Cookie[]> {
  const xCookies = await getXCookies();
  
  if (!xCookies.auth_token || !xCookies.ct0) {
    return [];
  }
  
  return [
    {
      name: 'auth_token',
      value: xCookies.auth_token,
      domain: '.x.com',
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax'
    },
    {
      name: 'ct0',
      value: xCookies.ct0,
      domain: '.x.com',
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: true,
      sameSite: 'Lax'
    }
  ];
}

export async function startSession(headless: boolean = true): Promise<BrowserSession> {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  let cookiesLoaded = false;
  
  // Try to load saved auth
  if (fs.existsSync(AUTH_FILE)) {
    try {
      const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
      if (state.cookies && state.cookies.length > 0) {
        await context.addCookies(state.cookies);
        cookiesLoaded = true;
      }
    } catch (e) {
      // console.warn('Failed to load auth.json', e);
    }
  }
  
  // Fallback to extracting from Chrome if not loaded
  if (!cookiesLoaded) {
    const cookies = await extractChromeCookies();
    if (cookies.length > 0) {
      await context.addCookies(cookies);
      // Save for next time
      fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies }, null, 2));
    }
  }
  
  const page = await context.newPage();
  return { browser, context, page };
}

export async function ensureLoggedIn(page: Page): Promise<boolean> {
  // Check if we are already on a logged-in page
  const url = page.url();
  if (url.includes('https://x.com/home') || url.includes('https://x.com/messages')) {
    return true;
  }

  try {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    
    // Wait for either login screen or home timeline
    // data-testid="AppTabBar_Home_Link" is a good indicator of logged in
    // data-testid="loginButton" is a good indicator of logged out
    
    const loggedInSelector = '[data-testid="AppTabBar_Home_Link"]';
    const loggedOutSelector = '[data-testid="loginButton"]';
    
    const result = await Promise.race([
      page.waitForSelector(loggedInSelector, { timeout: 5000 }).then(() => true),
      page.waitForSelector(loggedOutSelector, { timeout: 5000 }).then(() => false),
      page.waitForSelector('[data-testid="login"]', { timeout: 5000 }).then(() => false)
    ]).catch(() => false);
    
    return result;
  } catch (e) {
    return false;
  }
}
