import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as scrape from "../../src/browser/scrape.js";
import { PlaywrightXClient } from "../../src/client/playwright-client.js";
import type { GlobalOptions } from "../../src/lib/types.js";

const defaultOptions: GlobalOptions = {
	cookieSource: ["chrome"],
	media: [],
	alt: [],
	headless: true,
	color: false,
	emoji: false,
};

type SessionManagerLike = ConstructorParameters<typeof PlaywrightXClient>[1];
type PatchedClient = PlaywrightXClient & Record<string, unknown>;

type BatchResult = {
	ok: boolean;
	added: number;
	already: number;
	removed: number;
	errors: number;
	details: Array<{
		handle: string;
		status: "added" | "already" | "removed" | "error";
	}>;
};

function asPatchedClient(client: PlaywrightXClient): PatchedClient {
	return client as unknown as PatchedClient;
}

function createSessionStub() {
	return {
		withSession: vi.fn(async (_options, task) =>
			task({ page: {}, context: {}, auth: null }),
		),
		ensureLoggedIn: vi.fn(async () => true),
		whoAmI: vi.fn(async () => ({ handle: "tester", name: "Tester" })),
		getAuthStore: vi.fn(() => ({
			authFile: "/tmp/auth.json",
			getLastDiagnostics: () => [],
		})),
		createCookieProbe: vi.fn(async () => ({
			hasAuthToken: true,
			hasCt0: true,
			source: "disk",
		})),
		refreshAuth: vi.fn(async () => ({
			source: "browser",
			cookies: [
				{ name: "auth_token", value: "a" },
				{ name: "ct0", value: "b" },
			],
		})),
	};
}

function patchWithPage(client: PatchedClient) {
	client.withPage = vi.fn(async (task: (page: unknown) => Promise<unknown>) =>
		task({}),
	);
}

