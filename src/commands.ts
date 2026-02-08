import { startSession, ensureLoggedIn, closeSession } from './browser.js';
import type { BrowserSession } from './browser.js';
import type { Page } from 'playwright';

// --- Helpers ---

function resolveTweetUrl(urlOrId: string): string | null {
  if (urlOrId.startsWith('http')) return urlOrId;
  if (/^\d+$/.test(urlOrId)) return `https://x.com/i/web/status/${urlOrId}`;
  return null;
}

function cleanHandle(handle: string): string {
  return handle.startsWith('@') ? handle.slice(1) : handle;
}

async function printTweets(page: Page, maxCount: number = 10): Promise<number> {
  const tweets = page.locator('[data-testid="tweet"]');
  const count = await tweets.count();
  const printed = Math.min(count, maxCount);

  for (let i = 0; i < printed; i++) {
    const tweet = tweets.nth(i);
    const text = await tweet.locator('[data-testid="tweetText"]').innerText().catch(() => '[Media]');
    const authorEl = await tweet.locator('[data-testid="User-Name"]').innerText().catch(() => 'Unknown');
    const parts = authorEl.split('\n');
    const time = await tweet.locator('time').getAttribute('datetime').catch(() => '');

    console.log(`[${time}] ${parts[0]} (${parts[1] || ''})`);
    console.log(text);
    console.log('---\n');
  }

  return printed;
}

