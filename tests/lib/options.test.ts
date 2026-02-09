import { describe, expect, it } from "vitest";
import {
	parseBookmarkOptions,
	parseFollowListOptions,
	parseGlobalOptions,
	parseNewsOptions,
	parsePaginationOptions,
	validateMediaOptions,
} from "../../src/lib/options.js";

describe("options parser", () => {
	it("parses global defaults", () => {
		const parsed = parseGlobalOptions({});
		expect(parsed.cookieSource).toEqual(["chrome", "safari", "firefox"]);
		expect(parsed.headless).toBe(true);
		expect(parsed.media).toEqual([]);
		expect(parsed.alt).toEqual([]);
	});

	it("parses explicit global values", () => {
		const parsed = parseGlobalOptions({
			cookieSource: ["firefox", "chrome"],
			cookieSourceExplicit: true,
			compatJson: true,
			headless: false,
			media: ["a.png", "b.png"],
			alt: "desc",
			timeout: "5000",
		});

		expect(parsed.cookieSource).toEqual(["firefox", "chrome"]);
		expect(parsed.cookieSourceExplicit).toBe(true);
		expect(parsed.compatJson).toBe(true);
		expect(parsed.headless).toBe(false);
		expect(parsed.media).toEqual(["a.png", "b.png"]);
		expect(parsed.alt).toEqual(["desc"]);
		expect(parsed.timeout).toBe(5000);
	});

	it("throws on invalid cookie source", () => {
		expect(() => parseGlobalOptions({ cookieSource: ["bad"] })).toThrow(
			/Invalid cookie source/,
		);
	});

	it("enables pagination all mode when maxPages is provided", () => {
		const parsed = parsePaginationOptions(
			{ count: "7", maxPages: "3" },
			{ count: 10 },
		);
		expect(parsed.count).toBe(7);
		expect(parsed.maxPages).toBe(3);
		expect(parsed.all).toBe(true);
	});

	it("parses bookmark compatibility flags", () => {
		const parsed = parseBookmarkOptions({
			authorOnly: true,
			includeParent: true,
			sortChronological: true,
			count: "25",
		});

		expect(parsed.authorOnly).toBe(true);
		expect(parsed.includeParent).toBe(true);
		expect(parsed.sortChronological).toBe(true);
		expect(parsed.count).toBe(25);
	});

	it("parses follow list options", () => {
		const parsed = parseFollowListOptions({
			user: "12345",
			count: "17",
			all: true,
		});
		expect(parsed.userId).toBe("12345");
		expect(parsed.count).toBe(17);
		expect(parsed.all).toBe(true);
	});

	it("parses news tabs with defaults", () => {
		const defaults = parseNewsOptions({});
		expect(defaults.tabs).toEqual([
			"for_you",
			"news",
			"sports",
			"entertainment",
		]);

		const explicit = parseNewsOptions({
			forYou: true,
			sports: true,
			count: "2",
		});
		expect(explicit.tabs).toEqual(["for_you", "sports"]);
		expect(explicit.count).toBe(2);
	});

	it("returns media warnings for invalid media/alt combinations", () => {
		const warnings = validateMediaOptions(["1", "2"], ["a", "b", "c"]);
		expect(warnings.length).toBe(1);
	});
});
