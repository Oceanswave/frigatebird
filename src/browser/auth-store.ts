import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { type BrowserName, getCookies } from "@steipete/sweet-cookie";
import type { Cookie } from "playwright";
import type { CookieSource, GlobalOptions } from "../lib/types.js";

type SweetCookieBrowser = Exclude<CookieSource, "zen">;

interface PersistedAuth {
	cookies: Cookie[];
	source?: string;
	requestedSources?: CookieSource[];
	createdAt?: string;
	zenProfile?: string;
}

export interface ResolvedCookies {
	cookies: Cookie[];
	source: string;
	requestedSources?: CookieSource[];
	zenProfile?: string;
}

function isCookieSource(value: string): value is CookieSource {
	return (
		value === "chrome" ||
		value === "firefox" ||
		value === "safari" ||
		value === "edge" ||
		value === "zen"
	);
}

function parseSavedRequestedSources(
	value: unknown,
): CookieSource[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const sources: CookieSource[] = [];
	for (const item of value) {
		if (typeof item !== "string" || !isCookieSource(item)) return undefined;
		sources.push(item);
	}
	return sources.length > 0 ? sources : undefined;
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

// sweet-cookie's Gecko reader returns cookies.sqlite `expiry` unchanged.
// Firefox writes unix seconds; Zen writes unix milliseconds and is read
// through that same reader. Chrome and Edge already use normalizeExpiration:
// values above 1e13 are Chromium microseconds since 1601, values above 1e10
// are unix milliseconds, and smaller positive values are unix seconds.
const MILLISECOND_EPOCH_CUTOFF = 10_000_000_000;
const CHROMIUM_MICROSECOND_CUTOFF = 10_000_000_000_000;
const WINDOWS_EPOCH_OFFSET_SECONDS = 11_644_473_600;

export function normalizeCookieExpires(
	expires: number | null | undefined,
): number {
	if (expires == null) return -1;
	if (typeof expires !== "number" || !Number.isFinite(expires)) {
		throw new Error("Cookie expiry is not a finite number.");
	}
	if (expires <= 0) return -1;
	if (expires > CHROMIUM_MICROSECOND_CUTOFF) {
		return Math.round(expires / 1_000_000 - WINDOWS_EPOCH_OFFSET_SECONDS);
	}
	if (expires > MILLISECOND_EPOCH_CUTOFF) {
		return Math.round(expires / 1000);
	}
	return Math.round(expires);
}

function toPlaywrightCookie(cookie: {
	name: string;
	value: string;
	domain?: string;
	path?: string;
	expires?: number | null;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "Lax" | "Strict" | "None";
}): Cookie {
	return {
		name: cookie.name,
		value: cookie.value,
		domain: normalizeDomain(cookie.domain),
		path: cookie.path ?? "/",
		expires: normalizeCookieExpires(cookie.expires),
		httpOnly: cookie.httpOnly ?? false,
		secure: cookie.secure ?? true,
		sameSite: cookie.sameSite ?? "Lax",
	};
}

function mapSource(value: SweetCookieBrowser): BrowserName {
	return value;
}

function safeReaddir(dir: string): string[] {
	try {
		return fs
			.readdirSync(dir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.filter((name) => name !== "." && name !== "..");
	} catch {
		return [];
	}
}

function isDirectory(candidate: string): boolean {
	try {
		return fs.statSync(candidate).isDirectory();
	} catch {
		return false;
	}
}

function isFile(candidate: string): boolean {
	try {
		return fs.statSync(candidate).isFile();
	} catch {
		return false;
	}
}

function isUsableProfileDir(candidate: string): boolean {
	return (
		isDirectory(candidate) &&
		fs.existsSync(path.join(candidate, "cookies.sqlite"))
	);
}

function compareStrings(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

export function zenProfileSearchRoots(
	platform: NodeJS.Platform = process.platform,
	home: string = homedir(),
	appData: string | null = process.env.APPDATA ?? null,
): string[] {
	if (platform === "darwin") {
		return [
			path.join(home, "Library", "Application Support", "zen", "Profiles"),
		];
	}
	if (platform === "linux") {
		// Native tarball profiles live in ~/.zen. Flatpak id app.zen_browser.zen
		// persists ~/.zen via --persist=.zen. The install guide also documents
		// ~/.var/app/app.zen_browser.zen/zen.
		const flatpakRoot = path.join(home, ".var", "app", "app.zen_browser.zen");
		return [
			path.join(home, ".zen"),
			path.join(flatpakRoot, ".zen"),
			path.join(flatpakRoot, "zen"),
		];
	}
	if (platform === "win32") {
		return appData ? [path.join(appData, "zen", "Profiles")] : [];
	}
	return [];
}

function isExplicitZenPath(value: string): boolean {
	return (
		value === "~" ||
		value.startsWith("~/") ||
		value.startsWith("~\\") ||
		value.includes("/") ||
		value.includes("\\")
	);
}

function expandHome(value: string): string {
	if (value === "~") return homedir();
	if (value.startsWith("~/") || value.startsWith("~\\")) {
		return path.join(homedir(), value.slice(2));
	}
	return value;
}

interface IniInstall {
	defaultPath?: string;
}

interface IniProfile {
	name?: string;
	path?: string;
	isRelative: boolean;
	isDefault: boolean;
}

function parseProfilesIni(text: string): {
	installs: IniInstall[];
	profiles: IniProfile[];
} {
	const installs: IniInstall[] = [];
	const profiles: IniProfile[] = [];
	let section: "install" | "profile" | "other" = "other";
	let currentInstall: IniInstall | null = null;
	let currentProfile: IniProfile | null = null;

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#") || line.startsWith(";")) continue;
		const sectionMatch = /^\[(.+)]$/.exec(line);
		if (sectionMatch) {
			const header = sectionMatch[1] ?? "";
			if (header.startsWith("Install")) {
				section = "install";
				currentInstall = {};
				installs.push(currentInstall);
				currentProfile = null;
			} else if (header.startsWith("Profile")) {
				section = "profile";
				currentProfile = { isRelative: true, isDefault: false };
				profiles.push(currentProfile);
				currentInstall = null;
			} else {
				section = "other";
				currentInstall = null;
				currentProfile = null;
			}
			continue;
		}

		const separator = line.indexOf("=");
		if (separator === -1) continue;
		const key = line.slice(0, separator).trim();
		const value = line.slice(separator + 1).trim();
		if (section === "install" && currentInstall && key === "Default") {
			currentInstall.defaultPath = value;
		}
		if (section === "profile" && currentProfile) {
			if (key === "Name") currentProfile.name = value;
			if (key === "Path") currentProfile.path = value;
			if (key === "IsRelative") currentProfile.isRelative = value !== "0";
			if (key === "Default") currentProfile.isDefault = value === "1";
		}
	}

	return { installs, profiles };
}

function resolveProfilePath(
	installDir: string,
	profilePath: string,
	isRelative: boolean,
): string {
	if (!isRelative || path.isAbsolute(profilePath)) {
		return path.resolve(profilePath);
	}
	return path.resolve(installDir, profilePath);
}

function findProfilesIni(
	root: string,
): { iniPath: string; installDir: string } | null {
	const direct = path.join(root, "profiles.ini");
	if (isFile(direct)) return { iniPath: direct, installDir: root };
	if (path.basename(root).toLowerCase() === "profiles") {
		const parentIni = path.join(path.dirname(root), "profiles.ini");
		if (isFile(parentIni)) {
			return { iniPath: parentIni, installDir: path.dirname(root) };
		}
	}
	return null;
}

function fallbackProfileDirs(dirs: string[]): string[] {
	const matches: string[] = [];
	const seen = new Set<string>();
	for (const dir of dirs) {
		if (!isDirectory(dir)) continue;
		for (const name of safeReaddir(dir)) {
			const candidate = path.join(dir, name);
			if (!isUsableProfileDir(candidate) || seen.has(candidate)) continue;
			seen.add(candidate);
			matches.push(candidate);
		}
	}
	matches.sort((left, right) => {
		const byName = compareStrings(path.basename(left), path.basename(right));
		return byName === 0 ? compareStrings(left, right) : byName;
	});
	return matches;
}

function readProfilesIni(
	iniPath: string,
	diagnostics?: string[],
): { installs: IniInstall[]; profiles: IniProfile[] } {
	try {
		return parseProfilesIni(fs.readFileSync(iniPath, "utf8"));
	} catch (error) {
		diagnostics?.push(
			`Zen profiles.ini could not be read at ${iniPath}: ${formatError(error)}.`,
		);
		return { installs: [], profiles: [] };
	}
}

function resolveWithinRoot(
	root: string,
	profile?: string,
	diagnostics?: string[],
): string | null {
	if (!isDirectory(root)) return null;
	const ini = findProfilesIni(root);
	const installDir = ini?.installDir ?? root;
	const parsed = ini
		? readProfilesIni(ini.iniPath, diagnostics)
		: { installs: [], profiles: [] };
	const searchDirs = [
		...new Set([installDir, path.join(installDir, "Profiles"), root]),
	];

	if (profile) {
		const named =
			parsed.profiles.find((entry) => entry.name === profile) ??
			parsed.profiles.find((entry) => {
				if (!entry.path) return false;
				return entry.path === profile || path.basename(entry.path) === profile;
			});
		if (named?.path) {
			const candidate = resolveProfilePath(
				installDir,
				named.path,
				named.isRelative,
			);
			if (isUsableProfileDir(candidate)) return candidate;
		}
		for (const dir of searchDirs) {
			const candidate = path.join(dir, profile);
			if (isUsableProfileDir(candidate)) return candidate;
		}
		return null;
	}

	for (const install of parsed.installs) {
		if (!install.defaultPath) continue;
		const candidate = resolveProfilePath(installDir, install.defaultPath, true);
		if (isUsableProfileDir(candidate)) return candidate;
	}
	for (const entry of parsed.profiles) {
		if (!entry.isDefault || !entry.path) continue;
		const candidate = resolveProfilePath(
			installDir,
			entry.path,
			entry.isRelative,
		);
		if (isUsableProfileDir(candidate)) return candidate;
	}
	return fallbackProfileDirs(searchDirs)[0] ?? null;
}

export function resolveZenProfileDir(
	profile?: string,
	roots: readonly string[] = zenProfileSearchRoots(),
	diagnostics?: string[],
): string | null {
	const selector = profile?.trim();
	if (selector === "." || selector === "..") return null;
	if (selector && isExplicitZenPath(selector)) {
		const resolved = path.resolve(expandHome(selector));
		return isDirectory(resolved) ? resolved : null;
	}

	for (const root of roots) {
		const resolved = resolveWithinRoot(
			root,
			selector || undefined,
			diagnostics,
		);
		if (resolved) return resolved;
	}
	return null;
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
type ExtractedCookies = Awaited<ReturnType<CookieExtractor>>["cookies"];
type ExtractedCookie = ExtractedCookies[number];

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

			const requestedSources = parseSavedRequestedSources(
				parsed.requestedSources,
			);
			return {
				cookies: parsed.cookies,
				source: parsed.source ?? "auth.json",
				...(requestedSources ? { requestedSources } : {}),
				...(typeof parsed.zenProfile === "string" && parsed.zenProfile
					? { zenProfile: parsed.zenProfile }
					: {}),
			};
		} catch {
			return null;
		}
	}

	save(
		cookies: Cookie[],
		source: string,
		zenProfile?: string,
		requestedSources?: CookieSource[],
	): void {
		const payload: PersistedAuth = {
			cookies,
			source,
			createdAt: new Date().toISOString(),
			...(requestedSources && requestedSources.length > 0
				? { requestedSources }
				: {}),
			...(zenProfile ? { zenProfile } : {}),
		};

		fs.writeFileSync(this.authFile, JSON.stringify(payload, null, 2));
	}

	clear(): void {
		if (fs.existsSync(this.authFile)) {
			fs.unlinkSync(this.authFile);
		}
	}

	private cacheMismatchReason(
		saved: ResolvedCookies,
		options: GlobalOptions,
	): string | null {
		const requested = options.cookieSource;
		const savedRequest = saved.requestedSources;
		if (savedRequest && savedRequest.length > 0) {
			const sameRequest =
				savedRequest.length === requested.length &&
				savedRequest.every((value, index) => value === requested[index]);
			if (!sameRequest) {
				return `Cached auth source "${saved.source}" was ignored because --cookie-source was explicitly set to "${requested.join(",")}".`;
			}
			if (
				saved.source === "browser:zen" &&
				(saved.zenProfile ?? "") !== (options.zenProfile ?? "")
			) {
				return `Cached Zen profile "${saved.zenProfile ?? "default"}" was ignored because the requested Zen profile is "${options.zenProfile ?? "default"}".`;
			}
			return null;
		}

		// Caches written before requestedSources stored the request list in source.
		const savedBrowsers = parseBrowserSourceList(saved.source);
		if (!savedBrowsers) return null;
		const sourcesMatch =
			savedBrowsers.length === requested.length &&
			savedBrowsers.every((value, index) => value === requested[index]);
		if (!sourcesMatch) {
			return `Cached auth source "${saved.source}" was ignored because --cookie-source was explicitly set to "${requested.join(",")}".`;
		}
		if (
			savedBrowsers.includes("zen") &&
			(saved.zenProfile ?? "") !== (options.zenProfile ?? "")
		) {
			return `Cached Zen profile "${saved.zenProfile ?? "default"}" was ignored because the requested Zen profile is "${options.zenProfile ?? "default"}".`;
		}
		return null;
	}

	private appendWarnings(
		warnings: readonly string[] | undefined,
		diagnostics: string[],
	): void {
		if (!warnings) return;
		for (const warning of warnings) {
			if (warning) diagnostics.push(warning);
		}
	}

	private async extractSourceCookies(
		source: CookieSource,
		options: GlobalOptions,
		diagnostics: string[],
	): Promise<ExtractedCookies> {
		if (source === "zen") {
			const zenProfile = resolveZenProfileDir(
				options.zenProfile,
				undefined,
				diagnostics,
			);
			if (!zenProfile) {
				diagnostics.push(
					"Zen browser profile not found. Pass --zen-profile <name|path> or install Zen with at least one profile that contains cookies.sqlite.",
				);
				return [];
			}
			try {
				const extraction = await this.cookieExtractor({
					url: "https://x.com",
					browsers: ["firefox"],
					firefoxProfile: zenProfile,
					timeoutMs: options.cookieTimeout,
				});
				this.appendWarnings(extraction?.warnings, diagnostics);
				return extraction?.cookies ?? [];
			} catch (error) {
				diagnostics.push(
					`Zen cookie extraction failed: ${formatError(error)}.`,
				);
				return [];
			}
		}

		try {
			const extraction = await this.cookieExtractor({
				url: "https://x.com",
				browsers: [mapSource(source)],
				// sweet-cookie applies chromeProfile to Chrome only. Edge reads
				// edgeProfile or the generic profile alias, not chromeProfile.
				...(source === "chrome"
					? {
							chromeProfile: options.chromeProfileDir ?? options.chromeProfile,
						}
					: {}),
				...(source === "firefox"
					? { firefoxProfile: options.firefoxProfile }
					: {}),
				timeoutMs: options.cookieTimeout,
			});
			this.appendWarnings(extraction?.warnings, diagnostics);
			return extraction?.cookies ?? [];
		} catch (error) {
			diagnostics.push(
				`Browser cookie extraction failed: ${formatError(error)}.`,
			);
			if (source === "safari") {
				diagnostics.push(...this.diagnoseSafariCookieAccess());
			}
			return [];
		}
	}

	private cookiesFromPair(
		authToken: ExtractedCookie,
		ct0: ExtractedCookie,
	): Cookie[] {
		return [
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
	}

	async extractFromBrowser(
		options: GlobalOptions,
	): Promise<ResolvedCookies | null> {
		const diagnostics: string[] = [];
		let sawCookies = false;
		let sawIncompletePair = false;

		for (const source of options.cookieSource) {
			const cookies = await this.extractSourceCookies(
				source,
				options,
				diagnostics,
			);
			if (cookies.length > 0) sawCookies = true;
			const authToken = cookies.find((cookie) => cookie.name === "auth_token");
			const ct0 = cookies.find((cookie) => cookie.name === "ct0");
			if (!authToken || !ct0) {
				if (cookies.length > 0) sawIncompletePair = true;
				continue;
			}

			try {
				return {
					cookies: this.cookiesFromPair(authToken, ct0),
					source: `browser:${source}`,
					requestedSources: [...options.cookieSource],
					...(source === "zen" && options.zenProfile
						? { zenProfile: options.zenProfile }
						: {}),
				};
			} catch (error) {
				diagnostics.push(formatError(error));
			}
		}

		if (!sawCookies && diagnostics.length === 0) {
			diagnostics.push(
				`No cookies were extracted from sources: ${options.cookieSource.join(", ")}.`,
			);
		}
		if (!sawCookies && options.cookieSource.includes("safari")) {
			diagnostics.push(...this.diagnoseSafariCookieAccess());
		}
		if (sawIncompletePair) {
			diagnostics.push(
				"Cookies were extracted, but no single requested source had both auth_token and ct0 from the same source.",
			);
		}
		this.setDiagnostics(diagnostics);
		return null;
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
				const mismatch = options.cookieSourceExplicit
					? this.cacheMismatchReason(saved, options)
					: null;
				if (!mismatch) {
					return saved;
				}

				sourceOverrideNotes.push(mismatch);
				this.clear();
			}
		}

		const extracted = await this.extractFromBrowser(options);
		if (extracted) {
			this.setDiagnostics([]);
			this.save(
				extracted.cookies,
				extracted.source,
				extracted.zenProfile,
				extracted.requestedSources,
			);
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
