import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStore } from "../../src/browser/auth-store.js";
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
