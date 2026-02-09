import fs from "node:fs";
import type { FrigatebirdClient } from "../client/client.js";
import {
	parseBookmarkOptions,
	parseFollowListOptions,
	parseJsonFlag,
	parseListOptions,
	parseMentionOptions,
	parseNewsOptions,
	parsePaginationOptions,
	parseTimelineOptions,
} from "../lib/options.js";
import type { Output } from "../lib/output.js";
import type {
	BatchMutationResult,
	CollectionResult,
	JsonOutputOptions,
	ListInfo,
	NewsItem,
	Tweet,
	UserSummary,
} from "../lib/types.js";

function parseRawArgs(options: unknown): Record<string, unknown> {
	if (options && typeof options === "object") {
		return options as Record<string, unknown>;
	}
	return {};
}

export interface HandlerDeps {
	client: FrigatebirdClient;
	output: Output;
	compatJson?: boolean;
	quoteDepth?: number;
}

interface BirdTweet {
	id: string;
	text: string;
	author?: {
		username?: string;
		name?: string;
	};
	authorId?: string;
	createdAt?: string;
	replyCount?: number;
	retweetCount?: number;
	likeCount?: number;
	conversationId?: string;
	inReplyToStatusId?: string;
	quotedTweet?: BirdTweet;
}

function toBirdTweet(tweet: Tweet, quoteDepth = 1): BirdTweet {
	const author = {
		username: tweet.author?.username ?? tweet.authorHandle,
		name: tweet.author?.name ?? tweet.authorName,
	};
	const nextQuoteDepth = Math.max(0, quoteDepth - 1);
	const hasAuthor = Boolean(author.username || author.name);

	return {
		id: tweet.id,
		text: tweet.text,
		author: hasAuthor ? author : undefined,
		authorId: tweet.authorId,
		createdAt: tweet.createdAt,
		replyCount: tweet.replyCount,
		retweetCount: tweet.retweetCount,
		likeCount: tweet.likeCount,
		conversationId: tweet.conversationId ?? tweet.id,
		inReplyToStatusId: tweet.inReplyToStatusId,
		quotedTweet:
			quoteDepth > 0 && tweet.quotedTweet
				? toBirdTweet(tweet.quotedTweet, nextQuoteDepth)
				: undefined,
	};
}

function toBirdUser(user: UserSummary): Record<string, unknown> {
	return {
		id: user.id,
		username: user.username ?? user.handle,
		name: user.name,
		description: user.description ?? user.bio,
		followersCount: user.followersCount,
		followingCount: user.followingCount,
		isBlueVerified: user.isBlueVerified,
		profileImageUrl: user.profileImageUrl,
		createdAt: user.createdAt,
	};
}

function printTweetCollection(
	result: CollectionResult<Tweet>,
	json: JsonOutputOptions,
	output: Output,
	options: {
		compatJson?: boolean;
		quoteDepth?: number;
	},
): void {
	if (json.json) {
		if (options.compatJson) {
			const tweets = result.items.map((item) =>
				toBirdTweet(item, options.quoteDepth ?? 1),
			);
			output.json(
				json.jsonFull
					? {
							tweets,
							nextCursor: result.nextCursor ?? null,
							pagesFetched: result.pagesFetched,
							warnings: result.warnings,
							raw: result.raw,
						}
					: {
							tweets,
							nextCursor: result.nextCursor ?? null,
						},
			);
			return;
		}

		const compatibility = {
			tweets: result.items,
			nextCursor: result.nextCursor,
		};
		output.json(
			json.jsonFull
				? {
						...result,
						...compatibility,
					}
				: {
						items: result.items,
						...compatibility,
						nextCursor: result.nextCursor,
						pagesFetched: result.pagesFetched,
						warnings: result.warnings,
					},
		);
		return;
	}

	if (result.warnings) {
		for (const warning of result.warnings) {
			output.warn(warning);
		}
	}

	output.tweets(result);
}

function printUserCollection(
	result: CollectionResult<UserSummary>,
	json: JsonOutputOptions,
	output: Output,
	options: {
		compatJson?: boolean;
	},
): void {
	if (json.json) {
		if (options.compatJson) {
			const users = result.items.map((item) => toBirdUser(item));
			output.json(
				json.jsonFull
					? {
							users,
							nextCursor: result.nextCursor ?? null,
							pagesFetched: result.pagesFetched,
							raw: result.raw,
						}
					: {
							users,
							nextCursor: result.nextCursor ?? null,
						},
			);
			return;
		}

		const compatibility = {
			users: result.items,
			nextCursor: result.nextCursor,
		};
		output.json(
			json.jsonFull
				? {
						...result,
						...compatibility,
					}
				: {
						items: result.items,
						...compatibility,
						nextCursor: result.nextCursor,
						pagesFetched: result.pagesFetched,
					},
		);
		return;
	}

	output.users(result);
}

