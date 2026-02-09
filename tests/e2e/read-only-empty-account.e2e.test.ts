import { execFile } from "node:child_process";
import { type Server, createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../",
);
const TSX_BIN = path.resolve(ROOT, "node_modules/.bin/tsx");

interface CliResult {
	stdout: string;
	stderr: string;
	code: number;
}

interface JsonCommandCase {
	id: string;
	args: string[];
}

function html(body: string): string {
	return `<!doctype html><html><head><meta charset="utf-8"><title>fixture</title></head><body>${body}</body></html>`;
}

function loggedInShell(content: string): string {
	return html(`
		<a data-testid="AppTabBar_Home_Link" href="/home">Home</a>
		<a data-testid="AppTabBar_Profile_Link" href="/tester">Profile</a>
		<button data-testid="SideNav_AccountSwitcher_Button">Tester\n@tester</button>
		${content}
	`);
}

function tweetCard(id: string, text: string): string {
	return `
		<article data-testid="tweet">
			<div data-testid="User-Name">Example User\n@example</div>
			<div data-testid="tweetText">${text}</div>
			<a href="/example/status/${id}"><time datetime="2026-01-01T00:00:00.000Z">now</time></a>
		</article>
	`;
}

function profilePage(handle: string): string {
	return html(`
		<div data-testid="primaryColumn">
			<div data-testid="UserName"><span>Empty User</span></div>
			<div data-testid="UserDescription">No posts yet</div>
			<div data-testid="UserLocation">Nowhere</div>
			<div data-testid="UserJoinDate">Joined January 2024</div>
			<div data-testid="UserUrl"><a href="https://example.test">example.test</a></div>
			<div>Account based in Exampleland</div>
			<a href="https://help.x.com/rules">Learn more</a>
		</div>
		<div>@${handle}</div>
	`);
}

async function runCli(
	args: string[],
	env: NodeJS.ProcessEnv,
): Promise<CliResult> {
	try {
		const { stdout, stderr } = await execFileAsync(
			TSX_BIN,
			["src/cli.ts", ...args],
			{
				cwd: ROOT,
				env,
				maxBuffer: 1024 * 1024 * 4,
			},
		);
		return { stdout, stderr, code: 0 };
	} catch (error: unknown) {
		const details = error as {
			stdout?: string;
			stderr?: string;
			code?: number;
		};
		return {
			stdout: details.stdout ?? "",
			stderr: details.stderr ?? "",
			code: details.code ?? 1,
		};
	}
}

function formatCliFailure(args: string[], result: CliResult): string {
	const renderedArgs = args.join(" ");
	const stdout = result.stdout.trim() || "<empty>";
	const stderr = result.stderr.trim() || "<empty>";
	return `CLI command failed (code=${result.code}): frigatebird ${renderedArgs}\nstdout:\n${stdout}\nstderr:\n${stderr}`;
}

function expectCliOk(result: CliResult, args: string[]): void {
	expect(result.code, formatCliFailure(args, result)).toBe(0);
}

function parseJson<T>(result: CliResult, args: string[]): T {
	expectCliOk(result, args);
	return JSON.parse(result.stdout) as T;
}

async function runJsonBatch(
	cases: JsonCommandCase[],
	env: NodeJS.ProcessEnv,
	concurrency = 3,
): Promise<Record<string, unknown>> {
	const outputs = new Map<string, unknown>();
	let cursor = 0;

	const worker = async () => {
		while (cursor < cases.length) {
			const index = cursor;
			cursor += 1;
			const testCase = cases[index];
			if (!testCase) continue;

			const result = await runCli(testCase.args, env);
			outputs.set(testCase.id, parseJson(result, testCase.args));
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(concurrency, cases.length) }, worker),
	);

	return Object.fromEntries(outputs);
}

