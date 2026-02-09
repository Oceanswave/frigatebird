import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../",
);
const TSX_BIN = path.resolve(ROOT, "node_modules/.bin/tsx");

const LIVE_ENABLED = process.env.FRIGATEBIRD_LIVE_E2E === "1";
const COOKIE_SOURCE = process.env.FRIGATEBIRD_LIVE_COOKIE_SOURCE ?? "safari";
const COOKIE_TIMEOUT_MS =
	process.env.FRIGATEBIRD_LIVE_COOKIE_TIMEOUT_MS ?? "15000";
const CLI_TIMEOUT_MS = Number.parseInt(
	process.env.FRIGATEBIRD_LIVE_COMMAND_TIMEOUT_MS ?? "90000",
	10,
);
const EXPECTED_PREFIX =
	process.env.FRIGATEBIRD_LIVE_EXPECTED_HANDLE_PREFIX ?? "frigatebird_";
const TARGET_HANDLE =
	process.env.FRIGATEBIRD_LIVE_TARGET_HANDLE ?? "Oceanswave";
const LIST_NAME = process.env.FRIGATEBIRD_LIVE_LIST_NAME?.trim();

interface CliResult {
	stdout: string;
	stderr: string;
	code: number;
}

interface TweetItem {
	id: string;
	text: string;
	url: string;
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

async function runCli(args: string[]): Promise<CliResult> {
	const env = {
		...process.env,
		NO_COLOR: "1",
	};

	try {
		const { stdout, stderr } = await execFileAsync(
			TSX_BIN,
			[
				"src/cli.ts",
				"--cookie-source",
				COOKIE_SOURCE,
				"--cookie-timeout",
				COOKIE_TIMEOUT_MS,
				"--plain",
				...args,
			],
			{
				cwd: ROOT,
				env,
				maxBuffer: 1024 * 1024 * 4,
				timeout: Number.isFinite(CLI_TIMEOUT_MS)
					? Math.max(5000, CLI_TIMEOUT_MS)
					: 90000,
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

async function runCliWithRetries(
	args: string[],
	attempts = 3,
	delayMs = 1500,
): Promise<CliResult> {
	let last = await runCli(args);
	if (last.code === 0) return last;

	for (let attempt = 2; attempt <= attempts; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, delayMs));
		last = await runCli(args);
		if (last.code === 0) return last;
	}

	return last;
}

function parseJson<T>(text: string): T {
	return JSON.parse(text) as T;
}

async function waitForTweetByTag(
	handle: string,
	tag: string,
	attempts = 8,
	delayMs = 1200,
): Promise<TweetItem | null> {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const response = await runCli([
			"user-tweets",
			handle,
			"--count",
			"20",
			"--json",
		]);
		if (response.code === 0) {
			const payload = parseJson<{ items: TweetItem[] }>(response.stdout);
			const match = payload.items.find((item) => item.text.includes(tag));
			if (match) return match;
		}

		if (attempt < attempts - 1) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	return null;
}

async function waitForReplyByTag(
	tweetRef: string,
	tag: string,
	attempts = 8,
	delayMs = 1200,
): Promise<boolean> {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const response = await runCli([
			"replies",
			tweetRef,
			"--count",
			"20",
			"--json",
		]);
		if (response.code === 0) {
			const payload = parseJson<{ items: TweetItem[] }>(response.stdout);
			if (payload.items.some((item) => item.text.includes(tag))) {
				return true;
			}
		}

		if (attempt < attempts - 1) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	return false;
}

describe("live mutation e2e (opt-in)", () => {
	it("runs reversible mutation flows against a live account", async () => {
		if (!LIVE_ENABLED) {
			expect(true).toBe(true);
			return;
		}

		if (!LIST_NAME) {
			throw new Error(
				"Live list name is required. Run `npm run test:e2e:live -- --list-name <your-list>` so list add/remove/batch mutations can be validated.",
			);
		}

		const whoamiArgs = ["whoami", "--json"];
		let whoami = await runCliWithRetries(whoamiArgs);
		expectCliOk(whoami, whoamiArgs);
		let me = parseJson<{ handle?: string }>(whoami.stdout);

		if (!me.handle) {
			const whoamiRefreshArgs = ["refresh", "--json"];
			const whoamiRefresh = await runCliWithRetries(whoamiRefreshArgs);
			expectCliOk(whoamiRefresh, whoamiRefreshArgs);

			whoami = await runCliWithRetries(whoamiArgs);
			expectCliOk(whoami, whoamiArgs);
			me = parseJson<{ handle?: string }>(whoami.stdout);
		}

		expect(me.handle).toBeTruthy();

		if (!me.handle?.startsWith(EXPECTED_PREFIX)) {
			throw new Error(
				`Refusing live mutations: authenticated handle @${me.handle ?? "unknown"} does not start with expected prefix "${EXPECTED_PREFIX}". Override with FRIGATEBIRD_LIVE_EXPECTED_HANDLE_PREFIX if intentional.`,
			);
		}

		const checkArgs = ["check"];
		const check = await runCliWithRetries(checkArgs);
		expectCliOk(check, checkArgs);
		expect(check.stdout).toMatch(/logged in:\s+yes/i);
		expect(check.stdout).toMatch(/auth_token:\s+present/i);
		expect(check.stdout).toMatch(/ct0:\s+present/i);

		const refreshArgs = ["refresh", "--json"];
		const refresh = await runCliWithRetries(refreshArgs);
		expectCliOk(refresh, refreshArgs);
		const refreshJson = parseJson<{
			loggedIn: boolean;
			hasAuthToken: boolean;
			hasCt0: boolean;
		}>(refresh.stdout);
		expect(refreshJson.loggedIn).toBe(true);
		expect(refreshJson.hasAuthToken).toBe(true);
		expect(refreshJson.hasCt0).toBe(true);

		const queryIdsArgs = ["query-ids", "--json"];
		const queryIds = await runCliWithRetries(queryIdsArgs);
		expectCliOk(queryIds, queryIdsArgs);
		const queryIdsJson = parseJson<{ mode: string }>(queryIds.stdout);
		expect(queryIdsJson.mode).toBe("playwright");

		const tweetTag = `frigatebird-live-${Date.now()}`;
		const tweetArgs = ["tweet", `Live mutation smoke (${tweetTag})`];
		const tweet = await runCliWithRetries(tweetArgs);
		expectCliOk(tweet, tweetArgs);
		expect(tweet.stdout).toMatch(/tweet posted/i);

		const postedTweet = await waitForTweetByTag(me.handle, tweetTag);
		expect(postedTweet).toBeTruthy();

		const replyTag = `frigatebird-live-reply-${Date.now()}`;
		const replyArgs = [
			"reply",
			postedTweet?.url ?? postedTweet?.id ?? "",
			`Live mutation reply (${replyTag})`,
		];
		const reply = await runCliWithRetries(replyArgs);
		expectCliOk(reply, replyArgs);
		expect(reply.stdout).toMatch(/reply posted/i);

		const replyVisible = await waitForReplyByTag(
			postedTweet?.url ?? postedTweet?.id ?? "",
			replyTag,
		);
		expect(replyVisible).toBe(true);

		const likeArgs = ["like", postedTweet?.url ?? postedTweet?.id ?? ""];
		const like = await runCliWithRetries(likeArgs);
		expectCliOk(like, likeArgs);
		expect(like.stdout).toMatch(/liked|already liked/i);

		const retweetArgs = ["retweet", postedTweet?.url ?? postedTweet?.id ?? ""];
		const retweet = await runCliWithRetries(retweetArgs);
		expectCliOk(retweet, retweetArgs);
		expect(retweet.stdout).toMatch(/reposted|already reposted/i);

		const unbookmarkArgs = [
			"unbookmark",
			postedTweet?.url ?? postedTweet?.id ?? "",
			"--json",
		];
		const unbookmark = await runCliWithRetries(unbookmarkArgs);
		expectCliOk(unbookmark, unbookmarkArgs);
		const unbookmarkJson = parseJson<{
			errors: number;
			removed: number;
			already: number;
		}>(unbookmark.stdout);
		expect(unbookmarkJson.errors).toBe(0);
		expect(
			unbookmarkJson.removed + unbookmarkJson.already,
		).toBeGreaterThanOrEqual(1);

		const postTag = `frigatebird-live-post-${Date.now()}`;
		const postArgs = ["post", `Live alias post (${postTag})`];
		const post = await runCliWithRetries(postArgs);
		expectCliOk(post, postArgs);
		expect(post.stdout).toMatch(/tweet posted/i);
		const postedAliasTweet = await waitForTweetByTag(me.handle, postTag);
		expect(postedAliasTweet).toBeTruthy();

		const target = TARGET_HANDLE.startsWith("@")
			? TARGET_HANDLE
			: `@${TARGET_HANDLE}`;

		const followArgs = ["follow", target];
		const follow = await runCliWithRetries(followArgs);
		expectCliOk(follow, followArgs);
		expect(follow.stdout).toMatch(/followed|already following/i);
		const originallyFollowing = /already following/i.test(follow.stdout);

		const unfollowArgs = ["unfollow", target];
		const unfollow = await runCliWithRetries(unfollowArgs);
		expectCliOk(unfollow, unfollowArgs);
		expect(unfollow.stdout).toMatch(/unfollowed|not currently following/i);

		if (originallyFollowing) {
			const restoreFollowArgs = ["follow", target];
			const restoreFollow = await runCliWithRetries(restoreFollowArgs);
			expectCliOk(restoreFollow, restoreFollowArgs);
			expect(restoreFollow.stdout).toMatch(/followed|already following/i);
		}

		const addArgs = ["add", LIST_NAME, target, "--json"];
		const add = await runCliWithRetries(addArgs);
		expectCliOk(add, addArgs);
		const addJson = parseJson<{
			errors: number;
			added: number;
			already: number;
		}>(add.stdout);
		expect(addJson.errors).toBe(0);
		expect(addJson.added + addJson.already).toBeGreaterThanOrEqual(1);
		const wasAlreadyInList = addJson.already > 0;

		const removeArgs = ["remove", target, LIST_NAME, "--json"];
		const remove = await runCliWithRetries(removeArgs);
		expectCliOk(remove, removeArgs);
		const removeJson = parseJson<{
			errors: number;
			removed: number;
			already: number;
		}>(remove.stdout);
		expect(removeJson.errors).toBe(0);
		expect(removeJson.removed + removeJson.already).toBeGreaterThanOrEqual(1);

		if (wasAlreadyInList) {
			const restoreAddArgs = ["add", LIST_NAME, target, "--json"];
			const restoreAdd = await runCliWithRetries(restoreAddArgs);
			expectCliOk(restoreAdd, restoreAddArgs);
			const restoreAddJson = parseJson<{ errors: number }>(restoreAdd.stdout);
			expect(restoreAddJson.errors).toBe(0);
		}

		const batchFile = path.join(
			os.tmpdir(),
			`frigatebird-live-batch-${Date.now()}.json`,
		);
		fs.writeFileSync(batchFile, JSON.stringify({ [LIST_NAME]: [target] }));
		const batchArgs = ["batch", batchFile, "--json"];
		const batch = await runCliWithRetries(batchArgs);
		expectCliOk(batch, batchArgs);
		const batchJson = parseJson<{ errors: number }>(batch.stdout);
		expect(batchJson.errors).toBe(0);
		fs.unlinkSync(batchFile);
	}, 300000);
});
