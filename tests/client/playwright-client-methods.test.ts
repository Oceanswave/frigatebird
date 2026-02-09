import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as scrape from "../../src/browser/scrape.js";
import { PlaywrightXClient } from "../../src/client/playwright-client.js";
import type { GlobalOptions } from "../../src/lib/types.js";

const options: GlobalOptions = {
	cookieSource: ["chrome"],
	media: [],
	alt: [],
	headless: true,
};

function sessionStub() {
	return {
		withSession: vi.fn(async (_options, task) =>
			task({ page: {}, context: {}, auth: null }),
		),
		ensureLoggedIn: vi.fn(async () => true),
		whoAmI: vi.fn(async () => ({ handle: "tester", name: "Tester" })),
		getAuthStore: vi.fn(() => ({ authFile: "/tmp/auth.json" })),
		createCookieProbe: vi.fn(async () => ({
			hasAuthToken: true,
			hasCt0: true,
			source: "disk",
		})),
		refreshAuth: vi.fn(async () => ({ source: "browser", cookies: [] })),
	};
}

function locatorStub(overrides: Partial<any> = {}) {
	const base: any = {
		first: () => base,
		nth: () => base,
		locator: () => base,
		count: async () => 1,
		isVisible: async () => true,
		click: async () => {},
		fill: async () => {},
		evaluate: async () => "",
		innerText: async () => "",
		getAttribute: async () => null,
		...overrides,
	};
	return base;
}

function pageStub(overrides: Partial<any> = {}) {
	return {
		goto: async () => {},
		waitForSelector: async () => {},
		fill: async () => {},
		click: async () => {},
		waitForTimeout: async () => {},
		locator: (selector: string) => {
			if (selector.includes("twc-cc-mask")) {
				return locatorStub({
					isVisible: async () => false,
					count: async () => 0,
				});
			}
			return locatorStub();
		},
		mouse: { wheel: async () => {} },
		evaluate: async () => false,
		keyboard: { press: async () => {}, type: async () => {} },
		...overrides,
	};
}

