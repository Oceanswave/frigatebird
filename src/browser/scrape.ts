import type { Locator, Page } from "playwright";
import { decodeOffsetCursor, encodeOffsetCursor } from "../lib/cursor.js";
import {
	extractListId,
	extractTweetId,
	normalizeHandle,
} from "../lib/identifiers.js";
import type {
	CollectionResult,
	ListInfo,
	NewsItem,
	PaginationOptions,
	Tweet,
	UserSummary,
} from "../lib/types.js";

async function safeInnerText(locator: Locator): Promise<string> {
	const count = await locator.count().catch(() => 0);
	if (count === 0) return "";
	return locator.innerText().catch(() => "");
}

async function safeAttribute(
	locator: Locator,
	attribute: string,
): Promise<string> {
	const count = await locator.count().catch(() => 0);
	if (count === 0) return "";
	return (await locator.getAttribute(attribute).catch(() => null)) ?? "";
}

function parseMetricNumber(value: string): number | undefined {
	const normalized = value.replace(/,/g, "").trim();
	if (!normalized) return undefined;

	const compactMatch = normalized.match(/(\d+(?:\.\d+)?)\s*([KMB])/i);
	if (compactMatch?.[1]) {
		const base = Number.parseFloat(compactMatch[1]);
		if (!Number.isFinite(base)) return undefined;
		const suffix = compactMatch[2]?.toUpperCase();
		const multiplier =
			suffix === "K" ? 1_000 : suffix === "M" ? 1_000_000 : 1_000_000_000;
		return Math.round(base * multiplier);
	}

	const integerMatch = normalized.match(/\b(\d+)\b/);
	if (integerMatch?.[1]) {
		const parsed = Number.parseInt(integerMatch[1], 10);
		if (Number.isFinite(parsed)) return parsed;
	}

	return undefined;
}

async function extractActionCount(
	card: Locator,
	testIds: string[],
): Promise<number | undefined> {
	for (const testId of testIds) {
		const target = card.locator(`[data-testid="${testId}"]`).first();
		if ((await target.count().catch(() => 0)) === 0) continue;
		const textCandidates = [
			await safeAttribute(target, "aria-label"),
			await safeInnerText(target),
			await safeInnerText(target.locator("span").first()),
		];

		for (const candidate of textCandidates) {
			const parsed = parseMetricNumber(candidate);
			if (parsed !== undefined) return parsed;
		}
	}

	return undefined;
}

async function extractTweetFromCard(card: Locator): Promise<Tweet | null> {
	const link = card.locator('a[href*="/status/"] time').first();
	const href = await safeAttribute(link.locator(".."), "href");
	const id = extractTweetId(href);
	if (!id) return null;

	const absoluteUrl = href.startsWith("http") ? href : `https://x.com${href}`;
	const text = await safeInnerText(
		card.locator('[data-testid="tweetText"]').first(),
	);
	const userNameText = await safeInnerText(
		card.locator('[data-testid="User-Name"]').first(),
	);
	const lines = userNameText
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	const handleCandidate = lines.find((line) => line.startsWith("@")) ?? "";
	const authorHandle = handleCandidate
		? normalizeHandle(handleCandidate)
		: undefined;
	const authorName =
		lines[0] && lines[0] !== handleCandidate ? lines[0] : undefined;
	const createdAt = await safeAttribute(
		card.locator("time").first(),
		"datetime",
	);
	const authorLink = await safeAttribute(
		card.locator('a[href*="/i/user/"]').first(),
		"href",
	);
	const authorId = authorLink.match(/\/i\/user\/(\d+)/)?.[1];
	const replyCount = await extractActionCount(card, ["reply"]);
	const retweetCount = await extractActionCount(card, ["retweet", "unretweet"]);
	const likeCount = await extractActionCount(card, ["like", "unlike"]);
	const author =
		authorName || authorHandle
			? { name: authorName, username: authorHandle }
			: undefined;

	return {
		id,
		text,
		url: absoluteUrl,
		createdAt: createdAt || undefined,
		authorName,
		authorHandle,
		author,
		authorId,
		replyCount,
		retweetCount,
		likeCount,
		conversationId: id,
	};
}

async function scrollPage(page: Page, amount = 2500): Promise<void> {
	await page.mouse.wheel(0, amount);
}

