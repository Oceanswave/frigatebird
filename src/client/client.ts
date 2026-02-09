import type {
	AuthStatus,
	BatchMutationResult,
	BookmarkOptions,
	CollectionResult,
	FollowListOptions,
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

export interface FrigatebirdClient {
	check(): Promise<AuthStatus>;
	whoami(): Promise<UserProfile>;

	tweet(
		text: string,
		media?: string[],
		alt?: string[],
	): Promise<MutationResult>;
	publishArticle(title: string, body: string): Promise<MutationResult>;
	reply(tweetRef: string, text: string): Promise<MutationResult>;
	like(tweetRef: string): Promise<MutationResult>;
	retweet(tweetRef: string): Promise<MutationResult>;

	read(tweetRef: string): Promise<Tweet>;
	thread(
		tweetRef: string,
		options: PaginationOptions,
	): Promise<CollectionResult<Tweet>>;
	replies(
		tweetRef: string,
		options: PaginationOptions,
	): Promise<CollectionResult<Tweet>>;

	search(
		query: string,
		options: PaginationOptions,
	): Promise<CollectionResult<Tweet>>;
	mentions(options: MentionOptions): Promise<CollectionResult<Tweet>>;
	userTweets(
		handle: string,
		options: PaginationOptions,
	): Promise<CollectionResult<Tweet>>;
	home(options: TimelineOptions): Promise<CollectionResult<Tweet>>;
	bookmarks(options: BookmarkOptions): Promise<CollectionResult<Tweet>>;
	unbookmark(tweetRefs: string[]): Promise<BatchMutationResult>;
	likes(options: PaginationOptions): Promise<CollectionResult<Tweet>>;

	follow(userRef: string): Promise<MutationResult>;
	unfollow(userRef: string): Promise<MutationResult>;
	following(options: FollowListOptions): Promise<CollectionResult<UserSummary>>;
	followers(options: FollowListOptions): Promise<CollectionResult<UserSummary>>;

	lists(options: ListOptions): Promise<CollectionResult<ListInfo>>;
	listTimeline(
		listRef: string,
		options: PaginationOptions,
	): Promise<CollectionResult<Tweet>>;

	news(options: NewsOptions): Promise<CollectionResult<NewsItem>>;
	about(handle: string): Promise<UserProfile>;

	queryIds(fresh: boolean): Promise<QueryIdsResult>;
	refresh(): Promise<AuthStatus>;

	addToList(
		listName: string,
		handles: string[],
		headlessOverride?: boolean,
	): Promise<BatchMutationResult>;
	removeFromList(
		handle: string,
		listName: string,
		headlessOverride?: boolean,
	): Promise<BatchMutationResult>;
	batch(
		filePath: string,
		headlessOverride?: boolean,
	): Promise<BatchMutationResult>;
}