describe("PlaywrightXClient methods", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("tweets successfully", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(pageStub()));
		client.ensureAuth = vi.fn(async () => {});

		const result = await client.tweet("hello");
		expect(result.ok).toBe(true);
	});

	it("falls back to home composer when compose route selector lookup fails", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(pageStub()));
		client.ensureAuth = vi.fn(async () => {});
		client.waitForComposer = vi
			.fn()
			.mockRejectedValueOnce(
				new Error(
					"Composer text area not found. X may have changed selectors.",
				),
			)
			.mockResolvedValueOnce(undefined);
		client.recoverComposerFromHome = vi.fn(async () => true);

		const result = await client.tweet("hello");
		expect(result.ok).toBe(true);
		expect(client.recoverComposerFromHome).toHaveBeenCalled();
	});

	it("returns failure when composer cannot be recovered", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(pageStub()));
		client.ensureAuth = vi.fn(async () => {});
		client.waitForComposer = vi.fn(async () => {
			throw new Error(
				"Composer text area not found. X may have changed selectors.",
			);
		});
		client.recoverComposerFromHome = vi.fn(async () => false);

		await expect(client.tweet("hello")).rejects.toThrow(
			"Composer text area not found",
		);
	});

	it("publishes an article with title and body", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const goto = vi.fn(async () => {});
		const titleFill = vi.fn(async () => {});
		const bodyFill = vi.fn(async () => {});
		const page = pageStub({
			goto,
		});
		const titleField = {
			click: async () => {},
			fill: titleFill,
		};
		const bodyField = {
			click: async () => {},
			fill: bodyFill,
		};

		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.dismissBlockingLayers = vi.fn(async () => {});
		client.firstVisibleLocator = vi
			.fn()
			.mockResolvedValueOnce(titleField)
			.mockResolvedValueOnce(bodyField);
		client.clickFirstVisible = vi.fn(async (_page: any, selectors: string[]) =>
			selectors.some(
				(selector) =>
					selector.includes("articlePublishButton") ||
					selector.includes('has-text("Publish")'),
			),
		);

		const result = await client.publishArticle("Article title", "Body text");
		expect(result.ok).toBe(true);
		expect(result.message).toContain("Article published");
		expect(titleFill).toHaveBeenCalledWith("Article title");
		expect(bodyFill).toHaveBeenCalledWith("Body text");
		expect(goto).toHaveBeenCalled();
	});

	it("returns validation failure for empty article title/body", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const missingTitle = await client.publishArticle("  ", "Body");
		const missingBody = await client.publishArticle("Title", "   ");

		expect(missingTitle.ok).toBe(false);
		expect(missingTitle.message).toContain("title cannot be empty");
		expect(missingBody.ok).toBe(false);
		expect(missingBody.message).toContain("body cannot be empty");
	});

	it("returns failure when article composer cannot be found", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const goto = vi.fn(async () => {});
		const page = pageStub({
			goto,
		});

		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.dismissBlockingLayers = vi.fn(async () => {});
		client.firstVisibleLocator = vi.fn(async () => null);
		client.clickFirstVisible = vi.fn(async () => false);

		const result = await client.publishArticle("Title", "Body");
		expect(result.ok).toBe(false);
		expect(result.message).toContain("Could not locate article composer");
		expect(goto.mock.calls.length).toBeGreaterThanOrEqual(6);
	});

	it("publishes an article using combined composer fallback", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const goto = vi.fn(async () => {});
		const combinedFill = vi.fn(async () => {});
		const page = pageStub({
			goto,
		});
		const combinedField = {
			click: async () => {},
			fill: combinedFill,
			evaluate: async () => "Article title\n\nBody text",
		};

		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.dismissBlockingLayers = vi.fn(async () => {});
		client.clickFirstVisible = vi
			.fn()
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true)
			.mockResolvedValueOnce(true)
			.mockResolvedValueOnce(false);
		client.firstVisibleLocator = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(combinedField);

		const result = await client.publishArticle("Article title", "Body text");
		expect(result.ok).toBe(true);
		expect(result.message).toContain("Article published");
		expect(combinedFill).toHaveBeenCalledWith("Article title\n\nBody text");
	});

	it("attaches explicit media for tweet", async () => {
		const tmp = path.join(os.tmpdir(), `frigatebird-media-${Date.now()}.png`);
		fs.writeFileSync(tmp, "fake");

		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(pageStub()));
		client.ensureAuth = vi.fn(async () => {});
		client.attachMedia = vi.fn(async () => {});

		const result = await client.tweet("hello", [tmp], ["alt"]);
		expect(result.ok).toBe(true);
		expect(client.attachMedia).toHaveBeenCalled();

		fs.unlinkSync(tmp);
	});

	it("replies successfully", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const page = pageStub({
			locator: (selector: string) => {
				if (selector.includes("twc-cc-mask")) {
					return locatorStub({
						first: () =>
							locatorStub({
								isVisible: async () => false,
								count: async () => 0,
							}),
					});
				}

				return locatorStub({
					first: () =>
						locatorStub({
							click: async () => {},
						}),
				});
			},
		});

		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.openTweet = vi.fn(async () => "");

		const result = await client.reply("123", "text");
		expect(result.ok).toBe(true);
	});

	it("fails reply when configured media file is missing", async () => {
		const mediaOptions = {
			...options,
			media: ["/path/that/does/not/exist.png"],
			alt: [],
		};
		const client: any = new PlaywrightXClient(
			mediaOptions,
			sessionStub() as any,
		);
		const result = await client.reply("123", "text");

		expect(result.ok).toBe(false);
		expect(result.message).toContain("Media file not found");
	});

	it("handles like already liked path", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const page = pageStub({
			locator: (selector: string) => {
				if (selector.includes("unlike")) {
					return locatorStub({
						first: () => locatorStub({ isVisible: async () => true }),
					});
				}
				return locatorStub({
					first: () =>
						locatorStub({ isVisible: async () => true, click: async () => {} }),
				});
			},
		});

		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.openTweet = vi.fn(async () => "");

		const result = await client.like("123");
		expect(result.message).toContain("already liked");
	});

	it("returns failure when like button is missing", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const page = pageStub({
			locator: (selector: string) => {
				if (selector.includes("unlike")) {
					return locatorStub({
						first: () => locatorStub({ isVisible: async () => false }),
					});
				}
				if (selector.includes('[data-testid="like"]')) {
					return locatorStub({
						first: () => locatorStub({ isVisible: async () => false }),
					});
				}
				return locatorStub();
			},
		});

		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.openTweet = vi.fn(async () => "");

		const result = await client.like("123");
		expect(result.ok).toBe(false);
		expect(result.message).toContain("Could not locate like button");
	});

	it("returns failure when retweet button missing", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const page = pageStub();

		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.openTweet = vi.fn(async () => "");
		client.firstVisibleLocator = vi.fn(async () => null);
		client.clickFirstVisible = vi.fn(async () => false);

		const result = await client.retweet("123");
		expect(result.ok).toBe(false);
		expect(result.message).toContain("Could not locate repost button");
	});

	it("handles retweet already reposted path", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const page = pageStub();

		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.openTweet = vi.fn(async () => "");
		client.firstVisibleLocator = vi.fn(async () => ({ ok: true }));

		const result = await client.retweet("123");
		expect(result.ok).toBe(true);
		expect(result.message).toContain("already reposted");
	});

	it("fails retweet when repost action does not complete", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const page = pageStub();

		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.openTweet = vi.fn(async () => "");
		client.firstVisibleLocator = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(null);
		client.clickFirstVisible = vi
			.fn()
			.mockResolvedValueOnce(true)
			.mockResolvedValueOnce(false);

		const result = await client.retweet("123");
		expect(result.ok).toBe(false);
		expect(result.message).toContain("did not complete");
	});

	it("reports successful retweet when confirm click succeeds", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const page = pageStub();

		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.openTweet = vi.fn(async () => "");
		client.firstVisibleLocator = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(null);
		client.clickFirstVisible = vi
			.fn()
			.mockResolvedValueOnce(true)
			.mockResolvedValueOnce(true);

		const result = await client.retweet("123");
		expect(result.ok).toBe(true);
		expect(result.message).toContain("Tweet reposted");
	});

	it("reads tweet through helpers", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(pageStub()));
		client.openTweet = vi.fn(async () => "");
		client.scrapeSingleTweet = vi.fn(async () => ({
			id: "1",
			text: "tweet",
			url: "u",
		}));

		const result = await client.read("123");
		expect(result.id).toBe("1");
	});

	it("collects thread and replies from scrape helper", async () => {
		const collectSpy = vi.spyOn(scrape, "collectTweets");
		collectSpy.mockResolvedValue({
			items: [
				{ id: "1", text: "a", url: "u1" },
				{ id: "2", text: "b", url: "u2" },
				{ id: "3", text: "c", url: "u3" },
			],
			pagesFetched: 1,
		} as any);

		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(pageStub()));
		client.openTweet = vi.fn(async () => "");

		const thread = await client.thread("123", {
			count: 10,
			all: false,
			delayMs: 10,
		});
		const replies = await client.replies("123", {
			count: 10,
			all: false,
			delayMs: 10,
		});

		expect(thread.items.length).toBe(3);
		expect(replies.items.length).toBe(2);
	});

	it("searches and user tweet timelines", async () => {
		const collectSpy = vi.spyOn(scrape, "collectTweets");
		collectSpy.mockResolvedValue({
			items: [{ id: "1", text: "x", url: "u" }],
			pagesFetched: 1,
		} as any);

		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(pageStub()));

		const search = await client.search("hello", {
			count: 1,
			all: false,
			delayMs: 10,
		});
		const user = await client.userTweets("@a", {
			count: 1,
			all: false,
			delayMs: 10,
		});

		expect(search.items.length).toBe(1);
		expect(user.items.length).toBe(1);
	});

	it("reads home, bookmarks, and likes feeds", async () => {
		vi.spyOn(scrape, "collectTweets").mockResolvedValue({
			items: [
				{ id: "2", text: "new", url: "u2", createdAt: "2026-01-02" },
				{ id: "1", text: "old", url: "u1", createdAt: "2026-01-01" },
			],
			pagesFetched: 1,
		} as any);

		const followingTab = locatorStub({
			first: () =>
				locatorStub({ isVisible: async () => true, click: async () => {} }),
		});
		const page = pageStub({ locator: () => followingTab });

		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.goToProfileLikes = vi.fn(async () => {});

		const home = await client.home({
			count: 2,
			all: false,
			delayMs: 10,
			following: true,
		});
		const bookmarks = await client.bookmarks({
			count: 2,
			all: false,
			delayMs: 10,
			sortChronological: true,
			authorOnly: true,
		} as any);
		const likes = await client.likes({ count: 2, all: false, delayMs: 10 });

		expect(home.items.length).toBe(2);
		expect(bookmarks.warnings?.length ?? 0).toBe(0);
		expect(bookmarks.items[0].id).toBe("1");
		expect(likes.items.length).toBe(2);
	});

	it("handles unbookmark removed/already/error paths", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.ensureAuth = vi.fn(async () => {});
		client.openTweet = vi.fn(async () => "");

		const removedPage = pageStub({
			locator: (selector: string) => {
				if (
					selector.includes("removeBookmark") ||
					selector.includes("unbookmark")
				) {
					return locatorStub({
						first: () =>
							locatorStub({
								isVisible: async () => true,
								click: async () => {},
							}),
					});
				}
				return locatorStub({
					first: () => locatorStub({ isVisible: async () => false }),
				});
			},
		});
		const alreadyPage = pageStub({
			locator: (selector: string) => {
				if (
					selector.includes("removeBookmark") ||
					selector.includes("unbookmark")
				) {
					return locatorStub({
						first: () => locatorStub({ isVisible: async () => false }),
					});
				}
				if (selector.includes("bookmark")) {
					return locatorStub({
						first: () =>
							locatorStub({
								isVisible: async () => true,
							}),
					});
				}
				return locatorStub();
			},
		});
		const errorPage = pageStub({
			locator: () =>
				locatorStub({
					first: () => locatorStub({ isVisible: async () => false }),
				}),
		});

		client.withPage = vi
			.fn()
			.mockImplementationOnce(async (task: any) => task(removedPage))
			.mockImplementationOnce(async (task: any) => task(alreadyPage))
			.mockImplementationOnce(async (task: any) => task(errorPage));

		const result = await client.unbookmark(["1", "2", "3"]);
		expect(result.removed).toBe(1);
		expect(result.already).toBe(1);
		expect(result.errors).toBe(1);
	});

	it("emits warning for full chain bookmark mode", async () => {
		vi.spyOn(scrape, "collectTweets").mockResolvedValue({
			items: [{ id: "1", text: "x", url: "u", createdAt: "2026-01-01" }],
			pagesFetched: 1,
		} as any);

		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(pageStub()));
		client.ensureAuth = vi.fn(async () => {});

		const bookmarks = await client.bookmarks({
			count: 1,
			all: false,
			delayMs: 10,
			fullChainOnly: true,
		} as any);

		expect(bookmarks.warnings?.[0]).toContain("full-chain bookmark modes");
	});

	it("handles mentions via explicit user and notifications", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(pageStub()));
		vi.spyOn(scrape, "collectTweets")
			.mockResolvedValueOnce({
				items: [{ id: "1", text: "x", url: "u" }],
				pagesFetched: 1,
			} as any)
			.mockResolvedValueOnce({
				items: [],
				pagesFetched: 1,
			} as any);
		client.ensureAuth = vi.fn(async () => {});

		const viaUser = await client.mentions({ user: "@jack", count: 1 });
		const viaNotifications = await client.mentions({ count: 1 });

		expect(viaUser.items.length).toBe(1);
		expect(viaNotifications.items.length).toBe(0);
	});

	it("returns no-op when follow target is already followed", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const page = pageStub({
			goto: async () => {},
			locator: (selector: string) => {
				if (selector.includes("-unfollow")) {
					return locatorStub({
						first: () =>
							locatorStub({
								isVisible: async () => true,
							}),
					});
				}
				return locatorStub({
					first: () =>
						locatorStub({
							isVisible: async () => false,
						}),
				});
			},
		});

		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});

		const result = await client.follow("@a");
		expect(result.ok).toBe(true);
		expect(result.message).toContain("Already following");
	});

	it("returns failure when follow button is unavailable", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const page = pageStub({
			goto: async () => {},
			locator: () =>
				locatorStub({
					first: () =>
						locatorStub({
							isVisible: async () => false,
						}),
				}),
		});
		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.clickFirstVisible = vi.fn(async () => false);

		const result = await client.follow("@a");
		expect(result.ok).toBe(false);
		expect(result.message).toContain("Follow button not found");
	});

	it("handles follow and unfollow actions", async () => {
		const followGoto = vi.fn(async () => {});
		const client: any = new PlaywrightXClient(
			{ ...options, baseUrl: "http://localhost:3001" },
			sessionStub() as any,
		);
		const page = pageStub({
			goto: followGoto,
			locator: (selector: string) => {
				if (selector.includes("twc-cc-mask")) {
					return locatorStub({
						first: () =>
							locatorStub({
								isVisible: async () => false,
								count: async () => 0,
							}),
					});
				}
				if (selector.includes("-unfollow")) {
					return locatorStub({
						first: () =>
							locatorStub({
								isVisible: async () => false,
								click: async () => {},
							}),
					});
				}
				if (selector.includes("-follow")) {
					return locatorStub({
						first: () =>
							locatorStub({
								isVisible: async () => true,
								click: async () => {},
							}),
					});
				}
				if (selector.includes("confirmationSheetConfirm")) {
					return locatorStub({
						first: () =>
							locatorStub({
								isVisible: async () => true,
								click: async () => {},
							}),
					});
				}
				return locatorStub();
			},
		});

		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});

		const follow = await client.follow("@a");
		expect(followGoto).toHaveBeenCalledWith("http://localhost:3001/a", {
			waitUntil: "domcontentloaded",
		});

		const unfollowGoto = vi.fn(async () => {});
		const unfollowPage = pageStub({
			goto: unfollowGoto,
			locator: (selector: string) => {
				if (selector.includes("twc-cc-mask")) {
					return locatorStub({
						first: () =>
							locatorStub({
								isVisible: async () => false,
								count: async () => 0,
							}),
					});
				}
				if (selector.includes("-unfollow")) {
					return locatorStub({
						first: () =>
							locatorStub({
								isVisible: async () => true,
								click: async () => {},
							}),
					});
				}
				if (selector.includes("confirmationSheetConfirm")) {
					return locatorStub({
						first: () =>
							locatorStub({
								isVisible: async () => true,
								click: async () => {},
							}),
					});
				}
				return locatorStub();
			},
		});
		client.withPage = vi.fn(async (task: any) => task(unfollowPage));

		const unfollow = await client.unfollow("@a");
		expect(unfollowGoto).toHaveBeenCalledWith("http://localhost:3001/a", {
			waitUntil: "domcontentloaded",
		});

		expect(follow.ok).toBe(true);
		expect(unfollow.ok).toBe(true);
	});

	it("returns no-op when unfollow target is not currently followed", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const page = pageStub({
			goto: async () => {},
		});
		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.firstVisibleLocator = vi.fn(async () => null);

		const result = await client.unfollow("@a");
		expect(result.ok).toBe(true);
		expect(result.message).toContain("Not currently following");
	});

	it("handles following/followers list retrieval", async () => {
		vi.spyOn(scrape, "collectUsers").mockResolvedValue({
			items: [{ handle: "a" }],
			pagesFetched: 1,
		} as any);
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(pageStub()));
		client.navigateFollowTab = vi.fn(async () => {});

		const following = await client.following({
			count: 1,
			all: false,
			delayMs: 10,
		});
		const followers = await client.followers({
			count: 1,
			all: false,
			delayMs: 10,
		});

		expect(following.items.length).toBe(1);
		expect(followers.items.length).toBe(1);
	});

	it("handles lists and list timeline retrieval", async () => {
		vi.spyOn(scrape, "collectLists").mockResolvedValue({
			items: [{ id: "1", name: "List", url: "https://x.com/i/lists/1" }],
			pagesFetched: 1,
		} as any);
		vi.spyOn(scrape, "collectTweets").mockResolvedValue({
			items: [{ id: "1", text: "x", url: "u" }],
			pagesFetched: 1,
		} as any);

		const listLocator = locatorStub({
			first: () =>
				locatorStub({
					locator: () =>
						locatorStub({
							innerText: async () => "1,234 members\n5 subscribers",
						}),
				}),
		});

		const page = pageStub({
			locator: () => listLocator,
		});

		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});
		client.openList = vi.fn(async () => "");

		const lists = await client.lists({ count: 1, memberOf: false });
		const timeline = await client.listTimeline("1", {
			count: 1,
			all: false,
			delayMs: 10,
		});

		expect(lists.items[0].memberCount).toBe(1234);
		expect(timeline.items.length).toBe(1);
	});

	it("switches to member tab when listing member-of lists", async () => {
		vi.spyOn(scrape, "collectLists").mockResolvedValue({
			items: [{ id: "1", name: "List", url: "https://x.com/i/lists/1" }],
			pagesFetched: 1,
		} as any);
		const memberTabClick = vi.fn(async () => {});
		const waitForTimeout = vi.fn(async () => {});
		const listLocator = locatorStub({
			first: () =>
				locatorStub({
					locator: () =>
						locatorStub({
							innerText: async () => "12 members\n3 subscribers",
						}),
				}),
		});
		const page = pageStub({
			waitForTimeout,
			locator: (selector: string) => {
				if (selector.includes('[role="tab"]:has-text("Member")')) {
					return locatorStub({
						first: () =>
							locatorStub({
								isVisible: async () => true,
								click: memberTabClick,
							}),
					});
				}
				return listLocator;
			},
		});

		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(page));
		client.ensureAuth = vi.fn(async () => {});

		const result = await client.lists({ count: 1, memberOf: true });
		expect(result.items[0].memberCount).toBe(12);
		expect(memberTabClick).toHaveBeenCalledTimes(1);
		expect(waitForTimeout).toHaveBeenCalledWith(500);
	});

	it("handles news and about profiles", async () => {
		vi.spyOn(scrape, "collectNewsItems").mockResolvedValue([
			{
				id: "1",
				headline: "Long AI Headline",
				sourceTab: "news",
				summary: "AI report story",
			},
			{
				id: "2",
				headline: "Other Headline",
				sourceTab: "news",
				summary: "short",
			},
		] as any);

		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) =>
			task(
				pageStub({
					locator: (selector: string) => {
						if (selector.includes("UserName"))
							return locatorStub({
								first: () => locatorStub({ innerText: async () => "Tester" }),
							});
						if (selector.includes("UserDescription"))
							return locatorStub({
								first: () => locatorStub({ innerText: async () => "Bio" }),
							});
						if (selector.includes("UserLocation"))
							return locatorStub({
								first: () => locatorStub({ innerText: async () => "Earth" }),
							});
						if (selector.includes("UserJoinDate"))
							return locatorStub({
								first: () =>
									locatorStub({ innerText: async () => "Joined 2020" }),
							});
						if (selector.includes("UserUrl"))
							return locatorStub({
								first: () =>
									locatorStub({
										getAttribute: async () => "https://example.com",
									}),
							});
						return locatorStub();
					},
				}),
			),
		);
		client.search = vi.fn(async () => ({
			items: [{ id: "t", text: "tweet", url: "u" }],
			pagesFetched: 1,
		}));

		const news = await client.news({
			count: 2,
			aiOnly: true,
			withTweets: true,
			tweetsPerItem: 1,
			tabs: ["news"],
		});
		const about = await client.about("@tester");

		expect(news.items.length).toBe(1);
		expect(news.items[0].relatedTweets?.length).toBe(1);
		expect(about.handle).toBe("tester");
	});

	it("uses withPage headless override and normalizes marked errors", async () => {
		const sessions = sessionStub();
		const client: any = new PlaywrightXClient(
			{ ...options, headless: true },
			sessions as any,
		);

		await client.withPage(async () => "ok", false);
		expect(sessions.withSession).toHaveBeenCalledWith(
			expect.objectContaining({ headless: false }),
			expect.any(Function),
		);

		const normalized = client.normalizeError(
			new Error("[FRIGATEBIRD_HEADLESS_RETRY] temporary"),
		);
		expect(normalized.message).toBe("temporary");
		const normalizedUnknown = client.normalizeError("plain failure");
		expect(normalizedUnknown.message).toBe("plain failure");
	});

	it("dismisses blocking overlays through escape and forced click fallback", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		let maskVisible = true;
		const maskClick = vi.fn(async () => {
			maskVisible = false;
		});
		const pressEscape = vi.fn(async () => {});
		const waitForTimeout = vi.fn(async () => {});

		const page = {
			locator: (selector: string) => {
				if (selector.includes('data-testid="twc-cc-mask"')) {
					return {
						first: () => ({
							isVisible: async () => maskVisible,
							click: maskClick,
						}),
					};
				}
				return {
					first: () => ({
						isVisible: async () => false,
						click: async () => {},
					}),
				};
			},
			keyboard: { press: pressEscape },
			waitForTimeout,
		};

		await client.dismissBlockingLayers(page);

		expect(pressEscape).toHaveBeenCalledWith("Escape");
		expect(maskClick).toHaveBeenCalledWith({ force: true });
	});

	it("recovers composer from home and reports failure when composer is missing", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const goto = vi.fn(async () => {});
		const page = pageStub({ goto });

		client.dismissBlockingLayers = vi.fn(async () => {});
		client.clickFirstVisible = vi.fn(async () => false);
		client.waitForComposer = vi
			.fn()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("missing"));

		const recovered = await client.recoverComposerFromHome(page, 1000);
		const failed = await client.recoverComposerFromHome(page, 1000);

		expect(recovered).toBe(true);
		expect(failed).toBe(false);
		expect(goto).toHaveBeenCalledWith("https://x.com/home", {
			waitUntil: "domcontentloaded",
		});
	});

	it("filters bookmark thread chains with metadata options", () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const thread = [
			{ id: "1", text: "root", url: "u1", authorHandle: "a" },
			{ id: "2", text: "middle", url: "u2", authorHandle: "a" },
			{ id: "3", text: "other", url: "u3", authorHandle: "b" },
		];

		const rootOnly = client.filterThreadForBookmark(thread, thread[1], {
			expandRootOnly: true,
		});
		expect(rootOnly).toEqual([thread[1]]);

		const filtered = client.filterThreadForBookmark(thread, thread[1], {
			authorChain: true,
			includeParent: true,
			threadMeta: true,
		});
		expect(filtered.length).toBe(2);
		expect(filtered.every((item: any) => item.isThread)).toBe(true);
		expect(filtered.some((item: any) => item.isBookmarkedTweet)).toBe(true);
	});

	it("navigates follow tabs for user id and current user handle", async () => {
		const sessions = sessionStub();
		const client: any = new PlaywrightXClient(options, sessions as any);
		const goto = vi.fn(async () => {});
		const waitForSelector = vi.fn(async () => {});
		const page = { goto, waitForSelector };

		client.ensureAuth = vi.fn(async () => {});
		await client.navigateFollowTab(page, "following", "123");
		await client.navigateFollowTab(page, "followers");

		expect(goto).toHaveBeenCalledWith("https://x.com/i/user/123/following", {
			waitUntil: "domcontentloaded",
		});
		expect(goto).toHaveBeenCalledWith("https://x.com/tester/followers", {
			waitUntil: "domcontentloaded",
		});

		(sessions.whoAmI as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			name: "Tester",
		});
		await expect(client.navigateFollowTab(page, "followers")).rejects.toThrow(
			"Unable to resolve current user handle",
		);
	});

	it("opens list membership dialog via fallback profile menu scanning", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const goto = vi.fn(async () => {});
		const waitForSelector = vi.fn(async () => {});
		const waitForTimeout = vi.fn(async () => {});
		const press = vi.fn(async () => {});
		const buttons = [
			{ isVisible: async () => true, click: async () => {} },
			{ isVisible: async () => true, click: async () => {} },
		];

		const page = {
			goto,
			waitForSelector,
			waitForTimeout,
			keyboard: { press },
			locator: (selector: string) => {
				if (selector.includes('main button[aria-haspopup="menu"]')) {
					return {
						count: async () => buttons.length,
						nth: (index: number) => buttons[index],
					};
				}
				return locatorStub();
			},
		};

		client.firstVisibleLocator = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ click: async () => {} });
		client.clickFirstVisible = vi.fn(async () => true);

		const dialogSelector = await client.openListMembershipDialog(
			page,
			"@target",
		);
		expect(dialogSelector).toContain('[role="dialog"]');
		expect(press).toHaveBeenCalledWith("Escape");
	});

	it("throws when list membership menu item cannot be clicked", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const page = {
			goto: async () => {},
			waitForSelector: async () => {},
			waitForTimeout: async () => {},
			keyboard: { press: async () => {} },
			locator: () => locatorStub(),
		};

		client.firstVisibleLocator = vi.fn(async () => ({ click: async () => {} }));
		client.clickFirstVisible = vi.fn(async () => false);

		await expect(
			client.openListMembershipDialog(page, "@target"),
		).rejects.toThrow('Could not locate "Add/remove from Lists" menu item');
	});

	it("sets list membership for added/already/not-found/error outcomes", async () => {
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		const press = vi.fn(async () => {});
		const checkbox = {
			innerText: async () => "Test List",
			getAttribute: async () => "false",
			click: async () => {},
		};
		const page = {
			locator: (selector: string) => {
				if (selector.includes('[role="checkbox"]')) {
					return {
						count: async () => 1,
						nth: () => checkbox,
					};
				}
				return locatorStub();
			},
			keyboard: { press },
		};

		client.openListMembershipDialog = vi.fn(async () => '[role="dialog"]');
		client.clickFirstVisible = vi.fn(async () => false);

		const added = await client.setListMembership(page, "Test List", "@a", true);
		expect(added.status).toBe("added");
		expect(press).toHaveBeenCalledWith("Escape");

		const alreadyCheckbox = {
			innerText: async () => "Test List",
			getAttribute: async () => "true",
			click: async () => {},
		};
		const alreadyPage = {
			locator: () => ({
				count: async () => 1,
				nth: () => alreadyCheckbox,
			}),
			keyboard: { press },
		};
		const already = await client.setListMembership(
			alreadyPage,
			"Test List",
			"@a",
			true,
		);
		expect(already.status).toBe("already");

		const missingCheckbox = {
			innerText: async () => "Different List",
			getAttribute: async () => "false",
			click: async () => {},
		};
		const missingPage = {
			locator: () => ({
				count: async () => 1,
				nth: () => missingCheckbox,
			}),
			keyboard: { press },
		};
		const missing = await client.setListMembership(
			missingPage,
			"Test List",
			"@a",
			true,
		);
		expect(missing.status).toBe("error");

		client.openListMembershipDialog = vi.fn(async () => {
			throw new Error("dialog failed");
		});
		const errored = await client.setListMembership(
			page,
			"Test List",
			"@a",
			true,
		);
		expect(errored.status).toBe("error");
	});

	it("bookmarks honors folder targets and unbookmark captures thrown errors", async () => {
		vi.spyOn(scrape, "collectTweets").mockResolvedValue({
			items: [
				{ id: "2", text: "new", url: "u2" },
				{ id: "1", text: "old", url: "u1", createdAt: "2026-01-01" },
			],
			pagesFetched: 1,
		} as any);

		const goto = vi.fn(async () => {});
		const client: any = new PlaywrightXClient(options, sessionStub() as any);
		client.withPage = vi.fn(async (task: any) => task(pageStub({ goto })));
		client.ensureAuth = vi.fn(async () => {});

		const bookmarks = await client.bookmarks({
			count: 2,
			all: false,
			delayMs: 10,
			folderId: "999",
			includeAncestorBranches: true,
			sortChronological: true,
		} as any);

		expect(goto).toHaveBeenCalledWith("https://x.com/i/bookmarks/999", {
			waitUntil: "domcontentloaded",
		});
		expect(bookmarks.warnings?.[0]).toContain("full-chain bookmark modes");

		client.ensureAuth = vi.fn(async () => {
			throw new Error("auth failed");
		});
		const unbookmark = await client.unbookmark(["1"]);
		expect(unbookmark.errors).toBe(1);
		expect(unbookmark.details[0]?.error).toContain("auth failed");
	});
});
