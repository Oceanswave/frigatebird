import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FrigatebirdClient } from "../../src/client/client.js";
import { createHandlers } from "../../src/commands/handlers.js";
import type { Output } from "../../src/lib/output.js";

function mockClient(): FrigatebirdClient {
	return {
		check: vi.fn(async () => ({
			loggedIn: true,
			source: "test",
			hasAuthToken: true,
			hasCt0: true,
			authFile: "/tmp/auth.json",
		})),
		whoami: vi.fn(async () => ({ handle: "tester", name: "Tester" })),
		tweet: vi.fn(async () => ({ ok: true, message: "Tweet posted." })),
		publishArticle: vi.fn(async () => ({
			ok: true,
			message: "Article published.",
		})),
		reply: vi.fn(async () => ({ ok: true, message: "Reply posted." })),
		like: vi.fn(async () => ({ ok: true, message: "Tweet liked." })),
		retweet: vi.fn(async () => ({ ok: true, message: "Tweet reposted." })),
		read: vi.fn(async () => ({
			id: "1",
			text: "tweet",
			url: "https://x.com/i/web/status/1",
		})),
		thread: vi.fn(async () => ({ items: [], pagesFetched: 1 })),
		replies: vi.fn(async () => ({ items: [], pagesFetched: 1 })),
		search: vi.fn(async () => ({ items: [], pagesFetched: 1 })),
		mentions: vi.fn(async () => ({ items: [], pagesFetched: 1 })),
		userTweets: vi.fn(async () => ({ items: [], pagesFetched: 1 })),
		home: vi.fn(async () => ({ items: [], pagesFetched: 1 })),
		bookmarks: vi.fn(async () => ({ items: [], pagesFetched: 1 })),
		unbookmark: vi.fn(async () => ({
			ok: true,
			added: 0,
			already: 0,
			removed: 1,
			errors: 0,
			details: [],
		})),
		likes: vi.fn(async () => ({ items: [], pagesFetched: 1 })),
		follow: vi.fn(async () => ({ ok: true, message: "Followed" })),
		unfollow: vi.fn(async () => ({ ok: true, message: "Unfollowed" })),
		following: vi.fn(async () => ({ items: [], pagesFetched: 1 })),
		followers: vi.fn(async () => ({ items: [], pagesFetched: 1 })),
		lists: vi.fn(async () => ({ items: [], pagesFetched: 1 })),
		listTimeline: vi.fn(async () => ({ items: [], pagesFetched: 1 })),
		news: vi.fn(async () => ({ items: [], pagesFetched: 1 })),
		about: vi.fn(async () => ({ handle: "tester" })),
		queryIds: vi.fn(async () => ({
			mode: "playwright",
			refreshed: false,
			note: "n",
			timestamp: "t",
		})),
		refresh: vi.fn(async () => ({
			loggedIn: true,
			source: "browser",
			hasAuthToken: true,
			hasCt0: true,
			authFile: "/tmp/auth.json",
		})),
		addToList: vi.fn(async () => ({
			ok: true,
			added: 1,
			already: 0,
			removed: 0,
			errors: 0,
			details: [],
		})),
		removeFromList: vi.fn(async () => ({
			ok: true,
			added: 0,
			already: 0,
			removed: 1,
			errors: 0,
			details: [],
		})),
		batch: vi.fn(async () => ({
			ok: true,
			added: 2,
			already: 0,
			removed: 0,
			errors: 0,
			details: [],
		})),
	};
}

function mockOutput(): Output {
	return {
		warn: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
		json: vi.fn(),
		mutation: vi.fn(),
		tweets: vi.fn(),
		users: vi.fn(),
		lists: vi.fn(),
		profile: vi.fn(),
		news: vi.fn(),
		queryIds: vi.fn(),
	} as unknown as Output;
}

