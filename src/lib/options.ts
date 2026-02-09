import type {
	BookmarkOptions,
	CookieSource,
	FollowListOptions,
	GlobalOptions,
	ListOptions,
	MentionOptions,
	NewsOptions,
	PaginationOptions,
	TimelineOptions,
} from "./types.js";

const DEFAULT_COOKIE_SOURCES: CookieSource[] = ["chrome", "safari", "firefox"];

function parsePositiveInt(
	value: string | number | undefined,
	fallback: number,
): number {
	if (value === undefined || value === null) return fallback;
	const numeric =
		typeof value === "number" ? value : Number.parseInt(String(value), 10);
	return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function parseOptionalPositiveInt(
	value: string | number | undefined,
): number | undefined {
	if (value === undefined || value === null) return undefined;
	const numeric =
		typeof value === "number" ? value : Number.parseInt(String(value), 10);
	if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
	return numeric;
}

function parseCookieSources(value: unknown): CookieSource[] {
	if (!value) return [...DEFAULT_COOKIE_SOURCES];
	const array = Array.isArray(value) ? value : [value];
	const normalized: CookieSource[] = [];
	for (const item of array) {
		const parsed = String(item).trim().toLowerCase();
		if (!parsed) continue;
		if (
			parsed !== "chrome" &&
			parsed !== "firefox" &&
			parsed !== "safari" &&
			parsed !== "edge"
		) {
			throw new Error(
				`Invalid cookie source "${parsed}". Allowed: chrome, firefox, safari, edge.`,
			);
		}
		normalized.push(parsed);
	}

	if (normalized.length === 0) return [...DEFAULT_COOKIE_SOURCES];

	return Array.from(new Set(normalized));
}

export function parseGlobalOptions(
	raw: Record<string, unknown>,
): GlobalOptions {
	const media = Array.isArray(raw.media)
		? raw.media.map(String)
		: raw.media
			? [String(raw.media)]
			: [];
	const alt = Array.isArray(raw.alt)
		? raw.alt.map(String)
		: raw.alt
			? [String(raw.alt)]
			: [];

	return {
		authToken: raw.authToken ? String(raw.authToken) : undefined,
		ct0: raw.ct0 ? String(raw.ct0) : undefined,
		baseUrl: raw.baseUrl ? String(raw.baseUrl) : undefined,
		chromeProfile: raw.chromeProfile ? String(raw.chromeProfile) : undefined,
		chromeProfileDir: raw.chromeProfileDir
			? String(raw.chromeProfileDir)
			: undefined,
		firefoxProfile: raw.firefoxProfile ? String(raw.firefoxProfile) : undefined,
		cookieTimeout: parseOptionalPositiveInt(
			raw.cookieTimeout as string | number | undefined,
		),
		cookieSource: parseCookieSources(raw.cookieSource),
		cookieSourceExplicit: Boolean(raw.cookieSourceExplicit),
		timeout: parseOptionalPositiveInt(
			raw.timeout as string | number | undefined,
		),
		quoteDepth: parseOptionalPositiveInt(
			raw.quoteDepth as string | number | undefined,
		),
		compatJson: Boolean(raw.compatJson),
		plain: Boolean(raw.plain),
		emoji: raw.emoji === undefined ? true : Boolean(raw.emoji),
		color: raw.color === undefined ? true : Boolean(raw.color),
		media,
		alt,
		headless: raw.headless === undefined ? true : Boolean(raw.headless),
	};
}

export function parsePaginationOptions(
	raw: Record<string, unknown>,
	defaults: { count: number; all?: boolean; delayMs?: number },
): PaginationOptions {
	const count = parsePositiveInt(
		raw.count as string | number | undefined,
		defaults.count,
	);
	const maxPages = parseOptionalPositiveInt(
		raw.maxPages as string | number | undefined,
	);
	const delayMs = parsePositiveInt(
		raw.delay as string | number | undefined,
		defaults.delayMs ?? 800,
	);
	const all =
		Boolean(raw.all) ||
		maxPages !== undefined ||
		Boolean(raw.cursor) ||
		Boolean(defaults.all);

	return {
		count,
		all,
		maxPages,
		cursor: raw.cursor ? String(raw.cursor) : undefined,
		delayMs,
	};
}

export function parseTimelineOptions(
	raw: Record<string, unknown>,
	defaults: { count: number; following?: boolean },
): TimelineOptions {
	return {
		...parsePaginationOptions(raw, { count: defaults.count }),
		following: defaults.following ?? Boolean(raw.following),
	};
}

export function parseBookmarkOptions(
	raw: Record<string, unknown>,
): BookmarkOptions {
	return {
		...parsePaginationOptions(raw, { count: 20 }),
		folderId: raw.folderId ? String(raw.folderId) : undefined,
		expandRootOnly: Boolean(raw.expandRootOnly),
		authorChain: Boolean(raw.authorChain),
		authorOnly: Boolean(raw.authorOnly),
		fullChainOnly: Boolean(raw.fullChainOnly),
		includeAncestorBranches: Boolean(raw.includeAncestorBranches),
		includeParent: Boolean(raw.includeParent),
		threadMeta: Boolean(raw.threadMeta),
		sortChronological: Boolean(raw.sortChronological),
	};
}

export function parseListOptions(raw: Record<string, unknown>): ListOptions {
	return {
		count: parsePositiveInt(raw.count as string | number | undefined, 100),
		memberOf: Boolean(raw.memberOf),
	};
}

export function parseFollowListOptions(
	raw: Record<string, unknown>,
): FollowListOptions {
	return {
		...parsePaginationOptions(raw, { count: 20 }),
		userId: raw.user ? String(raw.user) : undefined,
	};
}

export function parseMentionOptions(
	raw: Record<string, unknown>,
): MentionOptions {
	return {
		user: raw.user ? String(raw.user) : undefined,
		count: parsePositiveInt(raw.count as string | number | undefined, 10),
	};
}

export function parseNewsOptions(raw: Record<string, unknown>): NewsOptions {
	const count = parsePositiveInt(raw.count as string | number | undefined, 10);
	const tweetsPerItem = parsePositiveInt(
		raw.tweetsPerItem as string | number | undefined,
		5,
	);

	const requestedTabs: NewsOptions["tabs"] = [];
	if (raw.forYou) requestedTabs.push("for_you");
	if (raw.newsOnly) requestedTabs.push("news");
	if (raw.sports) requestedTabs.push("sports");
	if (raw.entertainment) requestedTabs.push("entertainment");
	if (raw.trendingOnly) requestedTabs.push("trending");

	const tabs: NewsOptions["tabs"] =
		requestedTabs.length > 0
			? requestedTabs
			: ["for_you", "news", "sports", "entertainment"];

	return {
		count,
		aiOnly: Boolean(raw.aiOnly),
		withTweets: Boolean(raw.withTweets),
		tweetsPerItem,
		tabs,
	};
}

export function parseJsonFlag(raw: Record<string, unknown>): {
	json: boolean;
	jsonFull: boolean;
} {
	const jsonFull = Boolean(raw.jsonFull);
	return {
		json: Boolean(raw.json) || jsonFull,
		jsonFull,
	};
}

export function validateMediaOptions(media: string[], alt: string[]): string[] {
	const warnings: string[] = [];

	if (media.length > 4) {
		warnings.push(
			"X supports up to 4 media attachments in a post. Extra paths will be ignored by the platform.",
		);
	}

	if (alt.length > media.length) {
		warnings.push(
			"More --alt values than --media values were provided. Unmatched alt text entries were ignored.",
		);
	}

	return warnings;
}

export function ensurePositive(value: number, label: string): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must be a positive integer.`);
	}
}