// --- Existing commands ---

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
    const url = resolveTweetUrl(urlOrId);
    if (!url) {
      console.error('Invalid tweet URL or ID');
      return;
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

    await printTweets(session.page, 10);

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

// --- New commands ---

export async function thread(urlOrId: string) {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    const url = resolveTweetUrl(urlOrId);
    if (!url) {
      console.error('Invalid tweet URL or ID');
      return;
    }

    console.log(`Reading thread: ${url}`);
    await session.page.goto(url, { waitUntil: 'domcontentloaded' });
    await session.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

    // On a tweet detail page, the thread (connected tweets by same author)
    // appears above and below the focused tweet
    const printed = await printTweets(session.page, 25);
    console.log(`Showing ${printed} tweets in thread.`);

  } catch (error) {
    console.error('Error reading thread:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function replies(urlOrId: string) {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    const url = resolveTweetUrl(urlOrId);
    if (!url) {
      console.error('Invalid tweet URL or ID');
      return;
    }

    console.log(`Reading replies: ${url}`);
    await session.page.goto(url, { waitUntil: 'domcontentloaded' });
    await session.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

    // Skip the first tweet (the original) and print the rest (replies)
    const tweets = session.page.locator('[data-testid="tweet"]');
    const count = await tweets.count();

    if (count <= 1) {
      console.log('No replies found.');
      return;
    }

    console.log(`Replies:\n`);
    for (let i = 1; i < Math.min(count, 15); i++) {
      const tweet = tweets.nth(i);
      const text = await tweet.locator('[data-testid="tweetText"]').innerText().catch(() => '[Media]');
      const authorEl = await tweet.locator('[data-testid="User-Name"]').innerText().catch(() => 'Unknown');
      const parts = authorEl.split('\n');
      const time = await tweet.locator('time').getAttribute('datetime').catch(() => '');

      console.log(`[${time}] ${parts[0]} (${parts[1] || ''})`);
      console.log(text);
      console.log('---\n');
    }

  } catch (error) {
    console.error('Error reading replies:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function mentions() {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    if (!await ensureLoggedIn(session.page)) {
      console.error('Not logged in.');
      process.exit(1);
    }

    console.log('Reading mentions...');
    await session.page.goto('https://x.com/notifications/mentions', { waitUntil: 'domcontentloaded' });
    await session.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

    const printed = await printTweets(session.page, 10);
    if (printed === 0) console.log('No mentions found.');

  } catch (error) {
    console.error('Error reading mentions:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function userTweets(handle: string) {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    const user = cleanHandle(handle);
    const profileUrl = `https://x.com/${user}`;
    console.log(`Reading tweets from @${user}...`);

    await session.page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
    await session.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

    const printed = await printTweets(session.page, 10);
    if (printed === 0) console.log('No tweets found.');

  } catch (error) {
    console.error('Error reading user tweets:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function home() {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    if (!await ensureLoggedIn(session.page)) {
      console.error('Not logged in.');
      process.exit(1);
    }

    console.log('Reading home timeline...');
    await session.page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await session.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

    const printed = await printTweets(session.page, 10);
    if (printed === 0) console.log('No tweets in timeline.');

  } catch (error) {
    console.error('Error reading home timeline:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function bookmarks() {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    if (!await ensureLoggedIn(session.page)) {
      console.error('Not logged in.');
      process.exit(1);
    }

    console.log('Reading bookmarks...');
    await session.page.goto('https://x.com/i/bookmarks', { waitUntil: 'domcontentloaded' });

    try {
      await session.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });
      const printed = await printTweets(session.page, 10);
      if (printed === 0) console.log('No bookmarks found.');
    } catch {
      console.log('No bookmarks found.');
    }

  } catch (error) {
    console.error('Error reading bookmarks:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function follow(handle: string) {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    if (!await ensureLoggedIn(session.page)) {
      console.error('Not logged in.');
      process.exit(1);
    }

    const user = cleanHandle(handle);
    console.log(`Following @${user}...`);
    await session.page.goto(`https://x.com/${user}`, { waitUntil: 'domcontentloaded' });

    // The follow button has data-testid="<handle>-follow" when not following
    // and data-testid="<handle>-unfollow" when following
    const followBtn = session.page.locator(`[data-testid$="-follow"]`).first();
    const unfollowBtn = session.page.locator(`[data-testid$="-unfollow"]`).first();

    if (await unfollowBtn.count() > 0) {
      console.log(`Already following @${user}.`);
      return;
    }

    try {
      await followBtn.waitFor({ timeout: 5000 });
      await followBtn.click();
      console.log(`Followed @${user}!`);
    } catch {
      console.error(`Could not find follow button for @${user}.`);
    }

  } catch (error) {
    console.error('Error following user:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function unfollow(handle: string) {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    if (!await ensureLoggedIn(session.page)) {
      console.error('Not logged in.');
      process.exit(1);
    }

    const user = cleanHandle(handle);
    console.log(`Unfollowing @${user}...`);
    await session.page.goto(`https://x.com/${user}`, { waitUntil: 'domcontentloaded' });

    const followBtn = session.page.locator(`[data-testid$="-follow"]`).first();
    const unfollowBtn = session.page.locator(`[data-testid$="-unfollow"]`).first();

    if (await followBtn.count() > 0 && await unfollowBtn.count() === 0) {
      console.log(`Not following @${user}.`);
      return;
    }

    try {
      await unfollowBtn.waitFor({ timeout: 5000 });
      await unfollowBtn.click();

      // Confirm unfollow in dialog
      const confirmBtn = session.page.locator('[data-testid="confirmationSheetConfirm"]');
      await confirmBtn.waitFor({ timeout: 5000 });
      await confirmBtn.click();
      console.log(`Unfollowed @${user}.`);
    } catch {
      console.error(`Could not find unfollow button for @${user}.`);
    }

  } catch (error) {
    console.error('Error unfollowing user:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function lists() {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    if (!await ensureLoggedIn(session.page)) {
      console.error('Not logged in.');
      process.exit(1);
    }

    console.log('Reading your lists...');
    await session.page.goto('https://x.com/i/lists', { waitUntil: 'domcontentloaded' });

    // Wait for list cells to load
    try {
      await session.page.waitForSelector('a[href*="/i/lists/"]', { timeout: 10000 });
    } catch {
      console.log('No lists found.');
      return;
    }

    // Extract list links and names
    const listLinks = session.page.locator('[data-testid="cellInnerDiv"] a[href*="/i/lists/"]');
    const count = await listLinks.count();

    if (count === 0) {
      console.log('No lists found.');
      return;
    }

    const seen = new Set<string>();
    for (let i = 0; i < count; i++) {
      const link = listLinks.nth(i);
      const href = await link.getAttribute('href').catch(() => '');
      if (!href || seen.has(href)) continue;
      seen.add(href);

      const listId = href.split('/i/lists/')[1];
      const name = await link.innerText().catch(() => '');
      const firstLine = name.split('\n')[0].trim();

      if (firstLine && listId) {
        console.log(`${firstLine} (ID: ${listId})`);
      }
    }

  } catch (error) {
    console.error('Error reading lists:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function reply(urlOrId: string, text: string) {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    if (!await ensureLoggedIn(session.page)) {
      console.error('Not logged in.');
      process.exit(1);
    }

    const url = resolveTweetUrl(urlOrId);
    if (!url) {
      console.error('Invalid tweet URL or ID');
      return;
    }

    console.log(`Replying to: ${url}`);
    await session.page.goto(url, { waitUntil: 'domcontentloaded' });
    await session.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

    // Click the reply action button on the main tweet to open compose modal
    const replyBtn = session.page.locator('[data-testid="reply"]').first();
    await replyBtn.waitFor({ timeout: 5000 });
    await replyBtn.click();

    // Fill in the reply text in the compose modal
    const inputSelector = '[data-testid="tweetTextarea_0"]';
    await session.page.waitForSelector(inputSelector, { timeout: 5000 });
    await session.page.click(inputSelector);
    await session.page.keyboard.type(text);

    // Submit the reply
    const submitBtn = session.page.locator('[data-testid="tweetButton"]');
    await submitBtn.waitFor({ timeout: 5000 });
    await submitBtn.click();

    try {
      await session.page.waitForSelector('[data-testid="toast"]', { timeout: 5000 });
      console.log('Reply posted successfully!');
    } catch {
      console.log('Reply posted.');
    }

  } catch (error) {
    console.error('Error posting reply:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function like(urlOrId: string) {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    const url = resolveTweetUrl(urlOrId);
    if (!url) {
      console.error('Invalid tweet URL or ID');
      return;
    }

    console.log(`Liking tweet: ${url}`);
    await session.page.goto(url, { waitUntil: 'domcontentloaded' });
    await session.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

    // Check if already liked (unlike button present)
    const unlikeBtn = session.page.locator('[data-testid="unlike"]').first();
    if (await unlikeBtn.count() > 0) {
      console.log('Tweet already liked.');
      return;
    }

    const likeBtn = session.page.locator('[data-testid="like"]').first();
    await likeBtn.waitFor({ timeout: 5000 });
    await likeBtn.click();
    console.log('Tweet liked!');

  } catch (error) {
    console.error('Error liking tweet:', error);
  } finally {
    if (session) await closeSession(session);
  }
}

export async function retweet(urlOrId: string) {
  let session: BrowserSession | undefined;
  try {
    session = await startSession(true);
    const url = resolveTweetUrl(urlOrId);
    if (!url) {
      console.error('Invalid tweet URL or ID');
      return;
    }

    console.log(`Retweeting: ${url}`);
    await session.page.goto(url, { waitUntil: 'domcontentloaded' });
    await session.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

    // Check if already retweeted (unretweet button present)
    const unretweetBtn = session.page.locator('[data-testid="unretweet"]').first();
    if (await unretweetBtn.count() > 0) {
      console.log('Tweet already retweeted.');
      return;
    }

    // Click the retweet button
    const retweetBtn = session.page.locator('[data-testid="retweet"]').first();
    await retweetBtn.waitFor({ timeout: 5000 });
    await retweetBtn.click();

    // Confirm repost in the menu
    const confirmBtn = session.page.locator('[data-testid="retweetConfirm"]');
    await confirmBtn.waitFor({ timeout: 5000 });
    await confirmBtn.click();
    console.log('Retweeted!');

  } catch (error) {
    console.error('Error retweeting:', error);
  } finally {
    if (session) await closeSession(session);
  }
}
