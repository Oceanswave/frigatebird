import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import JSON5 from "json5";

export interface CliFileConfig {
	authToken?: string;
	ct0?: string;
	baseUrl?: string;
	cookieSource?: string | string[];
	chromeProfile?: string;
	chromeProfileDir?: string;
	firefoxProfile?: string;
	cookieTimeoutMs?: number;
	timeoutMs?: number;
	quoteDepth?: number;
}

function readConfigFile(filePath: string): CliFileConfig {
	if (!fs.existsSync(filePath)) return {};

	try {
		const raw = fs.readFileSync(filePath, "utf8");
		const parsed = JSON5.parse(raw);
		if (!parsed || typeof parsed !== "object") return {};
		return parsed as CliFileConfig;
	} catch {
		return {};
	}
}

export function loadConfig(cwd = process.cwd()): CliFileConfig {
	const globalBird = path.join(homedir(), ".config", "bird", "config.json5");
	const globalFrigatebird = path.join(
		homedir(),
		".config",
		"frigatebird",
		"config.json5",
	);
	const localBird = path.join(cwd, ".birdrc.json5");
	const localFrigatebird = path.join(cwd, ".frigatebirdrc.json5");

	return {
		...readConfigFile(globalBird),
		...readConfigFile(globalFrigatebird),
		...readConfigFile(localBird),
		...readConfigFile(localFrigatebird),
	};
}

function parseTruthy(value: string | undefined): boolean | undefined {
	if (!value) return undefined;
	const normalized = value.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "off"].includes(normalized)) return false;
	return undefined;
}

function parseCsv(value: string | undefined): string[] | undefined {
	if (!value) return undefined;
	const parts = value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	return parts.length > 0 ? parts : undefined;
}

export function resolveEnvConfig(
	env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
	const authToken =
		env.AUTH_TOKEN ?? env.TWITTER_AUTH_TOKEN ?? env.FRIGATEBIRD_AUTH_TOKEN;
	const ct0 = env.CT0 ?? env.TWITTER_CT0 ?? env.FRIGATEBIRD_CT0;

	const cookieSource =
		parseCsv(env.BIRD_COOKIE_SOURCE) ?? parseCsv(env.FRIGATEBIRD_COOKIE_SOURCE);

	const timeout = env.BIRD_TIMEOUT_MS ?? env.FRIGATEBIRD_TIMEOUT_MS;
	const cookieTimeout =
		env.BIRD_COOKIE_TIMEOUT_MS ?? env.FRIGATEBIRD_COOKIE_TIMEOUT_MS;
	const quoteDepth = env.BIRD_QUOTE_DEPTH ?? env.FRIGATEBIRD_QUOTE_DEPTH;

	const plain =
		parseTruthy(env.BIRD_PLAIN) ?? parseTruthy(env.FRIGATEBIRD_PLAIN);
	const headless =
		parseTruthy(env.BIRD_HEADLESS) ?? parseTruthy(env.FRIGATEBIRD_HEADLESS);
	const noColor = env.NO_COLOR ? true : undefined;

	return {
		authToken,
		ct0,
		baseUrl: env.BIRD_BASE_URL ?? env.FRIGATEBIRD_BASE_URL,
		cookieSource,
		timeout,
		cookieTimeout,
		quoteDepth,
		chromeProfile: env.BIRD_CHROME_PROFILE ?? env.FRIGATEBIRD_CHROME_PROFILE,
		chromeProfileDir:
			env.BIRD_CHROME_PROFILE_DIR ?? env.FRIGATEBIRD_CHROME_PROFILE_DIR,
		firefoxProfile: env.BIRD_FIREFOX_PROFILE ?? env.FRIGATEBIRD_FIREFOX_PROFILE,
		plain,
		headless,
		color: noColor ? false : undefined,
	};
}