describe("command handlers", () => {
	let client: FrigatebirdClient;
	let output: Output;

	beforeEach(() => {
		client = mockClient();
		output = mockOutput();
	});

	it("routes read command with --json to output.json", async () => {
		const handlers = createHandlers({ client, output });
		await handlers.read("1234567890123456789", { json: true });

		expect(client.read).toHaveBeenCalledWith("1234567890123456789");
		expect(output.json).toHaveBeenCalled();
	});

	it("parses search count option", async () => {
		const handlers = createHandlers({ client, output });
		await handlers.search("hello", { count: "7" });

		expect(client.search).toHaveBeenCalledWith(
			"hello",
			expect.objectContaining({ count: 7 }),
		);
	});

	it("parses mentions user option", async () => {
		const handlers = createHandlers({ client, output });
		await handlers.mentions({ user: "@jack", count: "2" });

		expect(client.mentions).toHaveBeenCalledWith({ user: "@jack", count: 2 });
	});

	it("publishes article body from file", async () => {
		const handlers = createHandlers({ client, output });
		const bodyFile = path.join(
			os.tmpdir(),
			`frigatebird-article-body-${Date.now()}.md`,
		);
		fs.writeFileSync(bodyFile, "Body from file");

		await handlers.article("Article title", undefined, { bodyFile });

		expect(client.publishArticle).toHaveBeenCalledWith(
			"Article title",
			"Body from file",
		);
		fs.unlinkSync(bodyFile);
	});

	it("throws when article body is missing", async () => {
		const handlers = createHandlers({ client, output });
		await expect(
			handlers.article("Article title", undefined, {}),
		).rejects.toThrow("Article body is required");
	});

	it("throws when article body file is empty", async () => {
		const handlers = createHandlers({ client, output });
		const bodyFile = path.join(
			os.tmpdir(),
			`frigatebird-article-empty-${Date.now()}.md`,
		);
		fs.writeFileSync(bodyFile, "   \n");

		await expect(
			handlers.article("Article title", undefined, { bodyFile }),
		).rejects.toThrow("Article body file is empty");
		fs.unlinkSync(bodyFile);
	});

	it("passes add command headless override", async () => {
		const handlers = createHandlers({ client, output });
		await handlers.add("Cool List", ["@a", "@b"], { headless: false });

		expect(client.addToList).toHaveBeenCalledWith(
			"Cool List",
			["@a", "@b"],
			false,
		);
	});

	it("prints query id compatibility output", async () => {
		const handlers = createHandlers({ client, output });
		await handlers.queryIds({});

		expect(client.queryIds).toHaveBeenCalledWith(false);
		expect(output.queryIds).toHaveBeenCalled();
	});

	it("prints bookmark collections in text mode", async () => {
		const handlers = createHandlers({ client, output });
		await handlers.bookmarks({ count: "3" });

		expect(client.bookmarks).toHaveBeenCalledWith(
			expect.objectContaining({ count: 3 }),
		);
		expect(output.tweets).toHaveBeenCalled();
	});

	it("prints unbookmark in json mode", async () => {
		const handlers = createHandlers({ client, output });
		await handlers.unbookmark(["123"], { json: true });

		expect(client.unbookmark).toHaveBeenCalledWith(["123"]);
		expect(output.json).toHaveBeenCalled();
	});

	it("prints following users in text mode", async () => {
		const handlers = createHandlers({ client, output });
		await handlers.following({ count: "5" });

		expect(client.following).toHaveBeenCalledWith(
			expect.objectContaining({ count: 5 }),
		);
		expect(output.users).toHaveBeenCalled();
	});

	it("prints refresh in json mode", async () => {
		const handlers = createHandlers({ client, output });
		await handlers.refresh({ json: true });

		expect(client.refresh).toHaveBeenCalled();
		expect(output.json).toHaveBeenCalled();
	});

	it("prints auth diagnostics as warnings", async () => {
		(client.check as ReturnType<typeof vi.fn>).mockResolvedValue({
			loggedIn: false,
			source: "none",
			hasAuthToken: false,
			hasCt0: false,
			authFile: "/tmp/auth.json",
			diagnostics: ["Safari cookies are blocked."],
		});
		(client.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({
			loggedIn: false,
			source: "none",
			hasAuthToken: false,
			hasCt0: false,
			authFile: "/tmp/auth.json",
			diagnostics: ["No cookies were extracted."],
		});

		const handlers = createHandlers({ client, output });
		await handlers.check();
		await handlers.refresh({});

		expect(output.warn).toHaveBeenCalledWith("Safari cookies are blocked.");
		expect(output.warn).toHaveBeenCalledWith("No cookies were extracted.");
	});

	it("covers all handler routes", async () => {
		const handlers = createHandlers({ client, output });

		await handlers.check();
		await handlers.whoami({});
		await handlers.tweet("hello");
		await handlers.article("title", "body", {});
		await handlers.reply("123", "reply");
		await handlers.like("123");
		await handlers.retweet("123");
		await handlers.read("123", {});
		await handlers.replies("123", {});
		await handlers.thread("123", {});
		await handlers.search("query", {});
		await handlers.mentions({});
		await handlers.userTweets("@u", {});
		await handlers.home({});
		await handlers.bookmarks({});
		await handlers.unbookmark(["123"], {});
		await handlers.likes({});
		await handlers.lists({});
		await handlers.listTimeline("1", {});
		await handlers.follow("@x");
		await handlers.unfollow("@x");
		await handlers.following({});
		await handlers.followers({});
		await handlers.about("@x", {});
		await handlers.news({});
		await handlers.queryIds({ fresh: true });
		await handlers.refresh({});
		await handlers.add("L", ["@a"], {});
		await handlers.remove("@a", "L", {});
		await handlers.batch("/tmp/a.json", {});

		expect(client.check).toHaveBeenCalled();
		expect(client.tweet).toHaveBeenCalledWith("hello");
		expect(client.publishArticle).toHaveBeenCalledWith("title", "body");
		expect(client.reply).toHaveBeenCalledWith("123", "reply");
		expect(client.listTimeline).toHaveBeenCalledWith("1", expect.any(Object));
		expect(client.batch).toHaveBeenCalledWith("/tmp/a.json", undefined);
	});
});
