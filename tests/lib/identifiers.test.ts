import { describe, expect, it } from "vitest";
import {
	asProfileUrl,
	extractListId,
	extractTweetId,
	looksLikeTweetReference,
	normalizeHandle,
	resolveListUrl,
	resolveTweetUrl,
} from "../../src/lib/identifiers.js";

describe("identifiers", () => {
	it("normalizes handles", () => {
		expect(normalizeHandle("@@jack")).toBe("jack");
		expect(normalizeHandle("alice")).toBe("alice");
	});

	it("extracts tweet ids from ids and urls", () => {
		expect(extractTweetId("1234567890123456789")).toBe("1234567890123456789");
		expect(
			extractTweetId("https://x.com/someone/status/1234567890123456789"),
		).toBe("1234567890123456789");
		expect(extractTweetId("invalid")).toBeNull();
	});

	it("extracts list ids from ids and urls", () => {
		expect(extractListId("1234567890")).toBe("1234567890");
		expect(extractListId("https://x.com/i/lists/1234567890")).toBe(
			"1234567890",
		);
		expect(extractListId("nope")).toBeNull();
	});

	it("resolves tweet and list urls", () => {
		expect(resolveTweetUrl("1234567890123456789")).toBe(
			"https://x.com/i/web/status/1234567890123456789",
		);
		expect(resolveListUrl("1234567890")).toBe(
			"https://x.com/i/lists/1234567890",
		);
		expect(resolveTweetUrl("https://x.com/u/status/1")).toBe(
			"https://x.com/u/status/1",
		);
		expect(resolveListUrl("https://x.com/i/lists/1")).toBe(
			"https://x.com/i/lists/1",
		);

		expect(
			resolveTweetUrl("1234567890123456789", "http://localhost:3100"),
		).toBe("http://localhost:3100/i/web/status/1234567890123456789");
		expect(resolveListUrl("1234567890", "http://localhost:3100")).toBe(
			"http://localhost:3100/i/lists/1234567890",
		);
	});

	it("detects tweet-like references", () => {
		expect(looksLikeTweetReference("1234567890123456789")).toBe(true);
		expect(
			looksLikeTweetReference("https://x.com/u/status/1234567890123456789"),
		).toBe(true);
		expect(looksLikeTweetReference("lists")).toBe(false);
	});

	it("builds profile urls from handles and ids", () => {
		expect(asProfileUrl("@jack")).toBe("https://x.com/jack");
		expect(asProfileUrl("12345")).toBe("https://x.com/i/user/12345");
		expect(asProfileUrl("@jack", "http://localhost:3100")).toBe(
			"http://localhost:3100/jack",
		);
	});
});
