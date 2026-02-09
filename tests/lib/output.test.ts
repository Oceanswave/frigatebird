import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Output } from "../../src/lib/output.js";

describe("output", () => {
	const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

	beforeEach(() => {
		logSpy.mockClear();
		warnSpy.mockClear();
		errorSpy.mockClear();
	});

	afterEach(() => {
		logSpy.mockClear();
		warnSpy.mockClear();
		errorSpy.mockClear();
	});

	it("prints basic streams", () => {
		const out = new Output({ plain: true, color: false, emoji: false });
		out.info("hello");
		out.warn("warn");
		out.error("err");

		expect(logSpy).toHaveBeenCalledWith("hello");
		expect(warnSpy).toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalled();
	});

	it("prints mutations", () => {
		const out = new Output({ plain: true, color: false, emoji: false });
		out.mutation({ ok: true, message: "ok" });
		out.mutation({ ok: false, message: "nope" });

		expect(logSpy).toHaveBeenCalledWith("ok");
		expect(logSpy).toHaveBeenCalledWith("nope");
	});

	it("prints empty and non-empty tweet collections", () => {
		const out = new Output({ plain: true, color: false, emoji: false });
		out.tweets({ items: [], pagesFetched: 1 });
		out.tweets({
			items: [
				{
					id: "1",
					text: "tweet text",
					url: "https://x.com/i/web/status/1",
					authorName: "Alice",
					authorHandle: "alice",
					createdAt: "2026-01-01T00:00:00.000Z",
				},
			],
			pagesFetched: 1,
			nextCursor: "abc",
		});

		expect(logSpy).toHaveBeenCalledWith("No tweets found.");
		expect(logSpy).toHaveBeenCalledWith("next_cursor: abc");
	});

	it("prints user collections", () => {
		const out = new Output({ plain: true, color: false, emoji: false });
		out.users({ items: [], pagesFetched: 1 });
		out.users({
			items: [
				{ name: "Bob", handle: "bob", bio: "bio", url: "https://x.com/bob" },
			],
			pagesFetched: 1,
		});

		expect(logSpy).toHaveBeenCalledWith("No users found.");
		expect(logSpy).toHaveBeenCalledWith("Bob (@bob)");
	});

	it("prints list collections", () => {
		const out = new Output({ plain: true, color: false, emoji: false });
		out.lists({ items: [], pagesFetched: 1 });
		out.lists({
			items: [
				{
					id: "1",
					name: "List",
					description: "desc",
					memberCount: 2,
					subscriberCount: 5,
					url: "https://x.com/i/lists/1",
				},
			],
			pagesFetched: 1,
		});

		expect(logSpy).toHaveBeenCalledWith("No lists found.");
		expect(logSpy).toHaveBeenCalledWith("List (1)");
	});

	it("prints profile/news/query id outputs", () => {
		const out = new Output({ plain: true, color: false, emoji: false });
		out.profile({
			name: "Alice",
			handle: "alice",
			id: "1",
			bio: "bio",
			location: "Earth",
			joined: "2020",
			website: "https://example.com",
			verified: true,
		});

		out.news({
			items: [
				{
					id: "n1",
					headline: "Headline",
					sourceTab: "news",
					category: "Category",
					summary: "Summary",
					url: "https://x.com/x",
					relatedTweets: [{ id: "1", text: "tweet", url: "https://x.com/t" }],
				},
			],
			pagesFetched: 1,
		});

		out.queryIds({
			mode: "playwright",
			refreshed: true,
			note: "note",
			timestamp: "now",
		});

		expect(logSpy).toHaveBeenCalledWith("Alice");
		expect(logSpy).toHaveBeenCalledWith("Headline [news]");
		expect(logSpy).toHaveBeenCalledWith("Query IDs Compatibility");
	});

	it("prints json payloads", () => {
		const out = new Output({ plain: true, color: false, emoji: false });
		out.json({ ok: true });
		expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ ok: true }, null, 2));
	});
});