function printListCollection(
	result: CollectionResult<ListInfo>,
	json: JsonOutputOptions,
	output: Output,
): void {
	if (json.json) {
		const compatibility = {
			lists: result.items,
			nextCursor: result.nextCursor,
		};
		output.json(
			json.jsonFull
				? {
						...result,
						...compatibility,
					}
				: {
						items: result.items,
						...compatibility,
						pagesFetched: result.pagesFetched,
					},
		);
		return;
	}

	output.lists(result);
}

function printNewsCollection(
	result: CollectionResult<NewsItem>,
	json: JsonOutputOptions,
	output: Output,
): void {
	if (json.json) {
		const compatibility = {
			news: result.items,
			nextCursor: result.nextCursor,
		};
		output.json(
			json.jsonFull
				? {
						...result,
						...compatibility,
					}
				: {
						items: result.items,
						...compatibility,
						pagesFetched: result.pagesFetched,
					},
		);
		return;
	}

	output.news(result);
}

function printBatchResult(
	result: BatchMutationResult,
	json: JsonOutputOptions,
	output: Output,
): void {
	if (json.json) {
		output.json(result);
		return;
	}

	output.info(`Added: ${result.added}`);
	output.info(`Already: ${result.already}`);
	output.info(`Removed: ${result.removed}`);
	output.info(`Errors: ${result.errors}`);

	if (result.details.length > 0) {
		output.info("");
		for (const detail of result.details) {
			const listPart = detail.listName ? `[${detail.listName}] ` : "";
			const suffix = detail.error ? ` (${detail.error})` : "";
			output.info(
				`${listPart}@${detail.handle || "unknown"} => ${detail.status}${suffix}`,
			);
		}
	}
}

