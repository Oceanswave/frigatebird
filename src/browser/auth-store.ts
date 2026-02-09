import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { type BrowserName, getCookies } from "@steipete/sweet-cookie";
import type { Cookie } from "playwright";
import type { CookieSource, GlobalOptions } from "../lib/types.js";

interface PersistedAuth {
	cookies: Cookie[];
	source?: string;
	createdAt?: string;
}

export interface ResolvedCookies {
	cookies: Cookie[];
	source: string;
}

function parseBrowserSourceList(source: string): string[] | null {
	if (!source.startsWith("browser:")) return null;
	const suffix = source.slice("browser:".length).trim();
	if (!suffix) return null;
	return suffix
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

function normalizeDomain(domain?: string): string {
	if (!domain) return ".x.com";
	return domain.startsWith(".") ? domain : `.${domain}`;
}

function toPlaywrightCookie(cookie: {
	name: string;
	value: string;
	domain?: string;
	path?: string;
	expires?: number;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "Lax" | "Strict" | "None";
}): Cookie {
	return {
		name: cookie.name,
		value: cookie.value,
		domain: normalizeDomain(cookie.domain),
		path: cookie.path ?? "/",
		expires: cookie.expires ?? -1,
		httpOnly: cookie.httpOnly ?? false,
		secure: cookie.secure ?? true,
		sameSite: cookie.sameSite ?? "Lax",
	};
}

function mapSource(value: CookieSource): BrowserName {
	return value;
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

const SAFARI_COOKIE_STORE_PATH = path.join(
	homedir(),
	"Library",
	"Containers",
	"com.apple.Safari",
	"Data",
	"Library",
	"Cookies",
	"Cookies.binarycookies",
);

type CookieExtractor = typeof getCookies;

export class AuthStore {
	readonly authFile: string;
	private readonly cookieExtractor: CookieExtractor;
	private lastDiagnostics: string[] = [];

	constructor(
		authFile = path.join(process.cwd(), "auth.json"),
		cookieExtractor: CookieExtractor = getCookies,
	) {
		this.authFile = authFile;
		this.cookieExtractor = cookieExtractor;
	}

	getLastDiagnostics(): string[] {
		return [...this.lastDiagnostics];
	}

	private setDiagnostics(messages: string[]): void {
		this.lastDiagnostics = Array.from(new Set(messages.filter(Boolean)));
	}

	private diagnoseSafariCookieAccess(): string[] {
		if (process.platform !== "darwin") return [];
		if (!fs.existsSync(SAFARI_COOKIE_STORE_PATH)) {
			return [`Safari cookie store not found at ${SAFARI_COOKIE_STORE_PATH}.`];
		}

		try {
			const fileDescriptor = fs.openSync(SAFARI_COOKIE_STORE_PATH, "r");
			fs.closeSync(fileDescriptor);
			return [];
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code === "EPERM" || nodeError.code === "EACCES") {
				return [
					"Safari cookies are blocked by macOS privacy controls for this process. Grant Full Disk Access to your terminal/Codex app, then retry.",
				];
			}

			return [`Safari cookie store could not be read: ${formatError(error)}.`];
		}
	}

	loadFromDisk(): ResolvedCookies | null {
		if (!fs.existsSync(this.authFile)) return null;

		try {
			const parsed = JSON.parse(
				fs.readFileSync(this.authFile, "utf8"),
			) as PersistedAuth;
			if (!Array.isArray(parsed.cookies) || parsed.cookies.length === 0)
				return null;

			return {
				cookies: parsed.cookies,
				source: parsed.source ?? "auth.json",
			};
		} catch {
			return null;
		}
	}

	save(cookies: Cookie[], source: string): void {
		const payload: PersistedAuth = {
			cookies,
			source,
			createdAt: new Date().toISOString(),
		};

		fs.writeFileSync(this.authFile, JSON.stringify(payload, null, 2));
	}

	clear(): void {
		if (fs.existsSync(this.authFile)) {
			fs.unlinkSync(this.authFile);
		}
	}

	private isSavedSourceCompatible(
		source: string,
		options: GlobalOptions,
	): boolean {
		const savedBrowsers = parseBrowserSourceList(source);
		if (!savedBrowsers) return true;

		const requested = options.cookieSource;
		if (savedBrowsers.length !== requested.length) return false;
		return savedBrowsers.every((value, index) => value === requested[index]);
	}

	async extractFromBrowser(
		options: GlobalOptions,
	): Promise<ResolvedCookies | null> {
		const browsers = options.cookieSource.map(mapSource);
		let extraction: Awaited<ReturnType<CookieExtractor>> | null = null;

		try {
			extraction = await this.cookieExtractor({
				url: "https://x.com",
				browsers,
				chromeProfile: options.chromeProfileDir ?? options.chromeProfile,
				firefoxProfile: options.firefoxProfile,
				timeoutMs: options.cookieTimeout,
			});
		} catch (error) {
			const diagnostics = [
				`Browser cookie extraction failed: ${formatError(error)}.`,
			];
			if (options.cookieSource.includes("safari")) {
				diagnostics.push(...this.diagnoseSafariCookieAccess());
			}
			this.setDiagnostics(diagnostics);
			return null;
		}

		if (!extraction || extraction.cookies.length === 0) {
			const diagnostics = [
				`No cookies were extracted from sources: ${options.cookieSource.join(", ")}.`,
			];
			if (options.cookieSource.includes("safari")) {
				diagnostics.push(...this.diagnoseSafariCookieAccess());
			}
			this.setDiagnostics(diagnostics);
			return null;
		}

		const authToken = extraction.cookies.find(
			(cookie) => cookie.name === "auth_token",
		);
		const ct0 = extraction.cookies.find((cookie) => cookie.name === "ct0");

		if (!authToken || !ct0) {
			this.setDiagnostics([
				`Cookies were extracted, but required auth cookies are missing (auth_token=${Boolean(authToken)}, ct0=${Boolean(ct0)}).`,
			]);
			return null;
		}

		const playwrightCookies = [
			toPlaywrightCookie({
				name: "auth_token",
				value: authToken.value,
				domain: authToken.domain,
				path: authToken.path,
				expires: authToken.expires,
				httpOnly: true,
				secure: authToken.secure,
				sameSite: authToken.sameSite,
			}),
			toPlaywrightCookie({
				name: "ct0",
				value: ct0.value,
				domain: ct0.domain,
				path: ct0.path,
				expires: ct0.expires,
				httpOnly: ct0.httpOnly,
				secure: ct0.secure,
				sameSite: ct0.sameSite,
			}),
		];

		return {
			cookies: playwrightCookies,
			source: `browser:${options.cookieSource.join(",")}`,
		};
	}

	fromManualTokens(options: GlobalOptions): ResolvedCookies | null {
		if (!options.authToken || !options.ct0) return null;

		return {
			source: "manual-flags",
			cookies: [
				toPlaywrightCookie({
					name: "auth_token",
					value: options.authToken,
					domain: ".x.com",
					path: "/",
					httpOnly: true,
					secure: true,
					sameSite: "Lax",
				}),
				toPlaywrightCookie({
					name: "ct0",
					value: options.ct0,
					domain: ".x.com",
					path: "/",
					httpOnly: false,
					secure: true,
					sameSite: "Lax",
				}),
			],
		};
	}

	async resolve(
		options: GlobalOptions,
		forceRefresh = false,
	): Promise<ResolvedCookies | null> {
		this.setDiagnostics([]);
		const manual = this.fromManualTokens(options);
		if (manual) return manual;
		const sourceOverrideNotes: string[] = [];

		if (!forceRefresh) {
			const saved = this.loadFromDisk();
			if (saved) {
				if (
					!options.cookieSourceExplicit ||
					this.isSavedSourceCompatible(saved.source, options)
				) {
					return saved;
				}

				sourceOverrideNotes.push(
					`Cached auth source "${saved.source}" was ignored because --cookie-source was explicitly set to "${options.cookieSource.join(",")}".`,
				);
				this.clear();
			}
		}

		const extracted = await this.extractFromBrowser(options);
		if (extracted) {
			this.setDiagnostics([]);
			this.save(extracted.cookies, extracted.source);
			return extracted;
		}

		if (sourceOverrideNotes.length > 0) {
			this.setDiagnostics([
				...sourceOverrideNotes,
				...this.getLastDiagnostics(),
			]);
		}

		return null;
	}
}
