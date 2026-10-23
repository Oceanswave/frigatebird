import { describe, expect, it, vi } from "vitest";
import { createProgram } from "../../src/cli/program.js";
import type { CommandHandlers } from "../../src/commands/handlers.js";

function createHandlerStubs() {
	return {
		check: vi.fn(async () => {}),
		whoami: vi.fn(async () => {}),
		tweet: vi.fn(async () => {}),
		article: vi.fn(async () => {}),
		reply: vi.fn(async () => {}),
		like: vi.fn(async () => {}),
		retweet: vi.fn(async () => {}),
		read: vi.fn(async () => {}),
		replies: vi.fn(async () => {}),
		thread: vi.fn(async () => {}),
		search: vi.fn(async () => {}),
		mentions: vi.fn(async () => {}),
		userTweets: vi.fn(async () => {}),
		home: vi.fn(async () => {}),
		bookmarks: vi.fn(async () => {}),
		unbookmark: vi.fn(async () => {}),
		likes: vi.fn(async () => {}),
		lists: vi.fn(async () => {}),
		listTimeline: vi.fn(async () => {}),
		follow: vi.fn(async () => {}),
		unfollow: vi.fn(async () => {}),
		following: vi.fn(async () => {}),
		followers: vi.fn(async () => {}),
		about: vi.fn(async () => {}),
		news: vi.fn(async () => {}),
		queryIds: vi.fn(async () => {}),
		refresh: vi.fn(async () => {}),
		add: vi.fn(async () => {}),
		remove: vi.fn(async () => {}),
		batch: vi.fn(async () => {}),
	};
}

