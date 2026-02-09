import { spawn } from "node:child_process";
import path from "node:path";

interface ParsedArgs {
	listName?: string;
	passThrough: string[];
}

function parseArgs(args: string[]): ParsedArgs {
	let listName: string | undefined;
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

		passThrough.push(arg);
	}

	if (!listName) {
		throw new Error(
			"Missing required --list-name argument. Example: npm run test:e2e:live -- --list-name testlist001",
		);
	}

	return { listName, passThrough };
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
	];

	const child = spawn(vitestBin, vitestArgs, {
		stdio: "inherit",
		env: {
			...process.env,
			FRIGATEBIRD_LIVE_E2E: "1",
			FRIGATEBIRD_LIVE_LIST_NAME: parsed.listName,
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
