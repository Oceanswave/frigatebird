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
});
