import {
	type BrowserContext,
	type Cookie,
	type Page,
	chromium,
} from "playwright";
import type { GlobalOptions } from "../lib/types.js";
import { AuthStore, type ResolvedCookies } from "./auth-store.js";

export interface SessionDetails {
	page: Page;
	context: BrowserContext;
	auth: ResolvedCookies | null;
}

const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const RESERVED_HANDLE_SEGMENTS = new Set([
	"compose",
	"download",
	"explore",
	"hashtag",
	"home",
	"i",
	"intent",
	"login",
	"logout",
	"messages",
	"notifications",
	"search",
	"settings",
	"signup",
	"tos",
]);

function normalizeHandleCandidate(
	value: string | null | undefined,
): string | null {
	if (!value) return null;

	const trimmed = value.trim();
	if (!trimmed) return null;

	const handleMatch = trimmed.match(/@([A-Za-z0-9_]{1,15})/);
	if (handleMatch?.[1]) return handleMatch[1];

	let segment = trimmed;
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		try {
			segment = new URL(trimmed).pathname;
		} catch {
			return null;
		}
	}

	if (segment.startsWith("/")) {
		segment = segment.replace(/^\/+/, "").split("/")[0] ?? "";
	}

	segment = segment.split("?")[0]?.split("#")[0]?.trim() ?? "";
	if (!segment) return null;
	if (segment.startsWith("@")) segment = segment.slice(1);
	if (!segment) return null;
	if (RESERVED_HANDLE_SEGMENTS.has(segment.toLowerCase())) return null;
	if (!HANDLE_PATTERN.test(segment)) return null;
	return segment;
}

function extractNameFromAccountText(value: string): string | undefined {
	const parts = value
		.split("\n")
		.map((item) => item.trim())
		.filter(Boolean);
	return parts.find((item) => !item.startsWith("@"));
}

export class BrowserSessionManager {
	constructor(private readonly authStore: AuthStore = new AuthStore()) {}

	getAuthStore(): AuthStore {
		return this.authStore;
	}

	async withSession<T>(
		options: GlobalOptions,
		task: (details: SessionDetails) => Promise<T>,
	): Promise<T> {
		const browser = await chromium.launch({ headless: options.headless });
		const context = await browser.newContext({
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
		});

		const auth = await this.authStore.resolve(options);
		if (auth?.cookies.length) {
			await context.addCookies(auth.cookies);
		}

		const page = await context.newPage();
		if (options.timeout) {
			page.setDefaultTimeout(options.timeout);
			page.setDefaultNavigationTimeout(options.timeout);
		}

		try {
			return await task({ page, context, auth });
		} finally {
			await browser.close();
		}
	}

	async refreshAuth(options: GlobalOptions): Promise<ResolvedCookies | null> {
		this.authStore.clear();
		return this.authStore.resolve(options, true);
	}

	async ensureLoggedIn(
		page: Page,
		baseUrl = "https://x.com",
	): Promise<boolean> {
		const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
		await page.goto(`${normalizedBaseUrl}/home`, {
			waitUntil: "domcontentloaded",
		});

		const loggedInSelectors = [
			'[data-testid="AppTabBar_Home_Link"]',
			'[data-testid="SideNav_AccountSwitcher_Button"]',
		];
		const loggedOutSelectors = [
			'[data-testid="loginButton"]',
			'[data-testid="login"]',
			'a[href="/i/flow/login"]',
		];

		for (const selector of loggedInSelectors) {
			if (
				await page
					.locator(selector)
					.first()
					.isVisible()
					.catch(() => false)
			) {
				return true;
			}
		}

		for (const selector of loggedOutSelectors) {
			if (
				await page
					.locator(selector)
					.first()
					.isVisible()
					.catch(() => false)
			) {
				return false;
			}
		}

		const url = page.url();
		return url.includes("/home") && !url.includes("/login");
	}

	async whoAmI(page: Page): Promise<{ handle?: string; name?: string }> {
		const profileSelectors = [
			'[data-testid="AppTabBar_Profile_Link"]',
			'a[data-testid$="_Profile_Link"]',
			'[data-testid="SideNav_AccountSwitcher_Button"] a[href]',
		];

		let handle: string | undefined;
		for (const selector of profileSelectors) {
			const href = await page.getAttribute(selector, "href").catch(() => null);
			const candidate = normalizeHandleCandidate(href);
			if (candidate) {
				handle = candidate;
				break;
			}
		}

		const accountSwitcherSelector =
			'[data-testid="SideNav_AccountSwitcher_Button"]';
		const accountText = await page
			.locator(accountSwitcherSelector)
			.first()
			.innerText()
			.catch(() => "");
		const accountAriaLabel = await page
			.getAttribute(accountSwitcherSelector, "aria-label")
			.catch(() => null);

		if (!handle) {
			handle =
				normalizeHandleCandidate(accountText) ??
				normalizeHandleCandidate(accountAriaLabel ?? "") ??
				undefined;
		}

		const name =
			extractNameFromAccountText(accountText) ??
			extractNameFromAccountText(accountAriaLabel ?? "");

		return { handle, name };
	}

	async createCookieProbe(options: GlobalOptions): Promise<{
		hasAuthToken: boolean;
		hasCt0: boolean;
		source: string;
		diagnostics?: string[];
	}> {
		const resolved = await this.authStore.resolve(options);
		const diagnostics = this.authStore.getLastDiagnostics();
		if (!resolved) {
			return {
				hasAuthToken: false,
				hasCt0: false,
				source: "none",
				diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
			};
		}

		return {
			hasAuthToken: resolved.cookies.some(
				(cookie: Cookie) => cookie.name === "auth_token",
			),
			hasCt0: resolved.cookies.some((cookie: Cookie) => cookie.name === "ct0"),
			source: resolved.source,
			diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
		};
	}
}
