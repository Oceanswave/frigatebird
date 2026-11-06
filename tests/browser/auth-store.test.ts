import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	AuthStore,
	resolveZenProfileDir,
	zenProfileSearchRoots,
} from "../../src/browser/auth-store.js";
import type { GlobalOptions } from "../../src/lib/types.js";

function makeCookie(name: string, value: string) {
	return {
		name,
		value,
		domain: ".x.com",
		path: "/",
		expires: -1,
		httpOnly: name === "auth_token",
		secure: true,
		sameSite: "Lax" as const,
	};
}

function baseOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
	return {
		cookieSource: ["safari"],
		cookieSourceExplicit: false,
		media: [],
		alt: [],
		headless: true,
		...overrides,
	};
}

describe("AuthStore", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps saved cookies when cookie source is not explicitly set", async () => {
		const tmpFile = path.join(
			os.tmpdir(),
			`frigatebird-auth-${Date.now()}-a.json`,
		);
		const store = new AuthStore(tmpFile);
		store.save(
			[makeCookie("auth_token", "a"), makeCookie("ct0", "b")],
			"browser:chrome",
		);

		const extractSpy = vi
			.spyOn(
				store as unknown as {
					extractFromBrowser: (o: GlobalOptions) => Promise<unknown>;
				},
				"extractFromBrowser",
			)
			.mockResolvedValue(null);

		const resolved = await store.resolve(
			baseOptions({ cookieSource: ["safari"] }),
		);
		expect(resolved?.source).toBe("browser:chrome");
		expect(extractSpy).not.toHaveBeenCalled();
		expect(fs.existsSync(tmpFile)).toBe(true);
	});

	it("replaces saved cookies when explicit --cookie-source differs", async () => {
		const tmpFile = path.join(
			os.tmpdir(),
			`frigatebird-auth-${Date.now()}-b.json`,
		);
		const store = new AuthStore(tmpFile);
		store.save(
			[makeCookie("auth_token", "a"), makeCookie("ct0", "b")],
			"browser:chrome",
		);

		vi.spyOn(
			store as unknown as {
				extractFromBrowser: (o: GlobalOptions) => Promise<{
					cookies: ReturnType<typeof makeCookie>[];
					source: string;
				} | null>;
			},
			"extractFromBrowser",
		).mockResolvedValue({
			cookies: [makeCookie("auth_token", "new-a"), makeCookie("ct0", "new-b")],
			source: "browser:safari",
		});

		const resolved = await store.resolve(
			baseOptions({ cookieSource: ["safari"], cookieSourceExplicit: true }),
		);

		expect(resolved?.source).toBe("browser:safari");
		const saved = store.loadFromDisk();
		expect(saved?.source).toBe("browser:safari");
	});

	it("clears stale auth and returns null when explicit source replacement fails", async () => {
		const tmpFile = path.join(
			os.tmpdir(),
			`frigatebird-auth-${Date.now()}-c.json`,
		);
		const store = new AuthStore(tmpFile);
		store.save(
			[makeCookie("auth_token", "a"), makeCookie("ct0", "b")],
			"browser:chrome",
		);

		vi.spyOn(
			store as unknown as {
				extractFromBrowser: (o: GlobalOptions) => Promise<unknown>;
			},
			"extractFromBrowser",
		).mockResolvedValue(null);

		const resolved = await store.resolve(
			baseOptions({ cookieSource: ["safari"], cookieSourceExplicit: true }),
		);

		expect(resolved).toBeNull();
		expect(fs.existsSync(tmpFile)).toBe(false);
	});

	it("keeps saved auth when explicit source matches", async () => {
		const tmpFile = path.join(
			os.tmpdir(),
			`frigatebird-auth-${Date.now()}-d.json`,
		);
		const store = new AuthStore(tmpFile);
		store.save(
			[makeCookie("auth_token", "a"), makeCookie("ct0", "b")],
			"browser:safari",
		);

		const extractSpy = vi
			.spyOn(
				store as unknown as {
					extractFromBrowser: (o: GlobalOptions) => Promise<unknown>;
				},
				"extractFromBrowser",
			)
			.mockResolvedValue(null);

		const resolved = await store.resolve(
			baseOptions({ cookieSource: ["safari"], cookieSourceExplicit: true }),
		);

		expect(resolved?.source).toBe("browser:safari");
		expect(extractSpy).not.toHaveBeenCalled();
	});

	it("records diagnostics when Safari extraction returns no cookies", async () => {
		const tmpFile = path.join(
			os.tmpdir(),
			`frigatebird-auth-${Date.now()}-e.json`,
		);
		const store = new AuthStore(
			tmpFile,
			vi.fn(async () => ({ cookies: [] }) as any),
		);

		const diagnostics = await (async () => {
			await store.extractFromBrowser(baseOptions({ cookieSource: ["safari"] }));
			return store.getLastDiagnostics();
		})();

		expect(diagnostics.join(" ")).toContain("No cookies were extracted");
	});

	it("routes zen cookie source through the firefox extractor with the zen profile", async () => {
		const tmpFile = path.join(
			os.tmpdir(),
			`frigatebird-auth-${Date.now()}-zen.json`,
		);
		const zenProfile = fs.mkdtempSync(
			path.join(os.tmpdir(), "frigatebird-zen-"),
		);
		const extractor = vi.fn(async (opts: { browsers?: string[] }) => {
			if (opts.browsers?.[0] === "firefox") {
				return {
					cookies: [
						{
							name: "auth_token",
							value: "zen-a",
							domain: ".x.com",
							path: "/",
							secure: true,
							httpOnly: true,
							sameSite: "Lax",
						},
						{
							name: "ct0",
							value: "zen-c",
							domain: ".x.com",
							path: "/",
							secure: true,
							sameSite: "Lax",
						},
					],
					warnings: [],
				};
			}
			return { cookies: [], warnings: [] };
		});

		const store = new AuthStore(tmpFile, extractor as any);
		const resolved = await store.extractFromBrowser(
			baseOptions({
				cookieSource: ["zen"],
				cookieSourceExplicit: true,
				zenProfile,
			}),
		);

		try {
			expect(resolved?.source).toBe("browser:zen");
			expect(resolved?.cookies.map((c) => c.value)).toEqual(["zen-a", "zen-c"]);
			expect(extractor).toHaveBeenCalledTimes(1);
			expect(extractor).toHaveBeenCalledWith(
				expect.objectContaining({
					browsers: ["firefox"],
					firefoxProfile: zenProfile,
				}),
			);
		} finally {
			fs.rmSync(zenProfile, { recursive: true, force: true });
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});
});