export function createHandlers({
	client,
	output,
	compatJson = false,
	quoteDepth = 1,
}: HandlerDeps) {
	const renderingOptions = {
		compatJson,
		quoteDepth: Math.max(0, Math.trunc(quoteDepth)),
	};

	return {
		check: async () => {
			const status = await client.check();
			output.info(`Logged in: ${status.loggedIn ? "yes" : "no"}`);
			output.info(`Cookie source: ${status.source}`);
			output.info(`auth_token: ${status.hasAuthToken ? "present" : "missing"}`);
			output.info(`ct0: ${status.hasCt0 ? "present" : "missing"}`);
			output.info(`Auth file: ${status.authFile}`);
			if (status.diagnostics) {
				for (const diagnostic of status.diagnostics) {
					output.warn(diagnostic);
				}
			}
		},

		whoami: async (options: unknown) => {
			const json = parseJsonFlag(parseRawArgs(options));
			const profile = await client.whoami();
			if (json.json) {
				output.json(profile);
			} else {
				output.profile(profile);
			}
		},

		tweet: async (text: string) => {
			output.mutation(await client.tweet(text));
		},

		article: async (
			title: string,
			body: string | undefined,
			options: unknown,
		) => {
			const raw = parseRawArgs(options);
			const bodyFile =
				typeof raw.bodyFile === "string" ? raw.bodyFile.trim() : "";
			let content = body?.trim() ?? "";

			if (bodyFile) {
				const fromFile = fs.readFileSync(bodyFile, "utf8").trim();
				if (!fromFile) {
					throw new Error(`Article body file is empty: ${bodyFile}`);
				}
				content = content ? `${content}\n\n${fromFile}` : fromFile;
			}

			if (!content) {
				throw new Error(
					"Article body is required. Provide [body] or --body-file <path>.",
				);
			}

			output.mutation(await client.publishArticle(title, content));
		},

		reply: async (tweetRef: string, text: string) => {
			output.mutation(await client.reply(tweetRef, text));
		},

		like: async (tweetRef: string) => {
			output.mutation(await client.like(tweetRef));
		},

		retweet: async (tweetRef: string) => {
			output.mutation(await client.retweet(tweetRef));
		},

		read: async (tweetRef: string, options: unknown) => {
			const json = parseJsonFlag(parseRawArgs(options));
			const tweet = await client.read(tweetRef);

			if (json.json) {
				if (compatJson) {
					output.json(toBirdTweet(tweet, renderingOptions.quoteDepth));
				} else {
					output.json(tweet);
				}
				return;
			}

			output.tweets({ items: [tweet], pagesFetched: 1 });
		},

		replies: async (tweetRef: string, options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const pagination = parsePaginationOptions(raw, {
				count: 20,
				delayMs: 1000,
			});
			const result = await client.replies(tweetRef, pagination);
			printTweetCollection(result, json, output, renderingOptions);
		},

		thread: async (tweetRef: string, options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const pagination = parsePaginationOptions(raw, {
				count: 20,
				delayMs: 1000,
			});
			const result = await client.thread(tweetRef, pagination);
			printTweetCollection(result, json, output, renderingOptions);
		},

		search: async (query: string, options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const pagination = parsePaginationOptions(raw, {
				count: 10,
				delayMs: 800,
			});
			const result = await client.search(query, pagination);
			printTweetCollection(result, json, output, renderingOptions);
		},

		mentions: async (options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const result = await client.mentions(parseMentionOptions(raw));
			printTweetCollection(result, json, output, renderingOptions);
		},

		userTweets: async (handle: string, options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const pagination = parsePaginationOptions(raw, {
				count: 20,
				delayMs: 1000,
			});
			const result = await client.userTweets(handle, pagination);
			printTweetCollection(result, json, output, renderingOptions);
		},

		home: async (options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const timeline = parseTimelineOptions(raw, {
				count: 20,
				following: Boolean(raw.following),
			});
			const result = await client.home(timeline);
			printTweetCollection(result, json, output, renderingOptions);
		},

		bookmarks: async (options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const bookmarkOptions = parseBookmarkOptions(raw);
			const result = await client.bookmarks(bookmarkOptions);
			printTweetCollection(result, json, output, renderingOptions);
		},

		unbookmark: async (tweetRefs: string[], options: unknown) => {
			const json = parseJsonFlag(parseRawArgs(options));
			const result = await client.unbookmark(tweetRefs);
			printBatchResult(result, json, output);
		},

		likes: async (options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const pagination = parsePaginationOptions(raw, {
				count: 20,
				delayMs: 1000,
			});
			const result = await client.likes(pagination);
			printTweetCollection(result, json, output, renderingOptions);
		},

		lists: async (options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const listOptions = parseListOptions(raw);
			const result = await client.lists(listOptions);
			printListCollection(result, json, output);
		},

		listTimeline: async (listRef: string, options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const pagination = parsePaginationOptions(raw, {
				count: 20,
				delayMs: 800,
			});
			const result = await client.listTimeline(listRef, pagination);
			printTweetCollection(result, json, output, renderingOptions);
		},

		follow: async (user: string) => {
			output.mutation(await client.follow(user));
		},

		unfollow: async (user: string) => {
			output.mutation(await client.unfollow(user));
		},

		following: async (options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const result = await client.following(parseFollowListOptions(raw));
			printUserCollection(result, json, output, renderingOptions);
		},

		followers: async (options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const result = await client.followers(parseFollowListOptions(raw));
			printUserCollection(result, json, output, renderingOptions);
		},

		about: async (handle: string, options: unknown) => {
			const json = parseJsonFlag(parseRawArgs(options));
			const profile = await client.about(handle);
			if (json.json) {
				output.json(profile);
			} else {
				output.profile(profile);
			}
		},

		news: async (options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const newsOptions = parseNewsOptions(raw);
			const result = await client.news(newsOptions);
			printNewsCollection(result, json, output);
		},

		queryIds: async (options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const result = await client.queryIds(Boolean(raw.fresh));
			if (json.json) {
				output.json(result);
			} else {
				output.queryIds(result);
			}
		},

		refresh: async (options: unknown) => {
			const json = parseJsonFlag(parseRawArgs(options));
			const result = await client.refresh();
			if (json.json) {
				output.json(result);
			} else {
				output.info(`Logged in: ${result.loggedIn ? "yes" : "no"}`);
				output.info(`Source: ${result.source}`);
				output.info(
					`auth_token: ${result.hasAuthToken ? "present" : "missing"}`,
				);
				output.info(`ct0: ${result.hasCt0 ? "present" : "missing"}`);
				if (result.diagnostics) {
					for (const diagnostic of result.diagnostics) {
						output.warn(diagnostic);
					}
				}
			}
		},

		add: async (listName: string, handles: string[], options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const headless =
				raw.headless === undefined ? undefined : Boolean(raw.headless);
			const result = await client.addToList(listName, handles, headless);
			printBatchResult(result, json, output);
		},

		remove: async (handle: string, listName: string, options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const headless =
				raw.headless === undefined ? undefined : Boolean(raw.headless);
			const result = await client.removeFromList(handle, listName, headless);
			printBatchResult(result, json, output);
		},

		batch: async (filePath: string, options: unknown) => {
			const raw = parseRawArgs(options);
			const json = parseJsonFlag(raw);
			const headless =
				raw.headless === undefined ? undefined : Boolean(raw.headless);
			const result = await client.batch(filePath, headless);
			printBatchResult(result, json, output);
		},
	};
}

export type CommandHandlers = ReturnType<typeof createHandlers>;
