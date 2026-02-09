import { looksLikeTweetReference } from "./identifiers.js";

export const KNOWN_COMMANDS = new Set([
	"tweet",
	"post",
	"article",
	"reply",
	"read",
	"replies",
	"thread",
	"search",
	"mentions",
	"bookmarks",
	"unbookmark",
	"like",
	"retweet",
	"follow",
	"unfollow",
	"following",
	"followers",
	"likes",
	"lists",
	"list",
	"list-timeline",
	"home",
	"user-tweets",
	"news",
	"trending",
	"query-ids",
	"about",
	"whoami",
	"check",
	"refresh",
	"add",
	"remove",
	"batch",
	"help",
]);

export function normalizeInvocation(args: string[]): string[] {
	if (args.length === 0) return args;

	const [first] = args;
	if (KNOWN_COMMANDS.has(first)) return args;
	if (first.startsWith("-")) return args;

	if (looksLikeTweetReference(first)) {
		return ["read", ...args];
	}

	return args;
}
