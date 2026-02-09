import fs from "node:fs";
import type { Locator, Page } from "playwright";
import {
	collectLists,
	collectNewsItems,
	collectTweets,
	collectUsers,
} from "../browser/scrape.js";
import { BrowserSessionManager } from "../browser/session-manager.js";
import {
	asProfileUrl,
	normalizeHandle,
	resolveListUrl,
	resolveTweetUrl,
} from "../lib/identifiers.js";
import type {
	AuthStatus,
	BatchMutationResult,
	BookmarkOptions,
	CollectionResult,
	FollowListOptions,
	GlobalOptions,
	ListInfo,
	ListOptions,
	MentionOptions,
	MutationResult,
	NewsItem,
	NewsOptions,
	PaginationOptions,
	QueryIdsResult,
	TimelineOptions,
	Tweet,
	UserProfile,
	UserSummary,
} from "../lib/types.js";
import type { FrigatebirdClient } from "./client.js";

function ok(message: string): MutationResult {
	return { ok: true, message };
}

function fail(message: string): MutationResult {
	return { ok: false, message };
}

function parseListStats(text: string): {
	memberCount?: number;
	subscriberCount?: number;
} {
	const members = text.match(/([\d,]+)\s+members?/i);
	const subscribers = text.match(/([\d,]+)\s+subscribers?/i);

	const parseNumber = (value?: string) =>
		value ? Number.parseInt(value.replace(/,/g, ""), 10) : undefined;

	return {
		memberCount: parseNumber(members?.[1]),
		subscriberCount: parseNumber(subscribers?.[1]),
	};
}

interface MediaSpec {
	path: string;
	mime: string;
	alt?: string;
}

function detectMimeFromPath(filePath: string): string | null {
	const lower = filePath.toLowerCase();
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".png")) return "image/png";
	if (lower.endsWith(".webp")) return "image/webp";
	if (lower.endsWith(".gif")) return "image/gif";
	if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
	if (lower.endsWith(".mov")) return "video/quicktime";
	return null;
}

function resolveMediaSpecs(media: string[], alt: string[]): MediaSpec[] {
	const specs: MediaSpec[] = [];
	for (const [index, mediaPath] of media.entries()) {
		if (!fs.existsSync(mediaPath)) {
			throw new Error(`Media file not found: ${mediaPath}`);
		}
		const mime = detectMimeFromPath(mediaPath);
		if (!mime) {
			throw new Error(
				`Unsupported media type for ${mediaPath}. Supported: jpg, jpeg, png, webp, gif, mp4, mov`,
			);
		}
		specs.push({ path: mediaPath, mime, alt: alt[index] });
	}

	if (specs.length > 4) {
		throw new Error("Maximum 4 media attachments are supported.");
	}

	const videos = specs.filter((spec) => spec.mime.startsWith("video/"));
	if (videos.length > 1) {
		throw new Error("Only one video can be attached.");
	}
	if (videos.length === 1 && specs.length > 1) {
		throw new Error("Video cannot be combined with other media attachments.");
	}

	return specs;
}

const HEADLESS_RETRY_MARKER = "[FRIGATEBIRD_HEADLESS_RETRY]";

function markHeadlessRetry(message: string): Error {
	return new Error(`${HEADLESS_RETRY_MARKER} ${message}`);
}

export class PlaywrightXClient implements FrigatebirdClient {
	private readonly baseUrl: string;
	private currentSessionHeadless: boolean | null = null;

	constructor(
		private readonly options: GlobalOptions,
		private readonly sessions: BrowserSessionManager = new BrowserSessionManager(),
	) {
		this.baseUrl = (options.baseUrl ?? "https://x.com").replace(/\/+$/, "");
	}

	private absolute(pathname: string): string {
		return new URL(pathname, `${this.baseUrl}/`).toString();
	}

	private mergedOptions(headlessOverride?: boolean): GlobalOptions {
		if (headlessOverride === undefined) return this.options;
		return { ...this.options, headless: headlessOverride };
	}

	private isHeadlessRetryError(error: unknown): boolean {
		const message = error instanceof Error ? error.message : String(error);
		return message.includes(HEADLESS_RETRY_MARKER);
	}

	private normalizeError(error: unknown): Error {
		if (error instanceof Error) {
			if (this.isHeadlessRetryError(error)) {
				return new Error(
					error.message.replace(`${HEADLESS_RETRY_MARKER} `, "").trim(),
				);
			}
			return error;
		}
		return new Error(String(error));
	}

	private async withPage<T>(
		task: (page: Page) => Promise<T>,
		headlessOverride?: boolean,
	): Promise<T> {
		const effectiveOptions = this.mergedOptions(headlessOverride);
		const runWithMode = async (headless: boolean) => {
			return this.sessions.withSession(
				{ ...effectiveOptions, headless },
				async ({ page }) => {
					const previous = this.currentSessionHeadless;
					this.currentSessionHeadless = headless;
					try {
						return await task(page);
					} finally {
						this.currentSessionHeadless = previous;
					}
				},
			);
		};

		try {
			return await runWithMode(effectiveOptions.headless);
		} catch (error) {
			if (
				effectiveOptions.headless &&
				headlessOverride === undefined &&
				this.isHeadlessRetryError(error)
			) {
				try {
					return await runWithMode(false);
				} catch (secondError) {
					throw this.normalizeError(secondError);
				}
			}

			throw this.normalizeError(error);
		}
	}

	private async ensureAuth(page: Page): Promise<void> {
		const loggedIn = await this.sessions.ensureLoggedIn(page, this.baseUrl);
		if (!loggedIn) {
			throw new Error(
				"Not logged in. Run `frigatebird refresh` and ensure you are signed into X in a browser profile.",
			);
		}
	}

	private async waitForTweetsOptional(
		page: Page,
		timeout = 5000,
	): Promise<void> {
		await page
			.waitForSelector('[data-testid="tweet"]', { timeout })
			.catch(() => {});
	}

