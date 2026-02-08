import { startSession, ensureLoggedIn, closeSession } from './browser.js';
import type { BrowserSession } from './browser.js';

export async function whoami() {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    if (!await ensureLoggedIn(session.page)) {
      console.error('Not logged in.');
      process.exit(1);
    }

    // Get profile link
    const profileLink = await session.page.getAttribute('[data-testid="AppTabBar_Profile_Link"]', 'href');
    const handle = profileLink?.split('/')[1];

    // Get display name from account switcher
    const accountSwitcher = await session.page.locator('[data-testid="SideNav_AccountSwitcher_Button"]');
    const accountText = await accountSwitcher.innerText();
    const displayName = accountText.split('\n')[0];

    console.log(`Logged in as @${handle}`);
    console.log(`Name: ${displayName}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function readTweet(urlOrId: string) {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    let url = urlOrId;

    if (!url.startsWith('http')) {
      if (/^\d+$/.test(urlOrId)) {
        url = `https://x.com/i/web/status/${urlOrId}`;
      } else {
        console.error('Invalid tweet URL or ID');
        return;
      }
    }

    console.log(`Reading tweet: ${url}`);
    await session.page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for tweet content
    try {
      await session.page.waitForSelector('[data-testid="tweetText"]', { timeout: 10000 });

      const text = await session.page.locator('[data-testid="tweetText"]').first().innerText();
      const authorEl = await session.page.locator('[data-testid="User-Name"]').first();
      const authorText = await authorEl.innerText();
      const [displayName, handle] = authorText.split('\n');

      console.log(`\n--- Tweet ---\n`);
      console.log(`${displayName} (@${handle})`);
      console.log(text);
      console.log(`\n-------------\n`);
    } catch (e) {
      console.error('Could not read tweet content. The page structure may have changed.');
    }

  } catch (error) {
    console.error('Error reading tweet:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function searchTweets(query: string) {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
    console.log(`Searching for: "${query}"`);

    await session.page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await session.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

    const tweets = session.page.locator('[data-testid="tweet"]');
    const count = await tweets.count();

    console.log(`Found ${Math.min(count, 5)} tweets:\n`);

    for (let i = 0; i < Math.min(count, 5); i++) {
      const tweet = tweets.nth(i);
      const text = await tweet.locator('[data-testid="tweetText"]').innerText().catch(() => '[Image/Video only]');
      const authorEl = await tweet.locator('[data-testid="User-Name"]').innerText().catch(() => 'Unknown');
      const [name, handle] = authorEl.split('\n');
      const time = await tweet.locator('time').getAttribute('datetime').catch(() => '');

      console.log(`[${time}] ${name} (@${handle})`);
      const shortText = text.length > 100 ? text.substring(0, 100) + '...' : text;
      console.log(shortText);
      console.log(`---\n`);
    }

  } catch (error) {
    console.error('Error searching:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function listTimeline(listId: string) {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    const listUrl = `https://x.com/i/lists/${listId}`;
    console.log(`Reading List Timeline: ${listId}`);

    await session.page.goto(listUrl, { waitUntil: 'domcontentloaded' });
    await session.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

    const tweets = session.page.locator('[data-testid="tweet"]');
    const count = await tweets.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      const tweet = tweets.nth(i);
      const text = await tweet.locator('[data-testid="tweetText"]').innerText().catch(() => '[Media]');
      const authorEl = await tweet.locator('[data-testid="User-Name"]').innerText().catch(() => 'Unknown');
      const [name, handle] = authorEl.split('\n');
      const time = await tweet.locator('time').getAttribute('datetime').catch(() => '');

      console.log(`\n[${time}] ${name} (@${handle})`);
      console.log(text);
    }

  } catch (error) {
    console.error('Error reading list:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function postTweet(text: string) {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    if (!await ensureLoggedIn(session.page)) {
      console.error('Not logged in.');
      process.exit(1);
    }

    console.log('Composing tweet...');
    await session.page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded' });

    const inputSelector = '[data-testid="tweetTextarea_0"]';
    await session.page.waitForSelector(inputSelector, { timeout: 10000 });

    await session.page.fill(inputSelector, text);

    const submitSelector = '[data-testid="tweetButton"]';
    await session.page.waitForSelector(submitSelector);
    await session.page.click(submitSelector);

    // Wait for success indicator
    try {
      await session.page.waitForSelector('[data-testid="toast"]', { timeout: 5000 });
      console.log('Tweet posted successfully!');
    } catch {
      console.log('Tweet posted.');
    }

  } catch (error) {
    console.error('Error posting tweet:', error);
  } finally {
    if (session) await closeSession(session);
  }
}
