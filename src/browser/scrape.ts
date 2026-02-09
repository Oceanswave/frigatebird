import type { Locator, Page } from "playwright";
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
	return locator.innerText().catch(() => "");
}

async function safeAttribute(
	locator: Locator,
	attribute: string,
): Promise<string> {
	return (await locator.getAttribute(attribute).catch(() => null)) ?? "";
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

	return {
		id,
		text,
		url: absoluteUrl,
		createdAt: createdAt || undefined,
		authorName,
		authorHandle,
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
			if (!options.all && byId.size >= options.count) {
				return {
					items: Array.from(byId.values()).slice(0, options.count),
					pagesFetched,
					nextCursor: undefined,
				};
			}
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
				break;
			}
		} else {
			break;
		}
	}

	const items = Array.from(byId.values());
	return {
		items: options.all ? items : items.slice(0, options.count),
		pagesFetched,
		nextCursor: undefined,
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

	if (!name && !handle && !href) return null;

	return {
		name,
		handle,
		bio:
			lines
				.slice(handleLine ? lines.indexOf(handleLine) + 1 : 1)
				.join(" ")
				.trim() || undefined,
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
			if (!options.all && users.length >= options.count) {
				return {
					items: users.slice(0, options.count),
					pagesFetched,
					nextCursor: undefined,
				};
			}
		}

		if (!options.all) break;
		if (users.length === before) {
			stagnantRounds += 1;
		} else {
			stagnantRounds = 0;
		}
		if (stagnantRounds >= 2) break;

		await scrollPage(page, 2200);
		await page.waitForTimeout(options.delayMs);
	}

	return {
		items: options.all ? users : users.slice(0, options.count),
		pagesFetched,
		nextCursor: undefined,
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
