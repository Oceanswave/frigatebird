import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import { BrowserSessionManager } from "../../src/browser/session-manager.js";

function createPageMock(options: {
	attributes?: Record<string, string | null>;
	textBySelector?: Record<string, string>;
}): Page {
	const attributes = options.attributes ?? {};
	const textBySelector = options.textBySelector ?? {};

	return {
		getAttribute: vi.fn(async (selector: string, attributeName: string) => {
			const key = `${selector}|${attributeName}`;
			return attributes[key] ?? null;
		}),
		locator: vi.fn((selector: string) => ({
			first: () => ({
				innerText: vi.fn(async () => textBySelector[selector] ?? ""),
			}),
		})),
	} as unknown as Page;
}

describe("BrowserSessionManager whoAmI", () => {
	it("extracts handle from profile link and name from account switcher text", async () => {
		const manager = new BrowserSessionManager();
		const page = createPageMock({
			attributes: {
				'[data-testid="AppTabBar_Profile_Link"]|href': "/tester",
			},
			textBySelector: {
				'[data-testid="SideNav_AccountSwitcher_Button"]': "Tester\n@tester",
			},
		});

		const me = await manager.whoAmI(page);
		expect(me).toEqual({ handle: "tester", name: "Tester" });
	});

	it("falls back to handle found in account switcher text", async () => {
		const manager = new BrowserSessionManager();
		const page = createPageMock({
			textBySelector: {
				'[data-testid="SideNav_AccountSwitcher_Button"]':
					"Frigate Bird\n@frigatebird_qa",
			},
		});

		const me = await manager.whoAmI(page);
		expect(me).toEqual({ handle: "frigatebird_qa", name: "Frigate Bird" });
	});

	it("falls back to aria-label and alternate profile selectors", async () => {
		const manager = new BrowserSessionManager();
		const page = createPageMock({
			attributes: {
				'a[data-testid$="_Profile_Link"]|href': "/alt_user",
				'[data-testid="SideNav_AccountSwitcher_Button"]|aria-label':
					"Alt User\n@alt_user",
			},
		});

		const me = await manager.whoAmI(page);
		expect(me).toEqual({ handle: "alt_user", name: "Alt User" });
	});

	it("does not treat reserved routes as handles", async () => {
		const manager = new BrowserSessionManager();
		const page = createPageMock({
			attributes: {
				'[data-testid="AppTabBar_Profile_Link"]|href': "/home",
			},
			textBySelector: {
				'[data-testid="SideNav_AccountSwitcher_Button"]':
					"Frigate Bird Account",
			},
		});

		const me = await manager.whoAmI(page);
		expect(me).toEqual({ handle: undefined, name: "Frigate Bird Account" });
	});
});
