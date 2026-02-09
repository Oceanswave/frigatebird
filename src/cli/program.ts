import { Command } from "commander";
import type { CommandHandlers } from "../commands/handlers.js";

function collect(value: string, previous: string[] = []): string[] {
	previous.push(value);
	return previous;
}

export function registerGlobalOptions(program: Command): Command {
	return program
		.option("--auth-token <token>", "Twitter auth_token cookie")
		.option("--ct0 <token>", "Twitter ct0 cookie")
		.option("--base-url <url>", "Override X base URL (for testing)")
		.option(
			"--chrome-profile <name>",
			"Chrome profile name for cookie extraction",
		)
		.option(
			"--chrome-profile-dir <path>",
			"Chrome/Chromium profile directory or cookie DB path for cookie extraction",
		)
		.option(
			"--firefox-profile <name>",
			"Firefox profile name for cookie extraction",
		)
		.option(
			"--cookie-timeout <ms>",
			"Cookie extraction timeout in milliseconds",
		)
		.option(
			"--cookie-source <source>",
			"Cookie source for browser extraction (repeatable)",
			collect,
		)
		.option("--media <path>", "Attach media file path (repeatable)", collect)
		.option(
			"--alt <text>",
			"Alt text for corresponding --media item (repeatable)",
			collect,
		)
		.option("--timeout <ms>", "Operation timeout in milliseconds")
		.option("--quote-depth <n>", "Quoted tweet depth (compatibility option)")
		.option("--plain", "Plain output (no emoji or color)")
		.option("--no-emoji", "Disable emoji output")
		.option("--no-color", "Disable ANSI colors")
		.option("--no-headless", "Run browser in headed mode");
}

function run<TArgs extends unknown[]>(
	action: (...args: TArgs) => Promise<void>,
) {
	return (...args: TArgs) => {
		action(...args).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			console.error(message);
			process.exitCode = 1;
		});
	};
}