describe("program", () => {
	it("registers expected command surface", () => {
		const handlers = createHandlerStubs() as unknown as CommandHandlers;
		const program = createProgram(handlers, "1.2.3");

		const names = program.commands.map((command) => command.name()).sort();

		expect(names).toEqual(
			[
				"about",
				"add",
				"article",
				"batch",
				"bookmarks",
				"check",
				"follow",
				"followers",
				"following",
				"help",
				"home",
				"like",
				"likes",
				"list",
				"list-timeline",
				"lists",
				"mentions",
				"news",
				"post",
				"query-ids",
				"read",
				"refresh",
				"remove",
				"replies",
				"reply",
				"retweet",
				"search",
				"thread",
				"tweet",
				"unbookmark",
				"unfollow",
				"user-tweets",
				"whoami",
			].sort(),
		);

		expect(
			program.commands.find((command) => command.name() === "news")?.aliases(),
		).toContain("trending");
	});

	it("keeps bookmark and list-manager compatibility flags", () => {
		const handlers = createHandlerStubs() as unknown as CommandHandlers;
		const program = createProgram(handlers, "1.2.3");

		const bookmarkOptions =
			program.commands
				.find((command) => command.name() === "bookmarks")
				?.options.map((option) => option.long) ?? [];

		expect(bookmarkOptions).toEqual(
			expect.arrayContaining([
				"--expand-root-only",
				"--author-chain",
				"--author-only",
				"--full-chain-only",
				"--include-ancestor-branches",
				"--include-parent",
				"--thread-meta",
				"--sort-chronological",
			]),
		);

		const addOptions =
			program.commands
				.find((command) => command.name() === "add")
				?.options.map((option) => option.long) ?? [];

		expect(addOptions).toEqual(
			expect.arrayContaining(["--no-headless", "--json"]),
		);
	});

	it("routes command actions to handlers", async () => {
		const handlers = createHandlerStubs() as unknown as CommandHandlers;
		const program = createProgram(handlers, "1.2.3");

		await program.parseAsync(["node", "frigatebird", "tweet", "hello"]);
		expect(handlers.tweet).toHaveBeenCalledWith("hello");

		await program.parseAsync([
			"node",
			"frigatebird",
			"article",
			"Test title",
			"Body text",
		]);
		expect(handlers.article).toHaveBeenCalledWith(
			"Test title",
			"Body text",
			expect.any(Object),
		);

		await program.parseAsync([
			"node",
			"frigatebird",
			"article",
			"File title",
			"--body-file",
			"/tmp/body.md",
		]);
		expect(handlers.article).toHaveBeenCalledWith(
			"File title",
			undefined,
			expect.objectContaining({ bodyFile: "/tmp/body.md" }),
		);

		await program.parseAsync([
			"node",
			"frigatebird",
			"reply",
			"1234567890123456789",
			"yo",
		]);
		expect(handlers.reply).toHaveBeenCalledWith("1234567890123456789", "yo");
	});

	it.each([
		{ argv: ["post", "hi"], handler: "tweet", args: ["hi"] },
		{
			argv: ["read", "123", "--json"],
			handler: "read",
			args: ["123", { json: true }],
		},
		{
			argv: ["replies", "123"],
			handler: "replies",
			args: ["123", expect.objectContaining({ count: "20" })],
		},
		{
			argv: ["thread", "123"],
			handler: "thread",
			args: ["123", expect.objectContaining({ delay: "1000" })],
		},
		{
			argv: ["search", "cats", "-n", "5"],
			handler: "search",
			args: ["cats", expect.objectContaining({ count: "5" })],
		},
		{
			argv: ["mentions", "-u", "alice"],
			handler: "mentions",
			args: [expect.objectContaining({ user: "alice" })],
		},
		{
			argv: ["user-tweets", "alice"],
			handler: "userTweets",
			args: ["alice", expect.any(Object)],
		},
		{
			argv: ["home", "--following"],
			handler: "home",
			args: [expect.objectContaining({ following: true })],
		},
		{
			argv: ["bookmarks", "--folder-id", "42"],
			handler: "bookmarks",
			args: [expect.objectContaining({ folderId: "42" })],
		},
		{
			argv: ["unbookmark", "1", "2"],
			handler: "unbookmark",
			args: [["1", "2"], expect.any(Object)],
		},
		{ argv: ["like", "123"], handler: "like", args: ["123"] },
		{ argv: ["retweet", "123"], handler: "retweet", args: ["123"] },
		{
			argv: ["likes"],
			handler: "likes",
			args: [expect.objectContaining({ count: "20" })],
		},
		{ argv: ["follow", "alice"], handler: "follow", args: ["alice"] },
		{ argv: ["unfollow", "alice"], handler: "unfollow", args: ["alice"] },
		{
			argv: ["following", "--user", "99"],
			handler: "following",
			args: [expect.objectContaining({ user: "99" })],
		},
		{
			argv: ["followers", "--all"],
			handler: "followers",
			args: [expect.objectContaining({ all: true })],
		},
		{
			argv: ["lists", "--member-of"],
			handler: "lists",
			args: [expect.objectContaining({ memberOf: true })],
		},
		{
			argv: ["list"],
			handler: "lists",
			args: [expect.objectContaining({ count: "100" })],
		},
		{
			argv: ["list-timeline", "77"],
			handler: "listTimeline",
			args: ["77", expect.any(Object)],
		},
		{
			argv: ["trending", "--ai-only"],
			handler: "news",
			args: [expect.objectContaining({ aiOnly: true })],
		},
		{
			argv: ["about", "alice"],
			handler: "about",
			args: ["alice", expect.any(Object)],
		},
		{ argv: ["whoami", "--json"], handler: "whoami", args: [{ json: true }] },
		{
			argv: ["query-ids", "--fresh"],
			handler: "queryIds",
			args: [{ fresh: true }],
		},
		{ argv: ["check"], handler: "check", args: [] },
		{ argv: ["refresh"], handler: "refresh", args: [{}] },
		{
			argv: ["add", "Friends", "alice", "bob"],
			handler: "add",
			args: [
				"Friends",
				["alice", "bob"],
				expect.objectContaining({ headless: true }),
			],
		},
		{
			argv: ["remove", "alice", "Friends"],
			handler: "remove",
			args: ["alice", "Friends", expect.any(Object)],
		},
		{
			argv: ["batch", "lists.json"],
			handler: "batch",
			args: ["lists.json", expect.any(Object)],
		},
	])("routes $argv.0 to handlers.$handler", async ({ argv, handler, args }) => {
		const handlers = createHandlerStubs();
		const program = createProgram(handlers as unknown as CommandHandlers);

		await program.parseAsync(["node", "frigatebird", ...argv]);

		expect(handlers[handler as keyof typeof handlers]).toHaveBeenCalledWith(
			...args,
		);
	});

	it("reports handler failures on stderr and sets a failing exit code", async () => {
		const handlers = createHandlerStubs();
		handlers.tweet.mockRejectedValueOnce(new Error("composer missing"));
		handlers.like.mockRejectedValueOnce("plain failure");
		const program = createProgram(handlers as unknown as CommandHandlers);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			await program.parseAsync(["node", "frigatebird", "tweet", "hello"]);
			await program.parseAsync(["node", "frigatebird", "like", "123"]);
			await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(2));

			expect(errorSpy).toHaveBeenNthCalledWith(1, "composer missing");
			expect(errorSpy).toHaveBeenNthCalledWith(2, "plain failure");
			expect(process.exitCode).toBe(1);
		} finally {
			errorSpy.mockRestore();
			process.exitCode = undefined;
		}
	});

	it("prints help for a named command, an alias, or the whole program", async () => {
		const program = createProgram(
			createHandlerStubs() as unknown as CommandHandlers,
		);
		const news = program.commands.find((command) => command.name() === "news");
		const newsHelp = vi.spyOn(news as NonNullable<typeof news>, "outputHelp");
		const programHelp = vi
			.spyOn(program, "outputHelp")
			.mockImplementation(() => {});
		newsHelp.mockImplementation(() => {});

		await program.parseAsync(["node", "frigatebird", "help", "trending"]);
		expect(newsHelp).toHaveBeenCalledTimes(1);

		await program.parseAsync(["node", "frigatebird", "help", "nope"]);
		await program.parseAsync(["node", "frigatebird", "help"]);
		expect(programHelp).toHaveBeenCalledTimes(2);
	});
});