export async function collectTweets(
	page: Page,
	options: PaginationOptions,
): Promise<CollectionResult<Tweet>> {
	const byId = new Map<string, Tweet>();
	let pagesFetched = 0;
	const softPageLimit = options.maxPages ?? (options.all ? 25 : 1);
	const cursorOffset = options.cursor ? decodeOffsetCursor(options.cursor) : 0;
	let reachedBottom = false;
	let windowSatisfied = false;

	while (pagesFetched < softPageLimit) {
		pagesFetched += 1;
		const cards = page.locator('[data-testid="tweet"]');
		const cardCount = await cards.count();

		for (let index = 0; index < cardCount; index += 1) {
			const tweet = await extractTweetFromCard(cards.nth(index));
			if (!tweet) continue;
			if (!byId.has(tweet.id)) {
				byId.set(tweet.id, tweet);
			}
			if (!options.all && byId.size >= cursorOffset + options.count) {
				windowSatisfied = true;
				break;
			}
		}

		if (windowSatisfied) {
			break;
		}

		if (options.all) {
			await scrollPage(page);
			await page.waitForTimeout(options.delayMs);

			const atBottom = await page.evaluate(() => {
				const scrollHeight = document.body.scrollHeight;
				const scrollTop = window.scrollY + window.innerHeight;
				return scrollTop + 10 >= scrollHeight;
			});

			if (atBottom && pagesFetched >= 2) {
				reachedBottom = true;
				break;
			}
		} else {
			break;
		}
	}

	const items = Array.from(byId.values());
	const returnAllItems = options.all && !options.cursor;
	const start = Math.max(0, cursorOffset);
	const end = start + options.count;
	const windowedItems = returnAllItems ? items : items.slice(start, end);
	const hasMoreInMemory = start + windowedItems.length < items.length;
	const hitPageLimit =
		options.all && !reachedBottom && pagesFetched >= softPageLimit;
	const hasMorePotential =
		hasMoreInMemory ||
		hitPageLimit ||
		(!options.all && items.length >= start + options.count);
	const nextCursor =
		!returnAllItems && hasMorePotential && windowedItems.length > 0
			? encodeOffsetCursor(start + windowedItems.length)
			: undefined;

	return {
		items: windowedItems,
		pagesFetched,
		nextCursor,
		raw: {
			mode: "playwright-scrape",
			collected: items.length,
			offset: start,
			returnAllItems,
			hitPageLimit,
		},
	};
}

async function extractListFromAnchor(
	anchor: Locator,
): Promise<ListInfo | null> {
	const href = await safeAttribute(anchor, "href");
	const id = extractListId(href);
	if (!id) return null;

	const name = (await safeInnerText(anchor))
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)[0];
	if (!name) return null;

	const description = (await safeInnerText(anchor.locator("..")))
		.split("\n")
		.slice(1)
		.join(" ")
		.trim();

	return {
		id,
		name,
		description: description || undefined,
		url: href.startsWith("http") ? href : `https://x.com${href}`,
	};
}

export async function collectLists(
	page: Page,
	count: number,
): Promise<CollectionResult<ListInfo>> {
	const seen = new Set<string>();
	const items: ListInfo[] = [];
	let pagesFetched = 0;
	let stagnantRounds = 0;
	const maxRounds = 8;

	while (items.length < count && pagesFetched < maxRounds) {
		pagesFetched += 1;
		const before = items.length;
		const anchors = page.locator('a[href*="/i/lists/"]');
		const anchorCount = await anchors.count();

		for (let index = 0; index < anchorCount; index += 1) {
			const list = await extractListFromAnchor(anchors.nth(index));
			if (!list || seen.has(list.id)) continue;
			seen.add(list.id);
			items.push(list);
			if (items.length >= count) break;
		}

		if (items.length === before) {
			stagnantRounds += 1;
		} else {
			stagnantRounds = 0;
		}
		if (stagnantRounds >= 2 || items.length >= count) {
			break;
		}

		await scrollPage(page, 1800);
		await page.waitForTimeout(500);
	}

	return { items, pagesFetched, nextCursor: undefined };
}