describe("e2e read-only with empty account", () => {
	let server: Server;
	let baseUrl = "";
	let chromiumReady = false;

	beforeAll(async () => {
		try {
			const browser = await chromium.launch({ headless: true });
			await browser.close();
			chromiumReady = true;
		} catch {
			chromiumReady = false;
			return;
		}

		server = createServer((req, res) => {
			const requestUrl = new URL(req.url ?? "/", "http://localhost");
			const p = requestUrl.pathname;

			res.setHeader("content-type", "text/html; charset=utf-8");

			if (p === "/home") {
				res.end(loggedInShell("<main><h1>Home Empty</h1></main>"));
				return;
			}

			if (p === "/i/web/status/1234567890123456789") {
				res.end(
					html(
						[
							tweetCard(
								"1234567890123456789",
								"Fixture tweet for read command",
							),
							tweetCard("1234567890123456790", "Fixture reply one"),
							tweetCard("1234567890123456791", "Fixture reply two"),
						].join(""),
					),
				);
				return;
			}

			if (p === "/search") {
				res.end(html("<main><h1>Search Empty</h1></main>"));
				return;
			}

			if (p === "/emptyuser") {
				res.end(profilePage("emptyuser"));
				return;
			}

			if (p === "/i/lists/999999") {
				res.end(html("<main><h1>List Empty</h1></main>"));
				return;
			}

			if (p === "/explore/tabs/news") {
				res.end(html("<main><h1>News Empty</h1></main>"));
				return;
			}

			if (p === "/notifications/mentions") {
				res.end(loggedInShell("<main><h1>Mentions Empty</h1></main>"));
				return;
			}

			if (p === "/i/lists") {
				res.end(loggedInShell("<main><h1>Lists Empty</h1></main>"));
				return;
			}

			if (p === "/i/bookmarks") {
				res.end(loggedInShell("<main><h1>Bookmarks Empty</h1></main>"));
				return;
			}

			if (p === "/tester/likes") {
				res.end(loggedInShell("<main><h1>Likes Empty</h1></main>"));
				return;
			}

			if (p === "/tester/following") {
				res.end(loggedInShell("<main><h1>Following Empty</h1></main>"));
				return;
			}

			if (p === "/tester/followers") {
				res.end(loggedInShell("<main><h1>Followers Empty</h1></main>"));
				return;
			}

			res.statusCode = 404;
			res.end(html(`<h1>Not Found: ${p}</h1>`));
		});

		await new Promise<void>((resolve) => {
			server.listen(0, "127.0.0.1", () => resolve());
		});

		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error("Failed to start fixture server");
		}
		baseUrl = `http://127.0.0.1:${address.port}`;
	}, 60000);

	afterAll(async () => {
		if (server) {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		}
	});

	it("executes read-only commands against empty account fixtures", async () => {
		if (!chromiumReady) {
			expect(true).toBe(true);
			return;
		}

		const env = {
			...process.env,
			AUTH_TOKEN: "dummy-auth",
			CT0: "dummy-ct0",
			FRIGATEBIRD_BASE_URL: baseUrl,
			FRIGATEBIRD_HEADLESS: "1",
			NO_COLOR: "1",
		};

		const readArgs = ["read", "1234567890123456789", "--json"];
		const read = await runCli(readArgs, env);
		const readJson = parseJson<{ id: string; text: string }>(read, readArgs);
		expect(readJson.id).toBe("1234567890123456789");
		expect(readJson.text).toContain("Fixture tweet");

		const threadArgs = ["thread", "1234567890123456789", "--json", "-n", "3"];
		const thread = await runCli(threadArgs, env);
		expect(
			parseJson<{ items: unknown[] }>(thread, threadArgs).items.length,
		).toBeGreaterThanOrEqual(3);

		const repliesArgs = ["replies", "1234567890123456789", "--json", "-n", "3"];
		const replies = await runCli(repliesArgs, env);
		expect(
			parseJson<{ items: unknown[] }>(replies, repliesArgs).items.length,
		).toBeGreaterThanOrEqual(2);

		const batchOutputs = await runJsonBatch(
			[
				{ id: "search", args: ["search", "nothing", "-n", "1", "--json"] },
				{
					id: "userTweets",
					args: ["user-tweets", "@emptyuser", "-n", "1", "--json"],
				},
				{
					id: "listTimeline",
					args: ["list-timeline", "999999", "-n", "1", "--json"],
				},
				{ id: "news", args: ["news", "--news-only", "-n", "1", "--json"] },
				{
					id: "mentions",
					args: ["mentions", "--user", "@emptyuser", "-n", "1", "--json"],
				},
				{ id: "home", args: ["home", "-n", "1", "--json"] },
				{ id: "lists", args: ["lists", "-n", "1", "--json"] },
				{ id: "listAlias", args: ["list", "-n", "1", "--json"] },
				{ id: "bookmarks", args: ["bookmarks", "-n", "1", "--json"] },
				{ id: "likes", args: ["likes", "-n", "1", "--json"] },
				{ id: "following", args: ["following", "-n", "1", "--json"] },
				{ id: "followers", args: ["followers", "-n", "1", "--json"] },
			],
			env,
			3,
		);

		expect((batchOutputs.search as { items: unknown[] }).items).toEqual([]);
		expect((batchOutputs.userTweets as { items: unknown[] }).items).toEqual([]);
		expect((batchOutputs.listTimeline as { items: unknown[] }).items).toEqual(
			[],
		);
		expect((batchOutputs.news as { items: unknown[] }).items).toEqual([]);
		expect((batchOutputs.mentions as { items: unknown[] }).items).toEqual([]);
		expect((batchOutputs.home as { items: unknown[] }).items).toEqual([]);
		expect((batchOutputs.lists as { items: unknown[] }).items).toEqual([]);
		expect((batchOutputs.listAlias as { items: unknown[] }).items).toEqual([]);
		expect((batchOutputs.bookmarks as { items: unknown[] }).items).toEqual([]);
		expect((batchOutputs.likes as { items: unknown[] }).items).toEqual([]);
		expect((batchOutputs.following as { items: unknown[] }).items).toEqual([]);
		expect((batchOutputs.followers as { items: unknown[] }).items).toEqual([]);

		const aboutArgs = ["about", "@emptyuser", "--json"];
		const about = await runCli(aboutArgs, env);
		const aboutJson = parseJson<{ handle: string; accountBasedIn: string }>(
			about,
			aboutArgs,
		);
		expect(aboutJson.handle).toBe("emptyuser");
		expect(aboutJson.accountBasedIn).toBe("Exampleland");

		const checkArgs = ["check"];
		const check = await runCli(checkArgs, env);
		expectCliOk(check, checkArgs);
		expect(check.stdout).toContain("Logged in: yes");
		expect(check.stdout).toContain("auth_token: present");
		expect(check.stdout).toContain("ct0: present");

		const refreshArgs = ["refresh", "--json"];
		const refresh = await runCli(refreshArgs, env);
		const refreshJson = parseJson<{
			loggedIn: boolean;
			hasAuthToken: boolean;
			hasCt0: boolean;
		}>(refresh, refreshArgs);
		expect(refreshJson.loggedIn).toBe(true);
		expect(refreshJson.hasAuthToken).toBe(true);
		expect(refreshJson.hasCt0).toBe(true);

		const queryIdsArgs = ["query-ids", "--json"];
		const queryIds = await runCli(queryIdsArgs, env);
		const queryIdsJson = parseJson<{ mode: string; refreshed: boolean }>(
			queryIds,
			queryIdsArgs,
		);
		expect(queryIdsJson.mode).toBe("playwright");
		expect(queryIdsJson.refreshed).toBe(false);

		const helpArgs = ["help", "query-ids"];
		const help = await runCli(helpArgs, env);
		expectCliOk(help, helpArgs);
		expect(help.stdout).toContain("query-ids");
	}, 120000);
});
