interface OffsetCursorPayload {
	v: 1;
	kind: "offset";
	offset: number;
}

function encodePayload(payload: OffsetCursorPayload): string {
	return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(cursor: string): OffsetCursorPayload {
	let parsed: unknown;
	try {
		const json = Buffer.from(cursor, "base64url").toString("utf8");
		parsed = JSON.parse(json);
	} catch {
		throw new Error(
			"Invalid cursor. Expected a frigatebird pagination cursor token.",
		);
	}

	if (!parsed || typeof parsed !== "object") {
		throw new Error(
			"Invalid cursor. Expected a frigatebird pagination cursor token.",
		);
	}

	const payload = parsed as Partial<OffsetCursorPayload>;
	if (payload.v !== 1 || payload.kind !== "offset") {
		throw new Error(
			"Invalid cursor. Unsupported cursor version or cursor type.",
		);
	}

	if (
		typeof payload.offset !== "number" ||
		!Number.isFinite(payload.offset) ||
		payload.offset < 0 ||
		!Number.isInteger(payload.offset)
	) {
		throw new Error(
			"Invalid cursor. Cursor offset must be a non-negative integer.",
		);
	}

	return payload as OffsetCursorPayload;
}

export function encodeOffsetCursor(offset: number): string {
	if (!Number.isInteger(offset) || offset < 0) {
		throw new Error("Cursor offset must be a non-negative integer.");
	}
	return encodePayload({ v: 1, kind: "offset", offset });
}

export function decodeOffsetCursor(cursor: string): number {
	const trimmed = cursor.trim();
	if (!trimmed) {
		throw new Error(
			"Invalid cursor. Expected a frigatebird pagination cursor token.",
		);
	}
	return decodePayload(trimmed).offset;
}