async function extractUserFromCell(cell: Locator): Promise<UserSummary | null> {
	const href = await safeAttribute(
		cell.locator('a[href^="/"]').first(),
		"href",
	);
	const lines = (await safeInnerText(cell))
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	const handleLine = lines.find((line) => line.startsWith("@"));
	const name = lines[0] && lines[0] !== handleLine ? lines[0] : undefined;
	const handle = handleLine ? normalizeHandle(handleLine) : undefined;
	const bio =
		lines
			.slice(handleLine ? lines.indexOf(handleLine) + 1 : 1)
			.join(" ")
			.trim() || undefined;
	const userId = href.match(/\/i\/user\/(\d+)/)?.[1];

	if (!name && !handle && !href) return null;

	return {
		id: userId,
		name,
		handle,
		username: handle,
		bio,
		description: bio,
		url: href ? `https://x.com${href}` : undefined,
	};
}

export async function collectUsers(
	page: Page,
	options: PaginationOptions,
): Promise<CollectionResult<UserSummary>> {
	const users: UserSummary[] = [];
	const seen = new Set<string>();
	const softPageLimit = options.maxPages ?? (options.all ? 15 : 1);
	let pagesFetched = 0;
	let stagnantRounds = 0;
	const cursorOffset = options.cursor ? decodeOffsetCursor(options.cursor) : 0;
	let reachedPageEnd = false;
	let windowSatisfied = false;

	while (pagesFetched < softPageLimit) {
		pagesFetched += 1;
		const before = users.length;
		const cells = page.locator(
			'[data-testid="cellInnerDiv"], [data-testid="UserCell"]',
		);
		const cellCount = await cells.count();

		for (let index = 0; index < cellCount; index += 1) {
			const parsed = await extractUserFromCell(cells.nth(index));
			if (!parsed) continue;
			const dedupeKey =
				parsed.handle ?? parsed.url ?? `${parsed.name}-${index}`;
			if (seen.has(dedupeKey)) continue;
			seen.add(dedupeKey);
			users.push(parsed);
			if (!options.all && users.length >= cursorOffset + options.count) {
				windowSatisfied = true;
				break;
			}
		}

		if (windowSatisfied) {
			break;
		}

		if (!options.all) {
			break;
		}
		if (users.length === before) {
			stagnantRounds += 1;
		} else {
			stagnantRounds = 0;
		}
		if (stagnantRounds >= 2) {
			reachedPageEnd = true;
			break;
		}

		await scrollPage(page, 2200);
		await page.waitForTimeout(options.delayMs);
	}

	const returnAllItems = options.all && !options.cursor;
	const start = Math.max(0, cursorOffset);
	const end = start + options.count;
	const windowedItems = returnAllItems ? users : users.slice(start, end);
	const hasMoreInMemory = start + windowedItems.length < users.length;
	const hitPageLimit =
		options.all && !reachedPageEnd && pagesFetched >= softPageLimit;
	const hasMorePotential =
		hasMoreInMemory ||
		hitPageLimit ||
		(!options.all && users.length >= start + options.count);
	const nextCursor =
		!returnAllItems && hasMorePotential && windowedItems.length > 0
			? encodeOffsetCursor(start + windowedItems.length)
			: undefined;

	return {
		items: windowedItems,
		pagesFetched,
		nextCursor,
		raw: {
			mode: "playwright-scrape",
			collected: users.length,
			offset: start,
			returnAllItems,
			hitPageLimit,
		},
	};
}

export async function collectNewsItems(
	page: Page,
	count: number,
	sourceTab: string,
): Promise<NewsItem[]> {
	const items: NewsItem[] = [];
	const seen = new Set<string>();

	const candidates = page.locator('[data-testid="cellInnerDiv"]');
	const total = await candidates.count();

	for (let index = 0; index < total; index += 1) {
		const text = (await safeInnerText(candidates.nth(index))).trim();
		if (!text) continue;

		const lines = text
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
		if (lines.length < 2) continue;

		const headline =
			lines.find((line) => line.length > 12 && !line.startsWith("#")) ??
			lines[0];
		if (!headline || seen.has(headline.toLowerCase())) continue;

		seen.add(headline.toLowerCase());

		const link = await safeAttribute(
			candidates.nth(index).locator("a").first(),
			"href",
		);
		items.push({
			id: `${sourceTab}-${index}`,
			headline,
			category: lines[0],
			summary: lines.slice(1).join(" "),
			url: link
				? link.startsWith("http")
					? link
					: `https://x.com${link}`
				: undefined,
			sourceTab,
		});

		if (items.length >= count) break;
	}

	return items;
}
