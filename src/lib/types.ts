export type CookieSource = "chrome" | "firefox" | "safari" | "edge";

export interface GlobalOptions {
	authToken?: string;
	ct0?: string;
	baseUrl?: string;
	chromeProfile?: string;
	chromeProfileDir?: string;
	firefoxProfile?: string;
	cookieTimeout?: number;
	cookieSource: CookieSource[];
	cookieSourceExplicit?: boolean;
	timeout?: number;
	quoteDepth?: number;
	compatJson?: boolean;
	plain?: boolean;
	emoji?: boolean;
	color?: boolean;
	media: string[];
	alt: string[];
	headless: boolean;
}

export interface PaginationOptions {
	count: number;
	all: boolean;
	maxPages?: number;
	cursor?: string;
	delayMs: number;
}

export interface Tweet {
	id: string;
	text: string;
	url: string;
	createdAt?: string;
	authorName?: string;
	authorHandle?: string;
	author?: {
		username?: string;
		name?: string;
	};
	authorId?: string;
	replyCount?: number;
	retweetCount?: number;
	likeCount?: number;
	conversationId?: string;
	inReplyToStatusId?: string;
	quotedTweet?: Tweet;
	isThread?: boolean;
	threadPosition?: number;
	isBookmarkedTweet?: boolean;
}

export interface UserProfile {
	id?: string;
	name?: string;
	handle?: string;
	bio?: string;
	location?: string;
	joined?: string;
	website?: string;
	verified?: boolean;
	accountBasedIn?: string;
	source?: string;
	createdCountryAccurate?: boolean;
	locationAccurate?: boolean;
	learnMoreUrl?: string;
}

export interface NewsItem {
	id: string;
	headline: string;
	category?: string;
	summary?: string;
	url?: string;
	sourceTab: string;
	relatedTweets?: Tweet[];
}

export interface ListInfo {
	id: string;
	name: string;
	description?: string;
	memberCount?: number;
	subscriberCount?: number;
	url: string;
}

export interface UserSummary {
	id?: string;
	name?: string;
	handle?: string;
	username?: string;
	bio?: string;
	description?: string;
	followersCount?: number;
	followingCount?: number;
	isBlueVerified?: boolean;
	profileImageUrl?: string;
	createdAt?: string;
	url?: string;
}

export interface AuthStatus {
	loggedIn: boolean;
	source: string;
	hasAuthToken: boolean;
	hasCt0: boolean;
	authFile: string;
	diagnostics?: string[];
}

export interface MutationResult {
	ok: boolean;
	message: string;
}

export interface BatchMutationResult {
	ok: boolean;
	added: number;
	already: number;
	removed: number;
	errors: number;
	details: Array<{
		listName?: string;
		handle: string;
		status: "added" | "already" | "removed" | "error";
		error?: string;
	}>;
}

export interface QueryIdsResult {
	mode: "playwright";
	refreshed: boolean;
	note: string;
	timestamp: string;
}

export interface CollectionResult<T> {
	items: T[];
	nextCursor?: string | null;
	pagesFetched: number;
	raw?: unknown;
	warnings?: string[];
}

export interface NewsOptions {
	count: number;
	aiOnly: boolean;
	withTweets: boolean;
	tweetsPerItem: number;
	tabs: Array<"for_you" | "news" | "sports" | "entertainment" | "trending">;
}

export interface BookmarkOptions extends PaginationOptions {
	folderId?: string;
	expandRootOnly?: boolean;
	authorChain?: boolean;
	authorOnly?: boolean;
	fullChainOnly?: boolean;
	includeAncestorBranches?: boolean;
	includeParent?: boolean;
	threadMeta?: boolean;
	sortChronological?: boolean;
}

export interface ListOptions {
	count: number;
	memberOf: boolean;
}

export interface TimelineOptions extends PaginationOptions {
	following?: boolean;
}

export interface FollowListOptions extends PaginationOptions {
	userId?: string;
}

export interface MentionOptions {
	user?: string;
	count: number;
}

export interface JsonOutputOptions {
	json: boolean;
	jsonFull: boolean;
}
