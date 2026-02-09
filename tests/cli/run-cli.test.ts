import { beforeEach, describe, expect, it, vi } from "vitest";

const parseMock = vi.fn();
const createProgramMock = vi.fn(() => ({ parse: parseMock }));
const registerGlobalOptionsMock = vi.fn((program: any) =>
	program.option("--compat-json").option("--quote-depth <n>"),
);
const normalizeInvocationMock = vi.fn((args: string[]) => args);
const outputCtorMock = vi.fn().mockImplementation(() => ({}));
const clientCtorMock = vi.fn().mockImplementation(() => ({}));
const createHandlersMock = vi.fn().mockImplementation(() => ({}));

vi.mock("../../src/cli/program.js", () => ({
	createProgram: (...args: unknown[]) => createProgramMock(...args),
	registerGlobalOptions: (...args: unknown[]) =>
		registerGlobalOptionsMock(...args),
}));

vi.mock("../../src/client/playwright-client.js", () => ({
	PlaywrightXClient: function MockPlaywrightXClient(...args: unknown[]) {
		return clientCtorMock(...args);
	},
}));

vi.mock("../../src/commands/handlers.js", () => ({
	createHandlers: (...args: unknown[]) => createHandlersMock(...args),
}));

vi.mock("../../src/lib/output.js", () => ({
	Output: function MockOutput(...args: unknown[]) {
		return outputCtorMock(...args);
	},
}));

vi.mock("../../src/lib/invocation.js", () => ({
	normalizeInvocation: (...args: unknown[]) => normalizeInvocationMock(...args),
}));

describe("runCli", () => {
	beforeEach(() => {
		parseMock.mockClear();
		createProgramMock.mockClear();
		registerGlobalOptionsMock.mockClear();
		normalizeInvocationMock.mockReset();
		normalizeInvocationMock.mockImplementation((args: string[]) => args);
		outputCtorMock.mockClear();
		clientCtorMock.mockClear();
		createHandlersMock.mockClear();
	});

	it("normalizes args and parses the generated command program", async () => {
		const { runCli } = await import("../../src/cli.js");

		await runCli(["--", "check"]);

		expect(normalizeInvocationMock).toHaveBeenCalledWith(["check"]);
		expect(outputCtorMock).toHaveBeenCalledTimes(1);
		expect(clientCtorMock).toHaveBeenCalledTimes(1);
		expect(createProgramMock).toHaveBeenCalledTimes(1);
		expect(parseMock).toHaveBeenCalledWith(["node", "frigatebird", "check"]);
	});

	it("passes compat json and quote depth through to handlers", async () => {
		const { runCli } = await import("../../src/cli.js");

		await runCli(["--compat-json", "--quote-depth", "2", "search", "hello"]);

		const handlerDeps = createHandlersMock.mock.calls.at(-1)?.[0] as {
			compatJson?: boolean;
			quoteDepth?: number;
		};
		expect(handlerDeps.compatJson).toBe(true);
		expect(handlerDeps.quoteDepth).toBe(2);
	});
});
