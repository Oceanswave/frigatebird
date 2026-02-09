import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command, Option } from "commander";
import { describe, expect, it } from "vitest";
import { createProgram } from "../../src/cli/program.js";
import type { CommandHandlers } from "../../src/commands/handlers.js";

interface OptionContract {
	flags: string;
	long: string | null;
	short: string | null;
	required: boolean;
	optional: boolean;
	negate: boolean;
}

interface ArgumentContract {
	name: string;
	required: boolean;
	variadic: boolean;
}

interface CommandContract {
	name: string;
	aliases: string[];
	args: ArgumentContract[];
	options: OptionContract[];
}

interface ProgramContract {
	globalOptions: OptionContract[];
	commands: CommandContract[];
}

const CONTRACT_FIXTURE_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../fixtures/cli-contract.json",
);

function toOptionContract(option: Option): OptionContract {
	return {
		flags: option.flags,
		long: option.long ?? null,
		short: option.short ?? null,
		required: option.required,
		optional: option.optional,
		negate: option.negate,
	};
}

function extractProgramContract(program: Command): ProgramContract {
	return {
		globalOptions: program.options.map((option) => toOptionContract(option)),
		commands: program.commands
			.map((command) => ({
				name: command.name(),
				aliases: command.aliases(),
				args: command.registeredArguments.map((argument) => ({
					name: argument.name(),
					required: argument.required,
					variadic: argument.variadic,
				})),
				options: command.options.map((option) => toOptionContract(option)),
			}))
			.sort((a, b) => a.name.localeCompare(b.name)),
	};
}

function createNoopHandlers(): CommandHandlers {
	return new Proxy(
		{},
		{
			get: () => async () => undefined,
		},
	) as CommandHandlers;
}

function readContractFixture(): ProgramContract {
	return JSON.parse(
		fs.readFileSync(CONTRACT_FIXTURE_PATH, "utf8"),
	) as ProgramContract;
}

describe("cli contract snapshot", () => {
	it("matches locked command and flag contract", () => {
		const program = createProgram(createNoopHandlers(), "0.3.0");
		const actual = extractProgramContract(program);
		const expected = readContractFixture();
		expect(actual).toEqual(expected);
	});
});