describe("PlaywrightXClient", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns compatibility query ids payload", async () => {
		const client = new PlaywrightXClient(
			defaultOptions,
			createSessionStub() as unknown as SessionManagerLike,
		);
		const result = await client.queryIds(true);

		expect(result.mode).toBe("playwright");
		expect(result.refreshed).toBe(true);
	});

	it("returns auth check details from session manager", async () => {
		const sessions = createSessionStub();
		const client = new PlaywrightXClient(
			defaultOptions,
			sessions as unknown as SessionManagerLike,
		);
		const result = await client.check();

		expect(result.loggedIn).toBe(true);
		expect(result.source).toBe("disk");
		expect(result.hasAuthToken).toBe(true);
		expect(sessions.createCookieProbe).toHaveBeenCalled();
	});

	it("refreshes auth and reports status", async () => {
		const sessions = createSessionStub();
		const client = new PlaywrightXClient(
			defaultOptions,
			sessions as unknown as SessionManagerLike,
		);
		const result = await client.refresh();

		expect(result.loggedIn).toBe(true);
		expect(result.source).toBe("browser");
		expect(sessions.refreshAuth).toHaveBeenCalled();
	});

	it("aggregates addToList outcomes", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);

		patchWithPage(client);
		client.ensureAuth = vi.fn(async () => {});
		client.setListMembership = vi
			.fn()
			.mockResolvedValueOnce({ status: "added" })
			.mockResolvedValueOnce({ status: "already" })
			.mockResolvedValueOnce({ status: "error", error: "oops" });

		const result = await client.addToList("List", ["@a", "@b", "@c"]);

		expect(result.added).toBe(1);
		expect(result.already).toBe(1);
		expect(result.errors).toBe(1);
		expect(client.setListMembership).toHaveBeenCalledTimes(3);
	});

	it("aggregates removeFromList outcomes", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);

		patchWithPage(client);
		client.ensureAuth = vi.fn(async () => {});
		client.setListMembership = vi.fn().mockResolvedValue({ status: "removed" });

		const result = await client.removeFromList("@a", "List");
		expect(result.removed).toBe(1);
		expect(result.errors).toBe(0);
	});

	it("returns batch failure for missing file", async () => {
		const client = new PlaywrightXClient(
			defaultOptions,
			createSessionStub() as unknown as SessionManagerLike,
		);
		const result = await client.batch("/missing/file.json");

		expect(result.ok).toBe(false);
		expect(result.errors).toBe(1);
	});

	it("loads batch file and delegates list additions", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);
		const tempFile = path.join(
			os.tmpdir(),
			`frigatebird-batch-${Date.now()}.json`,
		);

		fs.writeFileSync(
			tempFile,
			JSON.stringify({
				ListA: ["@a"],
				ListB: ["@b", "@c"],
			}),
		);

		client.addToList = vi
			.fn<(...args: unknown[]) => Promise<BatchResult>>()
			.mockResolvedValueOnce({
				ok: true,
				added: 1,
				already: 0,
				removed: 0,
				errors: 0,
				details: [{ handle: "a", status: "added" }],
			})
			.mockResolvedValueOnce({
				ok: true,
				added: 2,
				already: 0,
				removed: 0,
				errors: 0,
				details: [
					{ handle: "b", status: "added" },
					{ handle: "c", status: "added" },
				],
			});

		const result = await client.batch(tempFile);

		expect(result.ok).toBe(true);
		expect(result.added).toBe(3);
		expect(client.addToList).toHaveBeenCalledTimes(2);

		fs.unlinkSync(tempFile);
	});

	it("retries transient failures with backoff helper", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);

		let attempts = 0;
		const result = await (client as any).retryWithBackoff(
			async () => {
				attempts += 1;
				if (attempts < 3) {
					throw new Error("transient");
				}
				return "ok";
			},
			3,
			1,
		);

		expect(result).toBe("ok");
		expect(attempts).toBe(3);
	});

	it("clicks the first visible fallback selector", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);

		const clicked: string[] = [];
		const page = {
			locator: (selector: string) => ({
				first: () => ({
					isVisible: async () => selector === "second",
					click: async () => {
						clicked.push(selector);
					},
				}),
			}),
			waitForTimeout: async () => {},
		};

		const result = await (client as any).clickFirstVisible(
			page,
			["first", "second"],
			100,
		);

		expect(result).toBe(true);
		expect(clicked).toEqual(["second"]);
	});

	it("retries click when pointer events are intercepted", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);

		let attempts = 0;
		const page = {
			locator: (selector: string) => ({
				first: () => ({
					isVisible: async () =>
						selector === "target"
							? true
							: selector !== '[data-testid="twc-cc-mask"]',
					click: async () => {
						if (selector !== "target") return;
						attempts += 1;
						if (attempts === 1) {
							throw new Error(
								'locator.click: <div data-testid="twc-cc-mask"></div> intercepts pointer events',
							);
						}
					},
				}),
			}),
			waitForTimeout: async () => {},
			keyboard: { press: async () => {} },
		};

		const result = await (client as any).clickFirstVisible(
			page,
			["target"],
			100,
		);

		expect(result).toBe(true);
		expect(attempts).toBe(2);
	});

	it("retries in headed mode after a headless retry marker error", async () => {
		const withSession = vi
			.fn()
			.mockRejectedValueOnce(
				new Error("[FRIGATEBIRD_HEADLESS_RETRY] simulated headless error page"),
			)
			.mockImplementationOnce(async (_options, task) =>
				task({ page: {}, context: {}, auth: null }),
			);
		const sessions = {
			withSession,
			ensureLoggedIn: vi.fn(async () => true),
			whoAmI: vi.fn(async () => ({ handle: "tester", name: "Tester" })),
			getAuthStore: vi.fn(() => ({
				authFile: "/tmp/auth.json",
				getLastDiagnostics: () => [],
			})),
			createCookieProbe: vi.fn(async () => ({
				hasAuthToken: true,
				hasCt0: true,
				source: "disk",
			})),
			refreshAuth: vi.fn(async () => ({ source: "browser", cookies: [] })),
		};

		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				sessions as unknown as SessionManagerLike,
			),
		);

		const result = await (client as any).withPage(async () => "ok");

		expect(result).toBe("ok");
		expect(withSession).toHaveBeenCalledTimes(2);
		expect(withSession.mock.calls[0]?.[0]).toMatchObject({ headless: true });
		expect(withSession.mock.calls[1]?.[0]).toMatchObject({ headless: false });
	});

	it("normalizes error when headed retry also fails", async () => {
		const withSession = vi
			.fn()
			.mockRejectedValueOnce(
				new Error("[FRIGATEBIRD_HEADLESS_RETRY] simulated headless error page"),
			)
			.mockRejectedValueOnce(new Error("headed retry failed"));
		const sessions = {
			withSession,
			ensureLoggedIn: vi.fn(async () => true),
			whoAmI: vi.fn(async () => ({ handle: "tester", name: "Tester" })),
			getAuthStore: vi.fn(() => ({
				authFile: "/tmp/auth.json",
				getLastDiagnostics: () => [],
			})),
			createCookieProbe: vi.fn(async () => ({
				hasAuthToken: true,
				hasCt0: true,
				source: "disk",
			})),
			refreshAuth: vi.fn(async () => ({ source: "browser", cookies: [] })),
		};
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				sessions as unknown as SessionManagerLike,
			),
		);

		await expect((client as any).withPage(async () => "ok")).rejects.toThrow(
			"headed retry failed",
		);
		expect(withSession).toHaveBeenCalledTimes(2);
	});

	it("marks openTweet render errors for headless retry", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);

		const page = {
			goto: async () => {},
			waitForSelector: async () => {
				throw new Error("wait timeout");
			},
			locator: (selector: string) => ({
				count: async () => (selector.includes('[data-testid="tweet"]') ? 0 : 1),
				first: () => ({
					isVisible: async () =>
						selector.includes("Something went wrong, but don’t fret"),
				}),
			}),
		};

		await expect(
			(client as any).openTweet(page, "1234567890123456789"),
		).rejects.toThrow("[FRIGATEBIRD_HEADLESS_RETRY]");
	});

	it("throws explicit render error when non-headless tweet load fails", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				{ ...defaultOptions, headless: false },
				createSessionStub() as unknown as SessionManagerLike,
			),
		);

		const page = {
			goto: async () => {},
			waitForSelector: async () => {
				throw new Error("wait timeout");
			},
			locator: (selector: string) => ({
				count: async () => 0,
				first: () => ({
					isVisible: async () => false,
				}),
			}),
		};

		await expect(
			(client as any).openTweet(page, "1234567890123456789"),
		).rejects.toThrow("Tweet content did not render.");
	});

	it("throws when auth check is not logged in", async () => {
		const sessions = {
			...createSessionStub(),
			ensureLoggedIn: vi.fn(async () => false),
		};
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				sessions as unknown as SessionManagerLike,
			),
		);

		await expect((client as any).ensureAuth({})).rejects.toThrow(
			"Not logged in",
		);
	});

	it("validates tweet and list references in navigation helpers", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);
		const page = {
			goto: async () => {},
			waitForSelector: async () => {},
		};

		await expect(
			(client as any).openTweet(page, "not-a-tweet"),
		).rejects.toThrow("Invalid tweet reference");
		await expect((client as any).openList(page, "not-a-list")).rejects.toThrow(
			"Invalid list reference",
		);
	});

	it("throws when scrapeSingleTweet finds no items", async () => {
		vi.spyOn(scrape, "collectTweets").mockResolvedValue({
			items: [],
			pagesFetched: 1,
		} as any);
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);

		await expect((client as any).scrapeSingleTweet({})).rejects.toThrow(
			"Tweet content not found",
		);
	});

	it("requires a current handle for profile likes navigation", async () => {
		const sessions = {
			...createSessionStub(),
			whoAmI: vi.fn(async () => ({ name: "Tester" })),
		};
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				sessions as unknown as SessionManagerLike,
			),
		);
		const page = {
			goto: async () => {},
			waitForSelector: async () => {},
		};

		await expect((client as any).goToProfileLikes(page)).rejects.toThrow(
			"Unable to detect current profile handle",
		);
	});

	it("wraps non-Error failures in retryWithBackoff", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);

		await expect(
			(client as any).retryWithBackoff(
				async () => {
					throw "plain failure";
				},
				2,
				1,
			),
		).rejects.toThrow("plain failure");
	});

	it("returns false when clickFirstVisible finds no visible selector", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);
		const page = {
			locator: () => ({
				first: () => ({
					isVisible: async () => false,
				}),
			}),
			waitForTimeout: async () => {},
			keyboard: { press: async () => {} },
		};

		const result = await (client as any).clickFirstVisible(page, ["target"], 1);
		expect(result).toBe(false);
	});

	it("rethrows non-interception click errors", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);
		const locator = {
			click: vi.fn(async () => {
				throw new Error("boom");
			}),
		};
		client.firstVisibleLocator = vi.fn(async () => locator);
		client.dismissBlockingLayers = vi.fn(async () => {});

		await expect(
			(client as any).clickFirstVisible({ waitForTimeout: async () => {} }, [
				"x",
			]),
		).rejects.toThrow("boom");
	});

	it("throws when composer cannot be found", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);
		client.firstVisibleLocator = vi.fn(async () => null);

		await expect((client as any).waitForComposer({}, 10)).rejects.toThrow(
			"Composer text area not found",
		);
	});

	it("uses keyboard fallback in fillComposer when injected text is short", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);
		const keyboardType = vi.fn(async () => {});
		const candidate = {
			isVisible: async () => true,
			click: async () => {},
			fill: async () => {},
			evaluate: async () => "tiny",
		};
		const page = {
			locator: () => ({
				count: async () => 1,
				nth: () => candidate,
			}),
			keyboard: { type: keyboardType },
		};
		client.firstVisibleLocator = vi.fn(async () => ({}));

		await (client as any).fillComposer(page, "longer test content");
		expect(keyboardType).toHaveBeenCalledWith("longer test content");
	});

	it("falls back to Control+Enter in submitComposer when Meta+Enter fails", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);
		const press = vi
			.fn()
			.mockRejectedValueOnce(new Error("meta blocked"))
			.mockResolvedValueOnce(undefined);
		const page = {
			keyboard: { press },
			waitForTimeout: async () => {},
		};
		client.firstVisibleLocator = vi.fn(async () => ({}));

		await (client as any).submitComposer(page, "tweet");
		expect(press.mock.calls[0]?.[0]).toBe("Meta+Enter");
		expect(press.mock.calls[1]?.[0]).toBe("Control+Enter");
	});

	it("throws when submitComposer cannot locate an enabled submit button", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);
		const page = {
			keyboard: { press: async () => {} },
			waitForTimeout: async () => {},
		};
		client.firstVisibleLocator = vi.fn(async () => null);
		client.clickFirstVisible = vi.fn(async () => false);

		await expect((client as any).submitComposer(page, "reply")).rejects.toThrow(
			"Could not locate reply submit button",
		);
	});

	it("throws when attachMedia cannot find a file input", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);
		const page = {
			locator: () => ({
				first: () => ({
					count: async () => 0,
				}),
			}),
			waitForTimeout: async () => {},
		};

		await expect(
			(client as any).attachMedia(page, [{ path: "a.png", mime: "image/png" }]),
		).rejects.toThrow("Could not find media upload input");
	});

	it("uploads media and delegates alt text processing", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);
		const setInputFiles = vi.fn(async () => {});
		const waitForTimeout = vi.fn(async () => {});
		const page = {
			locator: (selector: string) => ({
				first: () =>
					selector === 'input[data-testid="fileInput"]'
						? {
								count: async () => 1,
								setInputFiles,
							}
						: {
								count: async () => 0,
								setInputFiles: async () => {},
							},
			}),
			waitForTimeout,
		};
		client.applyAltText = vi.fn(async () => {});

		await (client as any).attachMedia(page, [
			{ path: "a.png", mime: "image/png" },
		]);
		expect(setInputFiles).toHaveBeenCalledWith(["a.png"]);
		expect(waitForTimeout).toHaveBeenCalledWith(1500);
		expect(client.applyAltText).toHaveBeenCalledTimes(1);
	});

	it("presses Escape when alt text editor opens without a visible input", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);
		const press = vi.fn(async () => {});
		const altButton = {
			isVisible: async () => true,
			click: async () => {},
		};
		const hidden = {
			isVisible: async () => false,
			click: async () => {},
			fill: async () => {},
		};
		const page = {
			locator: (selector: string) => {
				if (selector.includes("altTextButton")) {
					return { nth: () => altButton, first: () => altButton };
				}
				return { first: () => hidden, nth: () => hidden };
			},
			keyboard: { press },
			waitForTimeout: async () => {},
		};

		await (client as any).applyAltText(page, [
			{ path: "a.png", mime: "image/png", alt: "desc" },
		]);
		expect(press).toHaveBeenCalledWith("Escape");
	});

	it("presses Escape when alt text is filled but no save button is visible", async () => {
		const client = asPatchedClient(
			new PlaywrightXClient(
				defaultOptions,
				createSessionStub() as unknown as SessionManagerLike,
			),
		);
		const press = vi.fn(async () => {});
		const fill = vi.fn(async () => {});
		const altButton = {
			isVisible: async () => true,
			click: async () => {},
		};
		const input = {
			isVisible: async () => true,
			fill,
		};
		const hidden = {
			isVisible: async () => false,
			click: async () => {},
			fill: async () => {},
		};
		const page = {
			locator: (selector: string) => {
				if (selector.includes("altTextButton")) {
					return { nth: () => altButton, first: () => altButton };
				}
				if (selector.includes("altTextTextarea")) {
					return { first: () => input, nth: () => input };
				}
				return { first: () => hidden, nth: () => hidden };
			},
			keyboard: { press },
			waitForTimeout: async () => {},
		};

		await (client as any).applyAltText(page, [
			{ path: "a.png", mime: "image/png", alt: "desc" },
		]);
		expect(fill).toHaveBeenCalledWith("desc");
		expect(press).toHaveBeenCalledWith("Escape");
	});
});
