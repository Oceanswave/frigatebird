#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { createProgram, registerGlobalOptions } from "./cli/program.js";
import { PlaywrightXClient } from "./client/playwright-client.js";
import { createHandlers } from "./commands/handlers.js";
import { loadConfig, resolveEnvConfig } from "./lib/config.js";
import { normalizeInvocation } from "./lib/invocation.js";
import { parseGlobalOptions } from "./lib/options.js";
import { Output } from "./lib/output.js";

export function readVersion(cwd = process.cwd()): string {
	try {
		const packageJsonPath = path.join(cwd, "package.json");
		const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
			version?: string;
		};
		return parsed.version ?? "0.2.0";
	} catch {
		return "0.2.0";
	}
}

function collectExplicitCliBooleans(args: string[]): Record<string, unknown> {
	const explicit: Record<string, unknown> = {};
	if (args.includes("--plain")) explicit.plain = true;
	if (args.includes("--no-color")) explicit.color = false;
	if (args.includes("--no-emoji")) explicit.emoji = false;
	if (args.includes("--no-headless")) explicit.headless = false;
	if (args.includes("--cookie-source")) explicit.cookieSourceExplicit = true;
	return explicit;
}

function compactObject(
	input: Record<string, unknown>,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined),
	);
}

export function parseGlobalCliOptions(
	args: string[],
	env: NodeJS.ProcessEnv = process.env,
	cwd = process.cwd(),
) {
	const parser = registerGlobalOptions(new Command());
	parser.allowUnknownOption(true);
	parser.parseOptions(args);
	const cliRaw = parser.opts<Record<string, unknown>>();
	if (!args.includes("--plain")) cliRaw.plain = undefined;
	if (!args.includes("--no-color")) cliRaw.color = undefined;
	if (!args.includes("--no-emoji")) cliRaw.emoji = undefined;
	if (!args.includes("--no-headless")) cliRaw.headless = undefined;
	const explicitBooleans = collectExplicitCliBooleans(args);

	const fileConfig = loadConfig(cwd);
	const configRaw: Record<string, unknown> = {
		authToken: fileConfig.authToken,
		ct0: fileConfig.ct0,
		baseUrl: fileConfig.baseUrl,
		cookieSource: fileConfig.cookieSource,
		chromeProfile: fileConfig.chromeProfile,
		chromeProfileDir: fileConfig.chromeProfileDir,
		firefoxProfile: fileConfig.firefoxProfile,
		cookieTimeout: fileConfig.cookieTimeoutMs,
		timeout: fileConfig.timeoutMs,
		quoteDepth: fileConfig.quoteDepth,
	};

	const mergedRaw = {
		...configRaw,
		...compactObject(resolveEnvConfig(env)),
		...compactObject(cliRaw),
		...explicitBooleans,
	};

	const options = parseGlobalOptions(mergedRaw);

	if (options.plain) {
		options.color = false;
		options.emoji = false;
	}

	return options;
}

export async function runCli(rawArgs = process.argv.slice(2)): Promise<void> {
	const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
	const normalizedArgs = normalizeInvocation(args);
	const globalOptions = parseGlobalCliOptions(normalizedArgs);

	const output = new Output({
		plain: globalOptions.plain,
		color: globalOptions.color,
		emoji: globalOptions.emoji,
	});

	const client = new PlaywrightXClient(globalOptions);
	const handlers = createHandlers({
		client,
		output,
		compatJson: globalOptions.compatJson,
		quoteDepth: globalOptions.quoteDepth,
	});
	const program = createProgram(handlers, readVersion());

	program.parse(["node", "frigatebird", ...normalizedArgs]);
}

export function isDirectExecution(
	moduleUrl: string,
	argvPath = process.argv[1],
): boolean {
	if (!argvPath) return false;

	try {
		const invokedPath = fs.realpathSync(argvPath);
		const modulePath = fs.realpathSync(fileURLToPath(moduleUrl));
		return invokedPath === modulePath;
	} catch {
		return false;
	}
}

if (process.argv[1]) {
	if (isDirectExecution(import.meta.url, process.argv[1])) {
		runCli().catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			console.error(message);
			process.exitCode = 1;
		});
	}
}