function writeCookiesDb(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "cookies.sqlite"), "");
}

function extractedPair(
	tag: string,
	expires: number | null | undefined = undefined,
) {
	return [
		{
			name: "auth_token",
			value: `${tag}-auth`,
			domain: ".x.com",
			path: "/",
			expires,
			secure: true,
			httpOnly: true,
			sameSite: "Lax" as const,
		},
		{
			name: "ct0",
			value: `${tag}-ct0`,
			domain: ".x.com",
			path: "/",
			expires,
			secure: true,
			httpOnly: false,
			sameSite: "Lax" as const,
		},
	];
}

describe("Zen profile discovery", () => {
	const cleanups: string[] = [];

	afterEach(() => {
		for (const dir of cleanups.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function tempRoot(prefix: string): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
		cleanups.push(dir);
		return dir;
	}

	it("uses Install Default, then Profile Default=1, and skips directories without cookies.sqlite", () => {
		const root = tempRoot("frigatebird-zen-ini-");
		writeCookiesDb(path.join(root, "abcd.default-release"));
		writeCookiesDb(path.join(root, "daily"));
		fs.mkdirSync(path.join(root, "Crash Reports"));
		fs.writeFileSync(
			path.join(root, "profiles.ini"),
			[
				"[InstallHASH]",
				"Default=daily",
				"",
				"[Profile0]",
				"Name=default-release",
				"IsRelative=1",
				"Path=abcd.default-release",
				"Default=1",
				"",
			].join("\n"),
		);

		expect(resolveZenProfileDir(undefined, [root])).toBe(
			path.join(root, "daily"),
		);
	});

	it("falls through an invalid Install Default to the Default=1 profile", () => {
		const root = tempRoot("frigatebird-zen-default-");
		writeCookiesDb(path.join(root, "daily"));
		writeCookiesDb(path.join(root, "xxxx.default-release"));
		fs.writeFileSync(
			path.join(root, "profiles.ini"),
			[
				"[InstallHASH]",
				"Default=missing-dir",
				"",
				"[Profile0]",
				"Name=Daily",
				"IsRelative=1",
				"Path=daily",
				"Default=1",
				"",
			].join("\n"),
		);

		expect(resolveZenProfileDir(undefined, [root])).toBe(
			path.join(root, "daily"),
		);
	});

	it("resolves a display name and an absolute IsRelative=0 path", () => {
		const root = tempRoot("frigatebird-zen-name-");
		const outside = tempRoot("frigatebird-zen-abs-");
		writeCookiesDb(path.join(root, "abc123"));
		writeCookiesDb(outside);
		fs.writeFileSync(
			path.join(root, "profiles.ini"),
			[
				"[Profile0]",
				"Name=Personal",
				"IsRelative=1",
				"Path=abc123",
				"",
				"[Profile1]",
				"Name=Abs",
				"IsRelative=0",
				`Path=${outside}`,
				"Default=1",
				"",
			].join("\n"),
		);

		expect(resolveZenProfileDir("Personal", [root])).toBe(
			path.join(root, "abc123"),
		);
		expect(resolveZenProfileDir(undefined, [root])).toBe(outside);
	});

	it("uses a sorted cookies.sqlite directory when profiles.ini has no usable default", () => {
		const root = tempRoot("frigatebird-zen-sort-");
		fs.mkdirSync(path.join(root, "default"));
		fs.mkdirSync(path.join(root, "Crash Reports"));
		writeCookiesDb(path.join(root, "zzz"));
		writeCookiesDb(path.join(root, "alpha"));

		expect(resolveZenProfileDir(undefined, [root])).toBe(
			path.join(root, "alpha"),
		);
	});

	it("continues from an empty native root to the next root", () => {
		const native = tempRoot("frigatebird-zen-native-");
		const flatpak = tempRoot("frigatebird-zen-flatpak-");
		fs.mkdirSync(path.join(native, "Crash Reports"));
		fs.mkdirSync(path.join(native, "default"));
		writeCookiesDb(path.join(flatpak, "flatpak.default-release"));
		fs.writeFileSync(
			path.join(flatpak, "profiles.ini"),
			["[InstallHASH]", "Default=flatpak.default-release", ""].join("\n"),
		);

		expect(resolveZenProfileDir(undefined, [native, flatpak])).toBe(
			path.join(flatpak, "flatpak.default-release"),
		);
	});

	it("reads profiles.ini from the parent of a Profiles directory", () => {
		const install = tempRoot("frigatebird-zen-mac-");
		const profiles = path.join(install, "Profiles");
		fs.mkdirSync(path.join(profiles, "default"), { recursive: true });
		writeCookiesDb(path.join(profiles, "abcd"));
		fs.writeFileSync(
			path.join(install, "profiles.ini"),
			["[InstallHASH]", "Default=Profiles/abcd", ""].join("\n"),
		);

		expect(resolveZenProfileDir(undefined, [profiles])).toBe(
			path.join(profiles, "abcd"),
		);
	});

	it("rejects dot profile names and file paths, and expands tilde and relative paths", () => {
		const root = tempRoot("frigatebird-zen-explicit-");
		writeCookiesDb(path.join(root, "alpha"));
		const filePath = path.join(root, "cookies.sqlite");
		const homeProfile = fs.mkdtempSync(
			path.join(os.homedir(), "frigatebird-zen-tilde-"),
		);
		cleanups.push(homeProfile);
		const relativeDir = tempRoot("frigatebird-zen-rel-");
		fs.mkdirSync(path.join(relativeDir, "nested"));

		expect(resolveZenProfileDir(".", [root])).toBeNull();
		expect(resolveZenProfileDir("..", [root])).toBeNull();
		expect(resolveZenProfileDir(filePath, [root])).toBeNull();
		expect(
			resolveZenProfileDir(`~/${path.basename(homeProfile)}`, [root]),
		).toBe(homeProfile);
		expect(
			resolveZenProfileDir(path.relative(process.cwd(), relativeDir), [root]),
		).toBe(path.resolve(relativeDir));
	});

	it("falls back to a profile directory when profiles.ini cannot be read", () => {
		const native = tempRoot("frigatebird-zen-unreadable-");
		const flatpak = tempRoot("frigatebird-zen-unreadable-next-");
		fs.writeFileSync(path.join(native, "profiles.ini"), "Default=missing\n");
		fs.mkdirSync(path.join(native, "Crash Reports"));
		writeCookiesDb(path.join(native, "alpha"));
		fs.writeFileSync(path.join(flatpak, "profiles.ini"), "Default=other\n");
		writeCookiesDb(path.join(flatpak, "other"));
		const diagnostics: string[] = [];
		const spy = vi.spyOn(fs, "readFileSync").mockImplementation(() => {
			throw new Error("EACCES: permission denied");
		});

		try {
			expect(resolveZenProfileDir(undefined, [native], diagnostics)).toBe(
				path.join(native, "alpha"),
			);
			diagnostics.length = 0;
			fs.rmSync(path.join(native, "alpha"), { recursive: true, force: true });
			expect(
				resolveZenProfileDir(undefined, [native, flatpak], diagnostics),
			).toBe(path.join(flatpak, "other"));
			expect(diagnostics.join(" ")).toContain("profiles.ini");
			expect(diagnostics.join(" ")).toContain("EACCES");
		} finally {
			spy.mockRestore();
		}
	});

	it("lists native then Flatpak roots, and macOS and Windows defaults", () => {
		const home = "/home/example";
		expect(zenProfileSearchRoots("linux", home)).toEqual([
			path.join(home, ".zen"),
			path.join(home, ".var", "app", "app.zen_browser.zen", ".zen"),
			path.join(home, ".var", "app", "app.zen_browser.zen", "zen"),
		]);
		expect(zenProfileSearchRoots("darwin", home)).toEqual([
			path.join(home, "Library", "Application Support", "zen", "Profiles"),
		]);
		expect(
			zenProfileSearchRoots(
				"win32",
				home,
				"C:\\Users\\example\\AppData\\Roaming",
			),
		).toEqual([
			path.join("C:\\Users\\example\\AppData\\Roaming", "zen", "Profiles"),
		]);
		expect(zenProfileSearchRoots("win32", home, null)).toEqual([]);
	});
});

describe("cookie source pairing and expiry", () => {
	const cleanups: string[] = [];

	afterEach(() => {
		for (const dir of cleanups.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
		vi.restoreAllMocks();
	});

	function tempFile(): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frigatebird-auth-"));
		cleanups.push(dir);
		return path.join(dir, "auth.json");
	}

	function zenDir(): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frigatebird-zen-dir-"));
		cleanups.push(dir);
		return dir;
	}

	it("does not mix auth_token and ct0 from different sources", async () => {
		const profile = zenDir();
		const extractor = vi.fn(
			async (opts: { browsers?: string[]; firefoxProfile?: string }) => {
				if (opts.browsers?.[0] === "chrome") {
					return {
						cookies: [extractedPair("chrome")[0]],
						warnings: [],
					};
				}
				if (opts.firefoxProfile === profile) {
					return {
						cookies: [extractedPair("zen")[1]],
						warnings: [],
					};
				}
				return { cookies: [], warnings: [] };
			},
		);
		const store = new AuthStore(tempFile(), extractor as any);
		const resolved = await store.extractFromBrowser(
			baseOptions({
				cookieSource: ["chrome", "zen"],
				zenProfile: profile,
			}),
		);

		expect(resolved).toBeNull();
		const diagnostics = store.getLastDiagnostics().join(" ");
		expect(diagnostics).toContain("same source");
		expect(diagnostics).not.toContain("chrome-auth");
		expect(diagnostics).not.toContain("zen-ct0");
	});

	it("selects the first requested source that has a complete pair", async () => {
		const profile = zenDir();
		const extractor = vi.fn(
			async (opts: { browsers?: string[]; firefoxProfile?: string }) => {
				if (opts.firefoxProfile === profile) {
					return { cookies: extractedPair("zen"), warnings: [] };
				}
				if (opts.browsers?.[0] === "chrome") {
					return { cookies: extractedPair("chrome"), warnings: [] };
				}
				return { cookies: [], warnings: [] };
			},
		);
		const store = new AuthStore(tempFile(), extractor as any);

		const zenFirst = await store.extractFromBrowser(
			baseOptions({
				cookieSource: ["zen", "chrome"],
				zenProfile: profile,
			}),
		);
		expect(zenFirst?.source).toBe("browser:zen");
		expect(zenFirst?.cookies.map((cookie) => cookie.value)).toEqual([
			"zen-auth",
			"zen-ct0",
		]);

		const chromeFirst = await store.extractFromBrowser(
			baseOptions({
				cookieSource: ["chrome", "zen"],
				zenProfile: profile,
			}),
		);
		expect(chromeFirst?.source).toBe("browser:chrome");
		expect(chromeFirst?.cookies.map((cookie) => cookie.value)).toEqual([
			"chrome-auth",
			"chrome-ct0",
		]);
	});

	it("keeps earlier extraction diagnostics when a later source is incomplete", async () => {
		const profile = zenDir();
		const extractor = vi.fn(async (opts: { browsers?: string[] }) => {
			if (opts.browsers?.[0] === "chrome") {
				throw new Error("chrome locked");
			}
			return {
				cookies: [extractedPair("zen")[0]],
				warnings: ["zen db copied"],
			};
		});
		const store = new AuthStore(tempFile(), extractor as any);
		const resolved = await store.extractFromBrowser(
			baseOptions({
				cookieSource: ["chrome", "zen"],
				zenProfile: profile,
			}),
		);

		expect(resolved).toBeNull();
		const diagnostics = store.getLastDiagnostics().join(" ");
		expect(diagnostics).toContain("chrome locked");
		expect(diagnostics).toContain("zen db copied");
		expect(diagnostics).toContain("same source");
		expect(diagnostics).not.toContain("zen-auth");
	});

	it("normalizes millisecond and second expiry and maps session values to -1", async () => {
		const cases: Array<{
			expires: number | null | undefined;
			expected: number | null;
		}> = [
			{ expires: undefined, expected: -1 },
			{ expires: null, expected: -1 },
			{ expires: 0, expected: -1 },
			{ expires: -5, expected: -1 },
			{ expires: 1_700_000_000, expected: 1_700_000_000 },
			{ expires: 1_700_000_000_000, expected: 1_700_000_000 },
			{ expires: 10_000_000_000, expected: 10_000_000_000 },
			{ expires: 10_000_000_001, expected: 10_000_000 },
			{
				expires: (1_700_000_000 + 11_644_473_600) * 1_000_000,
				expected: 1_700_000_000,
			},
		];

		for (const testCase of cases) {
			const extractor = vi.fn(async () => ({
				cookies: extractedPair("safari", testCase.expires),
				warnings: [],
			}));
			const store = new AuthStore(tempFile(), extractor as any);
			const resolved = await store.extractFromBrowser(
				baseOptions({ cookieSource: ["safari"] }),
			);
			expect(resolved?.cookies.map((cookie) => cookie.expires)).toEqual([
				testCase.expected,
				testCase.expected,
			]);
		}
	});

	it("rejects a non-finite expiry without returning cookies", async () => {
		for (const expires of [Number.NaN, Number.POSITIVE_INFINITY]) {
			const extractor = vi.fn(async () => ({
				cookies: extractedPair("safari", expires),
				warnings: [],
			}));
			const store = new AuthStore(tempFile(), extractor as any);
			const resolved = await store.extractFromBrowser(
				baseOptions({ cookieSource: ["safari"] }),
			);
			expect(resolved).toBeNull();
			const diagnostics = store.getLastDiagnostics().join(" ");
			expect(diagnostics).toContain("finite");
			expect(diagnostics).not.toContain("safari-auth");
		}
	});

	it("ignores cached zen auth when the explicit zen profile changes", async () => {
		const first = zenDir();
		const second = zenDir();
		const extractor = vi.fn(async () => ({
			cookies: extractedPair("zen"),
			warnings: [],
		}));
		const store = new AuthStore(tempFile(), extractor as any);
		const options = {
			cookieSource: ["zen" as const],
			cookieSourceExplicit: true,
		};

		const initial = await store.resolve(
			baseOptions({ ...options, zenProfile: first }),
		);
		expect(initial?.source).toBe("browser:zen");
		expect(extractor).toHaveBeenCalledTimes(1);

		const cached = await store.resolve(
			baseOptions({ ...options, zenProfile: first }),
		);
		expect(cached?.cookies.map((cookie) => cookie.value)).toEqual([
			"zen-auth",
			"zen-ct0",
		]);
		expect(extractor).toHaveBeenCalledTimes(1);

		const refreshed = await store.resolve(
			baseOptions({ ...options, zenProfile: second }),
		);
		expect(refreshed?.source).toBe("browser:zen");
		expect(extractor).toHaveBeenCalledTimes(2);
		const saved = JSON.parse(fs.readFileSync(store.authFile, "utf8")) as {
			zenProfile?: string;
		};
		expect(saved.zenProfile).toBe(second);
	});

	it("reuses cache when one browser wins an explicit multi-source request", async () => {
		const profile = zenDir();
		const extractor = vi.fn(
			async (opts: { browsers?: string[]; firefoxProfile?: string }) => {
				if (opts.browsers?.[0] === "chrome") {
					return { cookies: [extractedPair("chrome")[0]], warnings: [] };
				}
				if (opts.firefoxProfile === profile) {
					return { cookies: extractedPair("zen"), warnings: [] };
				}
				return { cookies: [], warnings: [] };
			},
		);
		const store = new AuthStore(tempFile(), extractor as any);
		const options = {
			cookieSource: ["chrome" as const, "zen" as const],
			cookieSourceExplicit: true,
			zenProfile: profile,
		};

		const first = await store.resolve(baseOptions(options));
		expect(first?.source).toBe("browser:zen");
		const callsAfterFirst = extractor.mock.calls.length;
		expect(callsAfterFirst).toBeGreaterThan(0);

		const second = await store.resolve(baseOptions(options));
		expect(second?.source).toBe("browser:zen");
		expect(second?.cookies.map((cookie) => cookie.value)).toEqual([
			"zen-auth",
			"zen-ct0",
		]);
		expect(extractor).toHaveBeenCalledTimes(callsAfterFirst);
		const saved = JSON.parse(fs.readFileSync(store.authFile, "utf8")) as {
			source?: string;
			requestedSources?: string[];
		};
		expect(saved.source).toBe("browser:zen");
		expect(saved.requestedSources).toEqual(["chrome", "zen"]);

		await store.resolve(
			baseOptions({
				...options,
				cookieSource: ["zen", "chrome"],
			}),
		);
		expect(extractor.mock.calls.length).toBeGreaterThan(callsAfterFirst);
	});

	it("passes a Chrome profile only to Chrome, not Edge", async () => {
		const extractor = vi.fn(async (opts: { browsers?: string[] }) => {
			if (opts.browsers?.[0] === "edge") {
				return { cookies: [extractedPair("edge")[0]], warnings: [] };
			}
			return { cookies: extractedPair("chrome"), warnings: [] };
		});
		const store = new AuthStore(tempFile(), extractor as any);
		const resolved = await store.extractFromBrowser(
			baseOptions({
				cookieSource: ["edge", "chrome"],
				chromeProfile: "Profile 1",
				chromeProfileDir: "/tmp/chrome-dir",
			}),
		);

		expect(resolved?.source).toBe("browser:chrome");
		expect(extractor).toHaveBeenCalledTimes(2);
		expect(extractor.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({ browsers: ["edge"] }),
		);
		expect(extractor.mock.calls[0]?.[0].chromeProfile).toBeUndefined();
		expect(extractor.mock.calls[0]?.[0].firefoxProfile).toBeUndefined();
		expect(extractor.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({
				browsers: ["chrome"],
				chromeProfile: "/tmp/chrome-dir",
			}),
		);
	});
});