export function createProgram(
	handlers: CommandHandlers,
	version = "0.2.0",
): Command {
	const program = new Command();

	program
		.name("frigatebird")
		.description(
			"Playwright-powered CLI with bird + x-list-manager command parity",
		)
		.version(version)
		.showHelpAfterError("(run with --help for usage)");
	registerGlobalOptions(program);

	program
		.command("tweet <text>")
		.description("Post a new tweet")
		.action(run((text: string) => handlers.tweet(text)));

	program
		.command("post <text>")
		.description("Alias for tweet")
		.action(run((text: string) => handlers.tweet(text)));

	program
		.command("article <title> [body]")
		.description("Publish a long-form article on X")
		.option("--body-file <path>", "Read article body text from a UTF-8 file")
		.action(
			run((title: string, body: string | undefined, options: unknown) =>
				handlers.article(title, body, options),
			),
		);

	program
		.command("reply <tweet-id-or-url> <text>")
		.description("Reply to a tweet")
		.action(
			run((tweetRef: string, text: string) => handlers.reply(tweetRef, text)),
		);

	program
		.command("read <tweet-id-or-url>")
		.description("Read a single tweet")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(
			run((tweetRef: string, options: unknown) =>
				handlers.read(tweetRef, options),
			),
		);

	program
		.command("replies <tweet-id-or-url>")
		.description("List replies to a tweet")
		.option("--all", "Fetch additional timeline pages")
		.option("--max-pages <number>", "Stop after N pages")
		.option("--delay <ms>", "Delay between pagination scrolls", "1000")
		.option("--cursor <string>", "Cursor to resume from (compatibility option)")
		.option("-n, --count <number>", "Number of tweets to return", "20")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(
			run((tweetRef: string, options: unknown) =>
				handlers.replies(tweetRef, options),
			),
		);

	program
		.command("thread <tweet-id-or-url>")
		.description("Show tweets from a thread/conversation")
		.option("--all", "Fetch additional timeline pages")
		.option("--max-pages <number>", "Stop after N pages")
		.option("--delay <ms>", "Delay between pagination scrolls", "1000")
		.option("--cursor <string>", "Cursor to resume from (compatibility option)")
		.option("-n, --count <number>", "Number of tweets to return", "20")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(
			run((tweetRef: string, options: unknown) =>
				handlers.thread(tweetRef, options),
			),
		);

	program
		.command("search <query>")
		.description("Search tweets")
		.option("-n, --count <number>", "Number of tweets to return", "10")
		.option("--all", "Fetch additional timeline pages")
		.option("--max-pages <number>", "Stop after N pages")
		.option("--cursor <string>", "Cursor to resume from (compatibility option)")
		.option("--delay <ms>", "Delay between pagination scrolls", "800")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(
			run((query: string, options: unknown) => handlers.search(query, options)),
		);

	program
		.command("mentions")
		.description("List mention tweets")
		.option(
			"-u, --user <handle>",
			"Handle to search mentions for (default: notifications/mentions)",
		)
		.option("-n, --count <number>", "Number of tweets to return", "10")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(run((options: unknown) => handlers.mentions(options)));

	program
		.command("user-tweets <handle>")
		.description("Read tweets from a user profile")
		.option("-n, --count <number>", "Number of tweets to return", "20")
		.option("--max-pages <number>", "Stop after N pages")
		.option("--all", "Fetch additional timeline pages")
		.option("--delay <ms>", "Delay between pagination scrolls", "1000")
		.option("--cursor <string>", "Cursor to resume from (compatibility option)")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(
			run((handle: string, options: unknown) =>
				handlers.userTweets(handle, options),
			),
		);

	program
		.command("home")
		.description("Read your home timeline")
		.option("-n, --count <number>", "Number of tweets to return", "20")
		.option("--following", "Use Following feed instead of For You")
		.option("--all", "Fetch additional timeline pages")
		.option("--max-pages <number>", "Stop after N pages")
		.option("--delay <ms>", "Delay between pagination scrolls", "800")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(run((options: unknown) => handlers.home(options)));

	program
		.command("bookmarks")
		.description("List bookmarked tweets")
		.option("-n, --count <number>", "Number of bookmarks to fetch", "20")
		.option("--folder-id <id>", "Bookmark folder/collection id")
		.option("--all", "Fetch additional pages")
		.option("--max-pages <number>", "Stop after N pages")
		.option("--cursor <string>", "Cursor to resume from (compatibility option)")
		.option("--expand-root-only", "Compatibility flag")
		.option("--author-chain", "Compatibility flag")
		.option("--author-only", "Compatibility flag")
		.option("--full-chain-only", "Compatibility flag")
		.option("--include-ancestor-branches", "Compatibility flag")
		.option("--include-parent", "Compatibility flag")
		.option("--thread-meta", "Compatibility flag")
		.option("--sort-chronological", "Sort oldest to newest")
		.option("--delay <ms>", "Delay between pagination scrolls", "800")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(run((options: unknown) => handlers.bookmarks(options)));

	program
		.command("unbookmark <tweet-id-or-url...>")
		.description("Remove one or more bookmarks")
		.option("--json", "Output as JSON")
		.action(
			run((tweetRefs: string[], options: unknown) =>
				handlers.unbookmark(tweetRefs, options),
			),
		);

	program
		.command("like <tweet-id-or-url>")
		.description("Like a tweet (legacy compatibility)")
		.action(run((tweetRef: string) => handlers.like(tweetRef)));

	program
		.command("retweet <tweet-id-or-url>")
		.description("Repost a tweet (legacy compatibility)")
		.action(run((tweetRef: string) => handlers.retweet(tweetRef)));

	program
		.command("likes")
		.description("List liked tweets")
		.option("-n, --count <number>", "Number of liked tweets to fetch", "20")
		.option("--all", "Fetch additional pages")
		.option("--max-pages <number>", "Stop after N pages")
		.option("--cursor <string>", "Cursor to resume from (compatibility option)")
		.option("--delay <ms>", "Delay between pagination scrolls", "800")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(run((options: unknown) => handlers.likes(options)));

	program
		.command("follow <username-or-id>")
		.description("Follow a user")
		.action(run((userRef: string) => handlers.follow(userRef)));

	program
		.command("unfollow <username-or-id>")
		.description("Unfollow a user")
		.action(run((userRef: string) => handlers.unfollow(userRef)));

	program
		.command("following")
		.description("List accounts followed by a user")
		.option("--user <userId>", "Target user ID (default: current account)")
		.option("-n, --count <number>", "Number of users to fetch", "20")
		.option("--cursor <string>", "Cursor to resume from (compatibility option)")
		.option("--all", "Fetch additional pages")
		.option("--max-pages <number>", "Stop after N pages")
		.option("--delay <ms>", "Delay between pagination scrolls", "800")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(run((options: unknown) => handlers.following(options)));

	program
		.command("followers")
		.description("List followers for a user")
		.option("--user <userId>", "Target user ID (default: current account)")
		.option("-n, --count <number>", "Number of users to fetch", "20")
		.option("--cursor <string>", "Cursor to resume from (compatibility option)")
		.option("--all", "Fetch additional pages")
		.option("--max-pages <number>", "Stop after N pages")
		.option("--delay <ms>", "Delay between pagination scrolls", "800")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(run((options: unknown) => handlers.followers(options)));

	program
		.command("lists")
		.description("List your lists")
		.option("--member-of", "Show lists where you are a member")
		.option("-n, --count <number>", "Number of lists to fetch", "100")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(run((options: unknown) => handlers.lists(options)));

	program
		.command("list")
		.description("Alias for lists")
		.option("--member-of", "Show lists where you are a member")
		.option("-n, --count <number>", "Number of lists to fetch", "100")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(run((options: unknown) => handlers.lists(options)));

	program
		.command("list-timeline <list-id-or-url>")
		.description("Read tweets from a list timeline")
		.option("-n, --count <number>", "Number of tweets to fetch", "20")
		.option("--all", "Fetch additional pages")
		.option("--max-pages <number>", "Stop after N pages")
		.option("--cursor <string>", "Cursor to resume from (compatibility option)")
		.option("--delay <ms>", "Delay between pagination scrolls", "800")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(
			run((listRef: string, options: unknown) =>
				handlers.listTimeline(listRef, options),
			),
		);

	program
		.command("news")
		.alias("trending")
		.description("Fetch news/trending topics from Explore tabs")
		.option("-n, --count <number>", "Number of items to fetch", "10")
		.option("--ai-only", "Only include AI-curated style items")
		.option("--with-tweets", "Fetch related tweets per item")
		.option(
			"--tweets-per-item <number>",
			"Number of related tweets per item",
			"5",
		)
		.option("--for-you", "For You tab only")
		.option("--news-only", "News tab only")
		.option("--sports", "Sports tab only")
		.option("--entertainment", "Entertainment tab only")
		.option("--trending-only", "Trending tab only")
		.option("--json", "Output as JSON")
		.option("--json-full", "Include raw response payload where available")
		.action(run((options: unknown) => handlers.news(options)));

	program
		.command("about <username>")
		.description("Fetch account origin/profile context")
		.option("--json", "Output as JSON")
		.action(
			run((handle: string, options: unknown) =>
				handlers.about(handle, options),
			),
		);

	program
		.command("whoami")
		.description("Show account associated with loaded cookies")
		.option("--json", "Output as JSON")
		.action(run((options: unknown) => handlers.whoami(options)));

	program
		.command("query-ids")
		.description("Inspect query ID state (compatibility command)")
		.option("--fresh", "Force refresh behavior (compatibility flag)")
		.option("--json", "Output as JSON")
		.action(run((options: unknown) => handlers.queryIds(options)));

	program
		.command("check")
		.description("Check authentication state")
		.action(run(() => handlers.check()));

	program
		.command("refresh")
		.description("Refresh local auth cookie cache from browser profiles")
		.option("--json", "Output as JSON")
		.action(run((options: unknown) => handlers.refresh(options)));

	program
		.command("add <listName> <handles...>")
		.description("Add one or more handles to an X list (x-list-manager parity)")
		.option("--no-headless", "Run browser in headed mode")
		.option("--json", "Output as JSON")
		.action(
			run((listName: string, handles: string[], options: unknown) =>
				handlers.add(listName, handles, options),
			),
		);

	program
		.command("remove <handle> <listName>")
		.description("Remove a handle from an X list (x-list-manager parity)")
		.option("--no-headless", "Run browser in headed mode")
		.option("--json", "Output as JSON")
		.action(
			run((handle: string, listName: string, options: unknown) =>
				handlers.remove(handle, listName, options),
			),
		);

	program
		.command("batch <file>")
		.description(
			"Batch add list memberships from JSON file (x-list-manager parity)",
		)
		.option("--no-headless", "Run browser in headed mode")
		.option("--json", "Output as JSON")
		.action(
			run((file: string, options: unknown) => handlers.batch(file, options)),
		);

	program
		.command("help [command]")
		.description("Show help for command")
		.action((command?: string) => {
			if (command) {
				const cmd = program.commands.find(
					(item) => item.name() === command || item.aliases().includes(command),
				);
				if (cmd) {
					cmd.outputHelp();
					return;
				}
			}
			program.outputHelp();
		});

	return program;
}