	private async openTweet(page: Page, tweetRef: string): Promise<string> {
		const url = resolveTweetUrl(tweetRef, this.baseUrl);
		if (!url) {
			throw new Error(
				"Invalid tweet reference. Provide a tweet URL or numeric tweet ID.",
			);
		}

		await page.goto(url, { waitUntil: "domcontentloaded" });
		try {
			await page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });
		} catch (error) {
			const isHeadlessSession =
				this.currentSessionHeadless ?? this.options.headless;
			const hasTweet =
				(await page
					.locator('[data-testid="tweet"]')
					.count()
					.catch(() => 0)) > 0;
			const errorPageVisible =
				(await page
					.locator("text=Something went wrong, but don’t fret")
					.first()
					.isVisible()
					.catch(() => false)) ||
				(await page
					.locator("text=Something went wrong, but don't fret")
					.first()
					.isVisible()
					.catch(() => false)) ||
				(await page
					.locator("text=Something went wrong")
					.first()
					.isVisible()
					.catch(() => false));

			if (!hasTweet && errorPageVisible && isHeadlessSession) {
				throw markHeadlessRetry(
					"X returned a temporary error page while loading the tweet in headless mode. Retrying in headed mode.",
				);
			}

			if (!hasTweet && isHeadlessSession) {
				throw markHeadlessRetry(
					"Tweet content did not render in headless mode. Retrying in headed mode.",
				);
			}

			if (!hasTweet) {
				throw new Error(
					"Tweet content did not render. X may be returning a transient error page or blocking this route right now.",
				);
			}

			throw error;
		}
		return url;
	}

	private async openList(page: Page, listRef: string): Promise<string> {
		const url = resolveListUrl(listRef, this.baseUrl);
		if (!url) {
			throw new Error(
				"Invalid list reference. Provide a list URL or numeric list ID.",
			);
		}

		await page.goto(url, { waitUntil: "domcontentloaded" });
		await this.waitForTweetsOptional(page);
		return url;
	}

	private async scrapeSingleTweet(page: Page): Promise<Tweet> {
		const result = await collectTweets(page, {
			count: 1,
			all: false,
			delayMs: 200,
			maxPages: 1,
		});
		const tweet = result.items[0];
		if (!tweet) {
			throw new Error(
				"Tweet content not found. X may have changed markup or access is restricted.",
			);
		}
		return tweet;
	}

	private async goToProfileLikes(page: Page): Promise<void> {
		await this.ensureAuth(page);
		const me = await this.sessions.whoAmI(page);
		if (!me.handle) throw new Error("Unable to detect current profile handle.");
		await page.goto(this.absolute(`/${me.handle}/likes`), {
			waitUntil: "domcontentloaded",
		});
		await this.waitForTweetsOptional(page);
	}

	private resolveGlobalMediaSpecs(): MediaSpec[] {
		return resolveMediaSpecs(this.options.media, this.options.alt);
	}

	private async retryWithBackoff<T>(
		task: () => Promise<T>,
		attempts = 3,
		baseDelayMs = 300,
	): Promise<T> {
		let lastError: unknown;

		for (let attempt = 1; attempt <= attempts; attempt += 1) {
			try {
				return await task();
			} catch (error) {
				lastError = error;
				if (attempt < attempts) {
					await new Promise((resolve) =>
						setTimeout(resolve, baseDelayMs * attempt),
					);
				}
			}
		}

		throw lastError instanceof Error ? lastError : new Error(String(lastError));
	}

	private async firstVisibleLocator(
		page: Page,
		selectors: string[],
		timeoutMs = 5000,
		pollMs = 200,
	): Promise<Locator | null> {
		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			for (const selector of selectors) {
				const locator = page.locator(selector).first();
				if (await locator.isVisible().catch(() => false)) {
					return locator;
				}
			}
			await page.waitForTimeout(pollMs);
		}

		return null;
	}

	private isPointerInterceptionError(error: unknown): boolean {
		const message = error instanceof Error ? error.message : String(error);
		return (
			message.includes("intercepts pointer events") ||
			(message.includes("Timeout") && message.includes("locator.click"))
		);
	}

	private async dismissBlockingLayers(page: Page): Promise<void> {
		const mask = page.locator('[data-testid="twc-cc-mask"]').first();
		if (!(await mask.isVisible().catch(() => false))) {
			return;
		}

		const consentSelectors = [
			'[role="dialog"] [role="button"]:has-text("Accept all cookies")',
			'[role="dialog"] [role="button"]:has-text("Accept all")',
			'[role="button"]:has-text("Accept all cookies")',
			'[role="button"]:has-text("Accept all")',
			'[role="button"]:has-text("Agree and continue")',
			'[role="button"]:has-text("Close")',
		];

		for (const selector of consentSelectors) {
			const button = page.locator(selector).first();
			if (!(await button.isVisible().catch(() => false))) continue;
			await button.click().catch(() => {});
			await page.waitForTimeout(120);
		}

		if (await mask.isVisible().catch(() => false)) {
			await page.keyboard.press("Escape").catch(() => {});
			await page.waitForTimeout(120);
		}

		if (await mask.isVisible().catch(() => false)) {
			await mask.click({ force: true }).catch(() => {});
		}

		const deadline = Date.now() + 3000;
		while (Date.now() < deadline) {
			if (!(await mask.isVisible().catch(() => false))) break;
			await page.waitForTimeout(120);
		}
	}

	private async clickFirstVisible(
		page: Page,
		selectors: string[],
		timeoutMs = 5000,
	): Promise<boolean> {
		const locator = await this.firstVisibleLocator(page, selectors, timeoutMs);
		if (!locator) return false;
		const clickTimeout = Math.max(800, Math.min(timeoutMs, 2500));

		for (let attempt = 1; attempt <= 3; attempt += 1) {
			await this.dismissBlockingLayers(page);
			try {
				await locator.click({ timeout: clickTimeout });
				return true;
			} catch (error) {
				if (!this.isPointerInterceptionError(error) || attempt === 3) {
					throw error;
				}

				const forced = await locator
					.click({ force: true, timeout: 2000 })
					.then(() => true)
					.catch(() => false);
				if (forced) {
					return true;
				}

				await page.waitForTimeout(200 * attempt);
			}
		}

		return false;
	}

	private async waitForComposer(page: Page, timeoutMs = 15000): Promise<void> {
		const composerSelectors = [
			'[data-testid="tweetTextarea_0"]',
			'div[role="textbox"][data-testid="tweetTextarea_0"]',
			'div[role="textbox"][aria-label*="Post text"]',
			'div[role="textbox"][aria-label*="What is happening"]',
			'div[role="textbox"][aria-label*="What’s happening"]',
		];
		const composer = await this.firstVisibleLocator(
			page,
			composerSelectors,
			timeoutMs,
		);

		if (!composer) {
			throw new Error(
				"Composer text area not found. X may have changed selectors.",
			);
		}
	}

	private async recoverComposerFromHome(
		page: Page,
		timeoutMs = 12000,
	): Promise<boolean> {
		await page.goto(this.absolute("/home"), {
			waitUntil: "domcontentloaded",
		});
		await this.dismissBlockingLayers(page);

		const composeSelectors = [
			'[data-testid="SideNav_NewTweet_Button"]',
			'[data-testid="FloatingActionButton_Tweet"]',
			'a[href="/compose/post"]',
			'[role="button"][aria-label*="Post"]',
		];
		await this.clickFirstVisible(page, composeSelectors, 4000).catch(
			() => false,
		);

		try {
			await this.waitForComposer(page, timeoutMs);
			return true;
		} catch {
			return false;
		}
	}

	private async fillComposer(page: Page, text: string): Promise<void> {
		const composerSelectors = [
			'[data-testid="tweetTextarea_0"]',
			'div[role="textbox"][data-testid="tweetTextarea_0"]',
			'div[role="textbox"][aria-label*="Post text"]',
			'div[role="textbox"][aria-label*="What is happening"]',
			'div[role="textbox"][aria-label*="What’s happening"]',
		];
		const candidateLocators: Locator[] = [];

		for (const selector of composerSelectors) {
			const locators = page.locator(selector);
			const count = await locators.count().catch(() => 0);
			for (let index = 0; index < count; index += 1) {
				const candidate = locators.nth(index);
				if (await candidate.isVisible().catch(() => false)) {
					candidateLocators.push(candidate);
				}
			}
		}

		if (candidateLocators.length === 0) {
			throw new Error("Composer text area not found.");
		}

		const submitEnabledSelectors = [
			'[data-testid="tweetButton"]:not([aria-disabled="true"])',
			'[data-testid="tweetButtonInline"]:not([aria-disabled="true"])',
			'[role="button"]:has-text("Post"):not([aria-disabled="true"])',
			'[role="button"]:has-text("Reply"):not([aria-disabled="true"])',
		];

		const isSubmitEnabled = async () => {
			const enabled = await this.firstVisibleLocator(
				page,
				submitEnabledSelectors,
				800,
				100,
			);
			return Boolean(enabled);
		};

		for (const composer of candidateLocators) {
			await composer.click().catch(() => {});
			await composer.fill(text).catch(() => {});

			const injected = await composer
				.evaluate((node) => {
					const element = node as HTMLElement & { value?: string };
					return (
						element.innerText ||
						element.textContent ||
						element.value ||
						""
					).trim();
				})
				.catch(() => "");

			if (!injected || injected.length < Math.min(6, text.length)) {
				await page.keyboard.type(text).catch(() => {});
			}

			if (await isSubmitEnabled()) {
				return;
			}
		}
	}

	private async submitComposer(
		page: Page,
		action: "tweet" | "reply",
	): Promise<void> {
		await page.keyboard.press("Meta+Enter").catch(async () => {
			await page.keyboard.press("Control+Enter").catch(() => {});
		});
		await page.waitForTimeout(500);

		const sent = await this.firstVisibleLocator(
			page,
			[
				'[role="alert"]:has-text("Your post was sent")',
				'[role="alert"]:has-text("post was sent")',
				'[role="alert"]:has-text("sent")',
				'[data-testid="toast"]',
			],
			1800,
			100,
		);
		if (sent) {
			return;
		}

		const clicked = await this.clickFirstVisible(page, [
			'[data-testid="tweetButton"]:not([aria-disabled="true"])',
			'[data-testid="tweetButtonInline"]:not([aria-disabled="true"])',
			'button[data-testid="tweetButton"]:not([aria-disabled="true"])',
			'[role="button"]:has-text("Post"):not([aria-disabled="true"])',
			'[role="button"]:has-text("Reply"):not([aria-disabled="true"])',
		]);

		if (!clicked) {
			throw new Error(
				`Could not locate ${action} submit button. X may have changed selectors.`,
			);
		}
	}

	private async attachMedia(
		page: Page,
		mediaSpecs: MediaSpec[],
	): Promise<void> {
		if (mediaSpecs.length === 0) return;

		const fileSelectors = [
			'input[data-testid="fileInput"]',
			'input[type="file"]',
		];
		let attached = false;
		for (const selector of fileSelectors) {
			const input = page.locator(selector).first();
			if ((await input.count()) === 0) continue;

			await input.setInputFiles(mediaSpecs.map((spec) => spec.path));
			attached = true;
			break;
		}

		if (!attached) {
			throw new Error(
				"Could not find media upload input in the composer. X may have changed selectors.",
			);
		}

		await page.waitForTimeout(1500);
		await this.applyAltText(page, mediaSpecs);
	}

	private async applyAltText(
		page: Page,
		mediaSpecs: MediaSpec[],
	): Promise<void> {
		const altSelectors = [
			'[data-testid="altTextButton"]',
			'[data-testid="mediaAltTextButton"]',
			'button[aria-label*="Add description"]',
			'button[aria-label*="Edit description"]',
		];
		const inputSelectors = [
			'[data-testid="altTextTextarea"]',
			'textarea[aria-label*="description"]',
			'textarea[aria-label*="Description"]',
			'div[role="textbox"][aria-label*="description"]',
			'div[role="textbox"][aria-label*="Description"]',
		];
		const saveSelectors = [
			'[data-testid="saveAltText"]',
			'[data-testid="confirmAltText"]',
			'[role="button"]:has-text("Done")',
			'[role="button"]:has-text("Save")',
		];

		for (const [index, spec] of mediaSpecs.entries()) {
			if (!spec.alt) continue;

			let opened = false;
			for (const selector of altSelectors) {
				const button = page.locator(selector).nth(index);
				if (await button.isVisible().catch(() => false)) {
					await button.click();
					opened = true;
					break;
				}
			}
			if (!opened) continue;

			let filled = false;
			for (const selector of inputSelectors) {
				const input = page.locator(selector).first();
				if (await input.isVisible().catch(() => false)) {
					await input.fill(spec.alt);
					filled = true;
					break;
				}
			}
			if (!filled) {
				await page.keyboard.press("Escape").catch(() => {});
				continue;
			}

			let saved = false;
			for (const selector of saveSelectors) {
				const saveButton = page.locator(selector).first();
				if (await saveButton.isVisible().catch(() => false)) {
					await saveButton.click();
					saved = true;
					break;
				}
			}
			if (!saved) {
				await page.keyboard.press("Escape").catch(() => {});
			}

			await page.waitForTimeout(250);
		}
	}

	private filterThreadForBookmark(
		threadItems: Tweet[],
		bookmark: Tweet,
		options: BookmarkOptions,
	): Tweet[] {
		const bookmarkIndex = threadItems.findIndex(
			(item) => item.id === bookmark.id,
		);
		if (bookmarkIndex < 0) return [bookmark];

		const isRoot = bookmarkIndex === 0;
		if (options.expandRootOnly && !isRoot) {
			return [bookmark];
		}

		let selected = [...threadItems];

		if (options.authorOnly && bookmark.authorHandle) {
			selected = selected.filter(
				(item) => item.authorHandle === bookmark.authorHandle,
			);
		}

		if (options.authorChain && bookmark.authorHandle) {
			const chain: Tweet[] = [];
			for (let index = bookmarkIndex; index >= 0; index -= 1) {
				const item = threadItems[index];
				if (item.authorHandle !== bookmark.authorHandle) break;
				chain.unshift(item);
			}
			for (
				let index = bookmarkIndex + 1;
				index < threadItems.length;
				index += 1
			) {
				const item = threadItems[index];
				if (item.authorHandle !== bookmark.authorHandle) break;
				chain.push(item);
			}
			selected = chain;
		}

		const selectedById = new Map<string, Tweet>();
		for (const item of selected) {
			selectedById.set(item.id, item);
		}

		selectedById.set(bookmark.id, bookmark);

		if (options.includeParent && bookmarkIndex > 0) {
			const parent = threadItems[bookmarkIndex - 1];
			selectedById.set(parent.id, parent);
		}

		let result = Array.from(selectedById.values());
		if (options.threadMeta) {
			result = result.map((item) => {
				const index = threadItems.findIndex(
					(threadItem) => threadItem.id === item.id,
				);
				return {
					...item,
					isThread: true,
					threadPosition: index >= 0 ? index : undefined,
					isBookmarkedTweet: item.id === bookmark.id,
				};
			});
		}

		return result;
	}

	private async navigateFollowTab(
		page: Page,
		kind: "followers" | "following",
		userId?: string,
	): Promise<void> {
		await this.ensureAuth(page);

		if (userId) {
			await page.goto(this.absolute(`/i/user/${userId}/${kind}`), {
				waitUntil: "domcontentloaded",
			});
		} else {
			const me = await this.sessions.whoAmI(page);
			if (!me.handle) {
				throw new Error(
					"Unable to resolve current user handle for follower lookup.",
				);
			}
			await page.goto(this.absolute(`/${me.handle}/${kind}`), {
				waitUntil: "domcontentloaded",
			});
		}

		await page
			.waitForSelector(
				'[data-testid="cellInnerDiv"], [data-testid="UserCell"]',
				{
					timeout: 5000,
				},
			)
			.catch(() => {});
	}

	private async openListMembershipDialog(
		page: Page,
		handle: string,
	): Promise<string> {
		const normalized = normalizeHandle(handle);
		await page.goto(this.absolute(`/${normalized}`), {
			waitUntil: "domcontentloaded",
		});

		const listMenuSelectors = [
			'[role="menuitem"]:has-text("Add/remove from Lists")',
			'[role="menuitem"]:has-text("Add/remove")',
			'[role="menuitem"]:has-text("Lists")',
			'button:has-text("Add/remove from Lists")',
			'button:has-text("Add/remove")',
			'a:has-text("Add/remove from Lists")',
		];

		const openProfileMenuWithButton = async (
			button: Locator,
		): Promise<boolean> => {
			await button.click();
			await page.waitForTimeout(250);

			const menuItem = await this.firstVisibleLocator(
				page,
				listMenuSelectors,
				1200,
				100,
			);
			if (menuItem) return true;

			await page.keyboard.press("Escape").catch(() => {});
			await page.waitForTimeout(120);
			return false;
		};

		// Prefer the dedicated profile actions button when available.
		const profileActions = await this.firstVisibleLocator(
			page,
			['main [data-testid="userActions"]', '[data-testid="userActions"]'],
			15000,
		);
		let openedListMenu = false;
		if (profileActions) {
			openedListMenu = await openProfileMenuWithButton(profileActions);
		}

		// Fallback for UI variants where userActions is late/missing.
		if (!openedListMenu) {
			const fallbackButtons = page.locator(
				'main button[aria-haspopup="menu"][aria-label*="More"]',
			);
			const fallbackCount = await fallbackButtons.count();
			const scanLimit = Math.min(fallbackCount, 8);

			for (let index = 0; index < scanLimit; index += 1) {
				const button = fallbackButtons.nth(index);
				if (!(await button.isVisible().catch(() => false))) continue;
				if (await openProfileMenuWithButton(button)) {
					openedListMenu = true;
					break;
				}
			}
		}

		if (!openedListMenu) {
			throw new Error(
				`Could not locate profile list actions for @${normalized}. X may have changed selectors.`,
			);
		}

		const menuClicked = await this.clickFirstVisible(
			page,
			listMenuSelectors,
			5000,
		);
		if (!menuClicked) {
			throw new Error(
				`Could not locate "Add/remove from Lists" menu item for @${normalized}.`,
			);
		}

		const dialogSelector = '[role="dialog"]:has([role="checkbox"]):visible';
		await page.waitForSelector(dialogSelector, { timeout: 15000 });
		return dialogSelector;
	}

	private async setListMembership(
		page: Page,
		listName: string,
		handle: string,
		shouldBeMember: boolean,
	): Promise<{
		status: "added" | "already" | "removed" | "error";
		error?: string;
	}> {
		try {
			const outcome = await this.retryWithBackoff(async () => {
				const dialogSelector = await this.openListMembershipDialog(
					page,
					handle,
				);
				const listCheckboxes = page.locator(
					`${dialogSelector} [role="checkbox"]`,
				);
				const count = await listCheckboxes.count();
				if (count === 0) {
					throw new Error("List dialog opened without visible checkboxes.");
				}

				let checkbox: Locator | null = null;
				const desiredName = listName.trim().toLowerCase();
				for (let index = 0; index < count; index += 1) {
					const candidate = listCheckboxes.nth(index);
					const text = await candidate.innerText().catch(() => "");
					const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
					if (normalized === desiredName || normalized.includes(desiredName)) {
						checkbox = candidate;
						break;
					}
				}

				if (!checkbox) {
					return {
						status: "error" as const,
						error: `List "${listName}" not found.`,
					};
				}

				const checked =
					(await checkbox.getAttribute("aria-checked")) === "true";
				const alreadyDesired = shouldBeMember ? checked : !checked;

				if (alreadyDesired) {
					await page.keyboard.press("Escape").catch(() => {});
					return { status: "already" as const };
				}

				await checkbox.click();

				const saveClicked = await this.clickFirstVisible(page, [
					`${dialogSelector} [role="button"]:has-text("Save")`,
					`${dialogSelector} [data-testid="confirmationSheetConfirm"]`,
					'[role="button"]:has-text("Save")',
				]);
				if (!saveClicked) {
					await page.keyboard.press("Escape").catch(() => {});
				}

				return { status: shouldBeMember ? "added" : "removed" } as const;
			});

			return outcome;
		} catch (error) {
			return { status: "error", error: String(error) };
		}
	}

	async check(): Promise<AuthStatus> {
		const probe = await this.sessions.createCookieProbe(this.options);
		const loggedIn = await this.withPage(async (page) =>
			this.sessions.ensureLoggedIn(page, this.baseUrl),
		);

		return {
			loggedIn,
			source: probe.source,
			hasAuthToken: probe.hasAuthToken,
			hasCt0: probe.hasCt0,
			authFile: this.sessions.getAuthStore().authFile,
			diagnostics: probe.diagnostics,
		};
	}

	async whoami(): Promise<UserProfile> {
		return this.withPage(async (page) => {
			await this.ensureAuth(page);
			const me = await this.sessions.whoAmI(page);

			return {
				name: me.name,
				handle: me.handle,
			};
		});
	}

	async tweet(
		text: string,
		media: string[] = [],
		alt: string[] = [],
	): Promise<MutationResult> {
		let mediaSpecs: MediaSpec[] = [];
		try {
			mediaSpecs =
				media.length > 0 || alt.length > 0
					? resolveMediaSpecs(media, alt)
					: this.resolveGlobalMediaSpecs();
		} catch (error) {
			return fail(error instanceof Error ? error.message : String(error));
		}

		return this.withPage(async (page) => {
			await this.ensureAuth(page);

			await this.retryWithBackoff(async () => {
				await page.goto(this.absolute("/compose/post"), {
					waitUntil: "domcontentloaded",
				});
				await this.dismissBlockingLayers(page);
				let composerReady = true;
				try {
					await this.waitForComposer(page, 12000);
				} catch {
					composerReady = await this.recoverComposerFromHome(page, 12000);
				}

				if (!composerReady) {
					throw new Error(
						"Composer text area not found. X may have changed selectors.",
					);
				}

				await this.fillComposer(page, text);
				await this.attachMedia(page, mediaSpecs);
				await this.submitComposer(page, "tweet");
			}, 2);

			await page.waitForTimeout(1400);
			return ok("Tweet posted.");
		});
	}

	async publishArticle(title: string, body: string): Promise<MutationResult> {
		const cleanTitle = title.trim();
		const cleanBody = body.trim();
		if (!cleanTitle) {
			return fail("Article title cannot be empty.");
		}
		if (!cleanBody) {
			return fail("Article body cannot be empty.");
		}

		return this.withPage(async (page) => {
			await this.ensureAuth(page);

			const composePaths = [
				"/compose/articles",
				"/i/articles/new",
				"/compose/article",
				"/write",
				"/i/write",
				"/i/notes/new",
				"/compose/post",
			];
			const titleSelectors = [
				'input[data-testid="articleTitleInput"]',
				'textarea[data-testid="articleTitleInput"]',
				'[data-testid="article-editor-title"] [contenteditable="true"]',
				'[role="textbox"][aria-label*="Title"]',
				'input[placeholder*="Title"]',
				'textarea[placeholder*="Title"]',
				'input[placeholder*="title" i]',
				'textarea[placeholder*="title" i]',
				'textarea[placeholder*="Add a title"]',
				'[contenteditable="true"][aria-label*="Title"]',
			];
			const bodySelectors = [
				'[data-testid="articleBodyInput"]',
				'[data-testid="article-editor"] [contenteditable="true"]',
				'[data-testid="composer"][role="textbox"]',
				'[data-testid="composer"]',
				'.ProseMirror[contenteditable="true"]',
				'[role="textbox"][aria-label*="Write"]',
				'[contenteditable="true"][aria-label*="Write"]',
				'[role="textbox"][aria-label*="Body"]',
				'textarea[placeholder*="Write"]',
			];
			const combinedComposerSelectors = [
				'[data-testid="composer"][role="textbox"]',
				'[data-testid="composer"]',
				'[contenteditable="true"][data-testid="composer"]',
			];
			const writeSelectors = [
				'[data-testid="empty_state_button_text"]:has-text("Write")',
				'[role="button"]:has-text("Write")',
				'[role="link"]:has-text("Write")',
				'[role="button"]:has-text("New article")',
			];

			let titleField: Locator | null = null;
			let bodyField: Locator | null = null;
			let combinedComposer: Locator | null = null;

			for (const path of composePaths) {
				await page
					.goto(this.absolute(path), { waitUntil: "domcontentloaded" })
					.catch(() => {});
				await this.dismissBlockingLayers(page);

				await this.clickFirstVisible(
					page,
					[
						'[role="tab"]:has-text("Article")',
						'[role="button"]:has-text("Write article")',
						'[data-testid="articleComposerButton"]',
						'a[href*="/i/articles/new"]',
						'a[href*="/compose/articles"]',
						'[role="link"]:has-text("Articles")',
					],
					1500,
				).catch(() => false);

				await this.clickFirstVisible(page, writeSelectors, 1500).catch(
					() => false,
				);

				titleField = await this.firstVisibleLocator(
					page,
					titleSelectors,
					3500,
					120,
				);
				bodyField = await this.firstVisibleLocator(
					page,
					bodySelectors,
					3500,
					120,
				);
				combinedComposer = await this.firstVisibleLocator(
					page,
					combinedComposerSelectors,
					2500,
					120,
				);

				if ((titleField && bodyField) || combinedComposer) {
					break;
				}
			}

			if (!titleField || !bodyField) {
				if (combinedComposer) {
					await combinedComposer.click().catch(() => {});
					await combinedComposer.fill(`${cleanTitle}\n\n${cleanBody}`);

					const inserted = await combinedComposer
						.evaluate((node) => {
							const element = node as HTMLElement & { value?: string };
							return (
								element.innerText ||
								element.textContent ||
								element.value ||
								""
							).trim();
						})
						.catch(() => "");

					if (
						inserted.length < Math.min(8, cleanTitle.length) ||
						!inserted
							.toLowerCase()
							.includes(cleanBody.slice(0, 8).toLowerCase())
					) {
						await page.keyboard
							.type(`${cleanTitle}\n\n${cleanBody}`)
							.catch(() => {});
					}
				} else {
					return fail(
						"Could not locate article composer. Articles may be unavailable for this account or X changed selectors.",
					);
				}
			} else {
				await titleField.click().catch(() => {});
				await titleField.fill(cleanTitle);

				await bodyField.click().catch(() => {});
				await bodyField.fill(cleanBody);
			}

			const published = await this.clickFirstVisible(
				page,
				[
					'[data-testid="articlePublishButton"]:not([aria-disabled="true"])',
					'[data-testid="publishButton"]:not([aria-disabled="true"])',
					'[role="button"]:has-text("Publish"):not([aria-disabled="true"]):not([disabled])',
					'[role="button"]:has-text("Post"):not([aria-disabled="true"]):not([disabled])',
				],
				12000,
			).catch(() => false);
			if (!published) {
				return fail("Could not locate article publish button.");
			}

			await this.clickFirstVisible(
				page,
				[
					'[data-testid="confirmationSheetConfirm"]',
					'[role="button"]:has-text("Publish")',
					'[role="button"]:has-text("Post")',
				],
				3000,
			).catch(() => false);
			await page.waitForTimeout(1000);

			return ok("Article published.");
		});
	}

	async reply(tweetRef: string, text: string): Promise<MutationResult> {
		let mediaSpecs: MediaSpec[] = [];
		try {
			mediaSpecs = this.resolveGlobalMediaSpecs();
		} catch (error) {
			return fail(error instanceof Error ? error.message : String(error));
		}

		return this.withPage(async (page) => {
			await this.ensureAuth(page);
			await this.openTweet(page, tweetRef);

			await this.retryWithBackoff(async () => {
				const replied = await this.clickFirstVisible(page, [
					'[data-testid="reply"]',
					'button[aria-label*="Reply"]',
				]);
				if (!replied) {
					throw new Error("Reply button not found.");
				}

				await this.waitForComposer(page, 10000);
				await this.fillComposer(page, text);
				await this.attachMedia(page, mediaSpecs);
				await this.submitComposer(page, "reply");
			}, 2);

			await page.waitForTimeout(1200);
			return ok("Reply posted.");
		});
	}

	async like(tweetRef: string): Promise<MutationResult> {
		return this.withPage(async (page) => {
			await this.ensureAuth(page);
			await this.openTweet(page, tweetRef);

			const unlike = page
				.locator(
					'[data-testid="unlike"], button[aria-label*="Unlike"], div[aria-label*="Unlike"]',
				)
				.first();
			if (await unlike.isVisible().catch(() => false)) {
				return ok("Tweet already liked.");
			}

			const likeButton = page
				.locator(
					'[data-testid="like"], button[aria-label*="Like"], div[aria-label*="Like"]',
				)
				.first();
			if (!(await likeButton.isVisible().catch(() => false))) {
				return fail("Could not locate like button.");
			}

			await likeButton.click();
			return ok("Tweet liked.");
		});
	}

	async retweet(tweetRef: string): Promise<MutationResult> {
		return this.withPage(async (page) => {
			await this.ensureAuth(page);
			await this.openTweet(page, tweetRef);

			const undoSelectors = [
				'[data-testid="unretweet"]',
				'button[aria-label*="Undo repost"]',
				'div[aria-label*="Undo repost"]',
			];
			if (await this.firstVisibleLocator(page, undoSelectors, 1200, 150)) {
				return ok("Tweet already reposted.");
			}

			const repostClicked = await this.clickFirstVisible(page, [
				'[data-testid="retweet"]',
				'button[aria-label*="Repost"]',
				'div[aria-label*="Repost"]',
			]).catch(() => false);
			if (!repostClicked) {
				return fail("Could not locate repost button.");
			}

			await page.waitForTimeout(250);
			const confirmClicked = await this.clickFirstVisible(
				page,
				[
					'[data-testid="retweetConfirm"]',
					'[role="menuitem"]:has-text("Repost")',
					'[role="dialog"] [role="button"]:has-text("Repost")',
				],
				2500,
			).catch(() => false);

			const nowReposted = await this.firstVisibleLocator(
				page,
				undoSelectors,
				5000,
				150,
			);
			if (nowReposted || confirmClicked) {
				return ok("Tweet reposted.");
			}

			return fail(
				"Repost action did not complete. X may require additional confirmation.",
			);
		});
	}

	async read(tweetRef: string): Promise<Tweet> {
		return this.withPage(async (page) => {
			await this.openTweet(page, tweetRef);
			return this.scrapeSingleTweet(page);
		});
	}

	async thread(
		tweetRef: string,
		options: PaginationOptions,
	): Promise<CollectionResult<Tweet>> {
		return this.withPage(async (page) => {
			await this.openTweet(page, tweetRef);
			return collectTweets(page, options);
		});
	}

	async replies(
		tweetRef: string,
		options: PaginationOptions,
	): Promise<CollectionResult<Tweet>> {
		return this.withPage(async (page) => {
			await this.openTweet(page, tweetRef);
			const collected = await collectTweets(page, options);
			const [, ...rest] = collected.items;
			return {
				...collected,
				items: options.all ? rest : rest.slice(0, options.count),
			};
		});
	}

	async search(
		query: string,
		options: PaginationOptions,
	): Promise<CollectionResult<Tweet>> {
		return this.withPage(async (page) => {
			const url = `${this.absolute("/search")}?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
			await page.goto(url, { waitUntil: "domcontentloaded" });
			await this.waitForTweetsOptional(page);
			return collectTweets(page, options);
		});
	}

	async mentions(options: MentionOptions): Promise<CollectionResult<Tweet>> {
		return this.withPage(async (page) => {
			if (options.user) {
				const handle = normalizeHandle(options.user);
				const url = `${this.absolute("/search")}?q=${encodeURIComponent(`@${handle}`)}&src=typed_query&f=live`;
				await page.goto(url, { waitUntil: "domcontentloaded" });
				await this.waitForTweetsOptional(page);
				return collectTweets(page, {
					count: options.count,
					all: false,
					delayMs: 500,
				});
			}

			await this.ensureAuth(page);
			await page.goto(this.absolute("/notifications/mentions"), {
				waitUntil: "domcontentloaded",
			});
			await this.waitForTweetsOptional(page);
			return collectTweets(page, {
				count: options.count,
				all: false,
				delayMs: 500,
			});
		});
	}

	async userTweets(
		handle: string,
		options: PaginationOptions,
	): Promise<CollectionResult<Tweet>> {
		return this.withPage(async (page) => {
			await page.goto(asProfileUrl(handle, this.baseUrl), {
				waitUntil: "domcontentloaded",
			});
			await this.waitForTweetsOptional(page);
			return collectTweets(page, options);
		});
	}

	async home(options: TimelineOptions): Promise<CollectionResult<Tweet>> {
		return this.withPage(async (page) => {
			await this.ensureAuth(page);

			if (options.following) {
				const tab = page.locator('[role="tab"]:has-text("Following")').first();
				if (await tab.isVisible().catch(() => false)) {
					await tab.click();
					await page.waitForTimeout(500);
				}
			}

			await this.waitForTweetsOptional(page);
			return collectTweets(page, options);
		});
	}

	async bookmarks(options: BookmarkOptions): Promise<CollectionResult<Tweet>> {
		return this.withPage(async (page) => {
			await this.ensureAuth(page);
			const target = options.folderId
				? this.absolute(`/i/bookmarks/${options.folderId}`)
				: this.absolute("/i/bookmarks");

			await page.goto(target, { waitUntil: "domcontentloaded" });
			await this.waitForTweetsOptional(page);
			const results = await collectTweets(page, options);

			const requiresExpansion = Boolean(
				options.expandRootOnly ||
					options.authorChain ||
					options.authorOnly ||
					options.fullChainOnly ||
					options.includeAncestorBranches ||
					options.includeParent ||
					options.threadMeta,
			);

			if (requiresExpansion && results.items.length > 0) {
				const expandedById = new Map<string, Tweet>();

				for (const bookmark of results.items) {
					await page.goto(bookmark.url, { waitUntil: "domcontentloaded" });
					await page.waitForSelector('[data-testid="tweet"]', {
						timeout: 15000,
					});

					const threadResult = await collectTweets(page, {
						count: 50,
						all: true,
						maxPages: 3,
						delayMs: 500,
					});
					const filtered = this.filterThreadForBookmark(
						threadResult.items,
						bookmark,
						options,
					);
					for (const tweet of filtered) {
						expandedById.set(tweet.id, tweet);
					}
				}

				results.items = Array.from(expandedById.values());
			}

			if (options.sortChronological) {
				results.items.sort((a, b) =>
					a.createdAt && b.createdAt
						? a.createdAt.localeCompare(b.createdAt)
						: 0,
				);
			}

			const warnings: string[] = [];
			if (options.fullChainOnly || options.includeAncestorBranches) {
				warnings.push(
					"full-chain bookmark modes are approximated from visible thread context in Playwright mode and may differ from GraphQL responses.",
				);
			}

			return {
				...results,
				warnings,
			};
		});
	}

	async unbookmark(tweetRefs: string[]): Promise<BatchMutationResult> {
		const details: BatchMutationResult["details"] = [];

		for (const tweetRef of tweetRefs) {
			const message = await this.withPage(async (page) => {
				try {
					await this.ensureAuth(page);
					await this.openTweet(page, tweetRef);

					const remove = page
						.locator(
							'[data-testid="removeBookmark"], [data-testid="unbookmark"], button[aria-label*="Remove Bookmark"], button[aria-label*="Remove from Bookmarks"]',
						)
						.first();
					if (await remove.isVisible().catch(() => false)) {
						await remove.click();
						return { handle: tweetRef, status: "removed" as const };
					}

					const bookmarkButton = page
						.locator('[data-testid="bookmark"], button[aria-label*="Bookmark"]')
						.first();
					if (await bookmarkButton.isVisible().catch(() => false)) {
						return { handle: tweetRef, status: "already" as const };
					}

					return {
						handle: tweetRef,
						status: "error" as const,
						error: "Bookmark controls not found.",
					};
				} catch (error) {
					return {
						handle: tweetRef,
						status: "error" as const,
						error: String(error),
					};
				}
			});

			details.push(message);
		}

		const removed = details.filter((item) => item.status === "removed").length;
		const already = details.filter((item) => item.status === "already").length;
		const errors = details.filter((item) => item.status === "error").length;

		return {
			ok: errors === 0,
			added: 0,
			already,
			removed,
			errors,
			details,
		};
	}

	async likes(options: PaginationOptions): Promise<CollectionResult<Tweet>> {
		return this.withPage(async (page) => {
			await this.goToProfileLikes(page);
			return collectTweets(page, options);
		});
	}

	async follow(userRef: string): Promise<MutationResult> {
		return this.withPage(async (page) => {
			await this.ensureAuth(page);
			await page.goto(asProfileUrl(userRef, this.baseUrl), {
				waitUntil: "domcontentloaded",
			});

			const following = page
				.locator(
					'[data-testid$="-unfollow"], [data-testid="unfollow"], button[aria-label*="Following"]',
				)
				.first();
			if (await following.isVisible().catch(() => false)) {
				return ok(`Already following ${userRef}.`);
			}

			const followClicked = await this.clickFirstVisible(page, [
				'[data-testid$="-follow"]',
				'[data-testid="follow"]',
				'button[aria-label*="Follow"]',
			]);
			if (!followClicked) {
				return fail(`Follow button not found for ${userRef}.`);
			}
			return ok(`Followed ${userRef}.`);
		});
	}

	async unfollow(userRef: string): Promise<MutationResult> {
		return this.withPage(async (page) => {
			await this.ensureAuth(page);
			await page.goto(asProfileUrl(userRef, this.baseUrl), {
				waitUntil: "domcontentloaded",
			});

			const unfollowButton = await this.firstVisibleLocator(page, [
				'[data-testid$="-unfollow"]',
				'[data-testid="unfollow"]',
				'button[aria-label*="Following"]',
				'button[aria-label*="Unfollow"]',
			]);
			if (!unfollowButton) {
				return ok(`Not currently following ${userRef}.`);
			}

			await unfollowButton.click();
			await this.clickFirstVisible(page, [
				'[data-testid="confirmationSheetConfirm"]',
				'[role="button"]:has-text("Unfollow")',
			]);

			return ok(`Unfollowed ${userRef}.`);
		});
	}

	async following(
		options: FollowListOptions,
	): Promise<CollectionResult<UserSummary>> {
		return this.withPage(async (page) => {
			await this.navigateFollowTab(page, "following", options.userId);
			return collectUsers(page, options);
		});
	}

	async followers(
		options: FollowListOptions,
	): Promise<CollectionResult<UserSummary>> {
		return this.withPage(async (page) => {
			await this.navigateFollowTab(page, "followers", options.userId);
			return collectUsers(page, options);
		});
	}

	async lists(options: ListOptions): Promise<CollectionResult<ListInfo>> {
		return this.withPage(async (page) => {
			await this.ensureAuth(page);
			await page.goto(this.absolute("/i/lists"), {
				waitUntil: "domcontentloaded",
			});

			if (options.memberOf) {
				const tab = page.locator('[role="tab"]:has-text("Member")').first();
				if (await tab.isVisible().catch(() => false)) {
					await tab.click();
					await page.waitForTimeout(500);
				}
			}

			await page
				.waitForSelector('a[href*="/i/lists/"]', { timeout: 5000 })
				.catch(() => {});
			const result = await collectLists(page, options.count);

			const enriched = await Promise.all(
				result.items.map(async (item) => {
					const cardText = await page
						.locator(`a[href*="/i/lists/${item.id}"]`)
						.first()
						.locator("..")
						.innerText()
						.catch(() => "");
					return {
						...item,
						...parseListStats(cardText),
					};
				}),
			);

			return {
				...result,
				items: enriched,
			};
		});
	}

	async listTimeline(
		listRef: string,
		options: PaginationOptions,
	): Promise<CollectionResult<Tweet>> {
		return this.withPage(async (page) => {
			await this.openList(page, listRef);
			return collectTweets(page, options);
		});
	}

	async news(options: NewsOptions): Promise<CollectionResult<NewsItem>> {
		return this.withPage(async (page) => {
			const tabToPath: Record<NewsOptions["tabs"][number], string> = {
				for_you: "for_you",
				news: "news",
				sports: "sports",
				entertainment: "entertainment",
				trending: "trending",
			};

			const allItems: NewsItem[] = [];
			const seen = new Set<string>();

			for (const tab of options.tabs) {
				await page.goto(this.absolute(`/explore/tabs/${tabToPath[tab]}`), {
					waitUntil: "domcontentloaded",
				});
				await page
					.waitForSelector('[data-testid="cellInnerDiv"]', {
						timeout: 6000,
					})
					.catch(() => {});

				const fetched = await collectNewsItems(page, options.count, tab);
				for (const item of fetched) {
					const key = item.headline.toLowerCase();
					if (seen.has(key)) continue;
					seen.add(key);
					allItems.push(item);
				}
			}

			let filtered = allItems;
			if (options.aiOnly) {
				filtered = allItems.filter(
					(item) =>
						/\b(ai|analysis|insight|report|story)\b/i.test(
							item.summary ?? "",
						) || item.headline.length > 30,
				);
			}

			if (options.withTweets) {
				for (const item of filtered.slice(0, options.count)) {
					const query = item.headline.slice(0, 64);
					const tweets = await this.search(query, {
						count: options.tweetsPerItem,
						all: false,
						delayMs: 300,
					});
					item.relatedTweets = tweets.items;
				}
			}

			return {
				items: filtered.slice(0, options.count),
				pagesFetched: options.tabs.length,
			};
		});
	}

	async about(handle: string): Promise<UserProfile> {
		return this.withPage(async (page) => {
			const clean = normalizeHandle(handle);
			await page.goto(this.absolute(`/${clean}`), {
				waitUntil: "domcontentloaded",
			});
			await page.waitForSelector('[data-testid="primaryColumn"]', {
				timeout: 15000,
			});

			const name = await page
				.locator('[data-testid="UserName"] span')
				.first()
				.innerText()
				.catch(() => undefined);
			const bio = await page
				.locator('[data-testid="UserDescription"]')
				.first()
				.innerText()
				.catch(() => undefined);
			const location = await page
				.locator('[data-testid="UserLocation"]')
				.first()
				.innerText()
				.catch(() => undefined);
			const joined = await page
				.locator('[data-testid="UserJoinDate"]')
				.first()
				.innerText()
				.catch(() => undefined);
			const website = await page
				.locator('[data-testid="UserUrl"] a')
				.first()
				.getAttribute("href")
				.catch(() => undefined);
			const profileText = await page
				.locator('[data-testid="primaryColumn"]')
				.first()
				.innerText()
				.catch(() => "");

			const accountBasedIn = profileText.match(
				/Account based in\s+([^\n]+)/i,
			)?.[1];
			const learnMoreUrl = await page
				.locator('a[href*="help.x.com"], a[href*="help.twitter.com"]')
				.first()
				.getAttribute("href")
				.catch(() => undefined);

			return {
				name,
				handle: clean,
				bio,
				location,
				joined,
				website: website ?? undefined,
				accountBasedIn: accountBasedIn?.trim() || undefined,
				source: "profile-ui",
				createdCountryAccurate: undefined,
				locationAccurate: undefined,
				learnMoreUrl: learnMoreUrl ?? undefined,
			};
		});
	}

	async queryIds(fresh: boolean): Promise<QueryIdsResult> {
		return {
			mode: "playwright",
			refreshed: fresh,
			note: "Frigatebird runs through Playwright browser automation. GraphQL query IDs are not required in this mode; this command is maintained for bird CLI parity.",
			timestamp: new Date().toISOString(),
		};
	}

	async refresh(): Promise<AuthStatus> {
		const refreshed = await this.sessions.refreshAuth(this.options);
		const loggedIn = await this.withPage(async (page) =>
			this.sessions.ensureLoggedIn(page, this.baseUrl),
		);
		const diagnostics = this.sessions.getAuthStore().getLastDiagnostics();

		return {
			loggedIn,
			source: refreshed?.source ?? "none",
			hasAuthToken: Boolean(
				refreshed?.cookies.some((cookie) => cookie.name === "auth_token"),
			),
			hasCt0: Boolean(
				refreshed?.cookies.some((cookie) => cookie.name === "ct0"),
			),
			authFile: this.sessions.getAuthStore().authFile,
			diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
		};
	}

	async addToList(
		listName: string,
		handles: string[],
		headlessOverride?: boolean,
	): Promise<BatchMutationResult> {
		const details: BatchMutationResult["details"] = [];

		for (const handle of handles) {
			const result = await this.withPage(async (page) => {
				await this.ensureAuth(page);
				return this.setListMembership(page, listName, handle, true);
			}, headlessOverride);

			details.push({
				listName,
				handle: normalizeHandle(handle),
				status: result.status,
				error: result.error,
			});
		}

		const added = details.filter((item) => item.status === "added").length;
		const already = details.filter((item) => item.status === "already").length;
		const errors = details.filter((item) => item.status === "error").length;

		return {
			ok: errors === 0,
			added,
			already,
			removed: 0,
			errors,
			details,
		};
	}

	async removeFromList(
		handle: string,
		listName: string,
		headlessOverride?: boolean,
	): Promise<BatchMutationResult> {
		const result = await this.withPage(async (page) => {
			await this.ensureAuth(page);
			return this.setListMembership(page, listName, handle, false);
		}, headlessOverride);

		const details = [
			{
				listName,
				handle: normalizeHandle(handle),
				status: result.status,
				error: result.error,
			},
		];

		return {
			ok: result.status !== "error",
			added: 0,
			already: result.status === "already" ? 1 : 0,
			removed: result.status === "removed" ? 1 : 0,
			errors: result.status === "error" ? 1 : 0,
			details,
		};
	}

	async batch(
		filePath: string,
		headlessOverride?: boolean,
	): Promise<BatchMutationResult> {
		if (!fs.existsSync(filePath)) {
			return {
				ok: false,
				added: 0,
				already: 0,
				removed: 0,
				errors: 1,
				details: [
					{
						handle: "",
						status: "error",
						error: `File not found: ${filePath}`,
					},
				],
			};
		}

		const payload = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
			string,
			string[]
		>;
		const details: BatchMutationResult["details"] = [];

		for (const [listName, handles] of Object.entries(payload)) {
			const result = await this.addToList(listName, handles, headlessOverride);
			details.push(...result.details);
		}

		const added = details.filter((item) => item.status === "added").length;
		const already = details.filter((item) => item.status === "already").length;
		const removed = details.filter((item) => item.status === "removed").length;
		const errors = details.filter((item) => item.status === "error").length;

		return {
			ok: errors === 0,
			added,
			already,
			removed,
			errors,
			details,
		};
	}
}
