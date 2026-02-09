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
});
