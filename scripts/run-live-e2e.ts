import { spawn } from "node:child_process";
import path from "node:path";

interface ParsedArgs {
	listName?: string;
	cookieSource?: string;
	articleCookieSource?: string;
	articleExpectedHandlePrefix?: string;
	enablePremiumFeaturesE2E: boolean;
	passThrough: string[];
}

function parseArgs(args: string[]): ParsedArgs {
	let listName: string | undefined;
	let cookieSource: string | undefined;
	let articleCookieSource: string | undefined;
	let articleExpectedHandlePrefix: string | undefined;
	let enablePremiumFeaturesE2E = false;
	const passThrough: string[] = [];

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) continue;

		if (arg === "--list-name") {
			const value = args[index + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("--list-name requires a value");
			}
			listName = value.trim();
			index += 1;
			continue;
		}

		if (arg.startsWith("--list-name=")) {
			listName = arg.slice("--list-name=".length).trim();
			continue;
		}

		if (arg === "--cookie-source") {
			const value = args[index + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("--cookie-source requires a value");
			}
			cookieSource = value.trim();
			index += 1;
			continue;
		}

		if (arg.startsWith("--cookie-source=")) {
			cookieSource = arg.slice("--cookie-source=".length).trim();
			continue;
		}

		if (arg === "--article-cookie-source") {
			const value = args[index + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("--article-cookie-source requires a value");
			}
			articleCookieSource = value.trim();
			index += 1;
			continue;
		}

		if (arg.startsWith("--article-cookie-source=")) {
			articleCookieSource = arg.slice("--article-cookie-source=".length).trim();
			continue;
		}

		if (arg === "--article-expected-handle-prefix") {
			const value = args[index + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("--article-expected-handle-prefix requires a value");
			}
			articleExpectedHandlePrefix = value.trim();
			index += 1;
			continue;
		}

		if (arg.startsWith("--article-expected-handle-prefix=")) {
			articleExpectedHandlePrefix = arg
				.slice("--article-expected-handle-prefix=".length)
				.trim();
			continue;
		}

		if (arg === "--enable-premium-features-e2e") {
			enablePremiumFeaturesE2E = true;
			continue;
		}

		passThrough.push(arg);
	}

	if (!listName) {
		throw new Error(
			"Missing required --list-name argument. Example: npm run test:e2e:live -- --list-name testlist001",
		);
	}

	return {
		listName,
		cookieSource,
		articleCookieSource,
		articleExpectedHandlePrefix,
		enablePremiumFeaturesE2E,
		passThrough,
	};
}

function run(): void {
	let parsed: ParsedArgs;
	try {
		parsed = parseArgs(process.argv.slice(2));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		process.exit(1);
		return;
	}

	const vitestBin = path.resolve(process.cwd(), "node_modules/.bin/vitest");
	const vitestArgs = [
		"run",
		"--config",
		"vitest.e2e.config.ts",
		"tests/e2e/live-mutation-account.e2e.test.ts",
		...parsed.passThrough,
		"--",
		"--list-name",
		parsed.listName,
	];

	const child = spawn(vitestBin, vitestArgs, {
		stdio: "inherit",
		env: {
			...process.env,
			FRIGATEBIRD_LIVE_E2E: "1",
			...(parsed.cookieSource
				? { FRIGATEBIRD_LIVE_COOKIE_SOURCE: parsed.cookieSource }
				: {}),
			...(parsed.articleCookieSource
				? {
						FRIGATEBIRD_LIVE_ARTICLE_COOKIE_SOURCE: parsed.articleCookieSource,
					}
				: {}),
			...(parsed.articleExpectedHandlePrefix
				? {
						FRIGATEBIRD_LIVE_ARTICLE_EXPECTED_HANDLE_PREFIX:
							parsed.articleExpectedHandlePrefix,
					}
				: {}),
			...(parsed.enablePremiumFeaturesE2E
				? {
						FRIGATEBIRD_LIVE_ENABLE_PREMIUM_FEATURES_E2E: "1",
					}
				: {}),
		},
	});

	child.on("error", (error) => {
		console.error(error);
		process.exit(1);
	});

	child.on("exit", (code, signal) => {
		if (signal) {
			process.kill(process.pid, signal);
			return;
		}
		process.exit(code ?? 1);
	});
}

run();
