const TWEET_ID_PATTERN = /^\d{8,25}$/;
const LIST_ID_PATTERN = /^\d{6,25}$/;
const DEFAULT_BASE_URL = "https://x.com";

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, "");
}

export function normalizeHandle(value: string): string {
	return value.replace(/^@+/, "").trim();
}

export function isTweetId(value: string): boolean {
	return TWEET_ID_PATTERN.test(value.trim());
}

export function isListId(value: string): boolean {
	return LIST_ID_PATTERN.test(value.trim());
}

export function extractTweetId(value: string): string | null {
	const trimmed = value.trim();
	if (isTweetId(trimmed)) return trimmed;

	const match = trimmed.match(/\/status\/(\d{8,25})/i);
	return match?.[1] ?? null;
}

export function extractListId(value: string): string | null {
	const trimmed = value.trim();
	if (isListId(trimmed)) return trimmed;

	const match = trimmed.match(/\/i\/lists\/(\d{6,25})/i);
	return match?.[1] ?? null;
}

export function resolveTweetUrl(
	value: string,
	baseUrl = DEFAULT_BASE_URL,
): string | null {
	const trimmed = value.trim();
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		return trimmed;
	}

	const id = extractTweetId(trimmed);
	if (!id) return null;
	return `${normalizeBaseUrl(baseUrl)}/i/web/status/${id}`;
}

export function resolveListUrl(
	value: string,
	baseUrl = DEFAULT_BASE_URL,
): string | null {
	const trimmed = value.trim();
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		return trimmed;
	}

	const id = extractListId(trimmed);
	if (!id) return null;
	return `${normalizeBaseUrl(baseUrl)}/i/lists/${id}`;
}

export function looksLikeTweetReference(value: string): boolean {
	return resolveTweetUrl(value) !== null;
}

export function asProfileUrl(
	handleOrId: string,
	baseUrl = DEFAULT_BASE_URL,
): string {
	const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
	const value = handleOrId.trim();
	if (/^\d+$/.test(value)) {
		return `${normalizedBaseUrl}/i/user/${value}`;
	}

	return `${normalizedBaseUrl}/${normalizeHandle(value)}`;
}
