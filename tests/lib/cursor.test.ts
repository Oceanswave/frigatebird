import { describe, expect, it } from "vitest";
import {
	decodeOffsetCursor,
	encodeOffsetCursor,
} from "../../src/lib/cursor.js";

describe("cursor helpers", () => {
	it("encodes and decodes offset cursors", () => {
		const encoded = encodeOffsetCursor(42);
		expect(typeof encoded).toBe("string");
		expect(decodeOffsetCursor(encoded)).toBe(42);
	});

	it("rejects invalid offsets", () => {
		expect(() => encodeOffsetCursor(-1)).toThrow(
			"Cursor offset must be a non-negative integer.",
		);
		expect(() => encodeOffsetCursor(1.5)).toThrow(
			"Cursor offset must be a non-negative integer.",
		);
	});

	it("rejects malformed cursor tokens", () => {
		expect(() => decodeOffsetCursor("")).toThrow("Invalid cursor");
		expect(() => decodeOffsetCursor("not-a-cursor")).toThrow("Invalid cursor");
	});
});
