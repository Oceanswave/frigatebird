import { describe, expect, it } from "vitest";
import { normalizeInvocation } from "../../src/lib/invocation.js";

describe("invocation normalization", () => {
	it("passes through known commands", () => {
		expect(normalizeInvocation(["search", "hello"])).toEqual([
			"search",
			"hello",
		]);
		expect(normalizeInvocation(["article", "Title", "Body"])).toEqual([
			"article",
			"Title",
			"Body",
		]);
	});

	it("rewrites tweet id invocation to read command", () => {
		expect(normalizeInvocation(["1234567890123456789"])).toEqual([
			"read",
			"1234567890123456789",
		]);
	});

	it("rewrites tweet url invocation to read command", () => {
		expect(
			normalizeInvocation([
				"https://x.com/user/status/1234567890123456789",
				"--json",
			]),
		).toEqual([
			"read",
			"https://x.com/user/status/1234567890123456789",
			"--json",
		]);
	});

	it("does not rewrite unknown non tweet args", () => {
		expect(normalizeInvocation(["not-a-command"])).toEqual(["not-a-command"]);
	});
});
