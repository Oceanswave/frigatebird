import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
	isDirectExecution,
	parseGlobalCliOptions,
	readVersion,
} from "../../src/cli.js";

describe("cli entry helpers", () => {
	it("parses plain output settings", () => {
		const options = parseGlobalCliOptions([
			"--plain",
			"--cookie-source",
			"firefox",
		]);
		expect(options.plain).toBe(true);
		expect(options.color).toBe(false);
		expect(options.emoji).toBe(false);
		expect(options.cookieSource).toEqual(["firefox"]);
		expect(options.cookieSourceExplicit).toBe(true);
	});

	it("reads version from package json in provided directory", () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "frigatebird-cli-test-"));
		fs.writeFileSync(
			path.join(tmp, "package.json"),
			JSON.stringify({ version: "9.9.9" }),
		);

		expect(readVersion(tmp)).toBe("9.9.9");
	});

	it("falls back to default version when package missing", () => {
		const tmp = fs.mkdtempSync(
			path.join(os.tmpdir(), "frigatebird-cli-missing-"),
		);
		expect(readVersion(tmp)).toBe("0.2.0");
	});

	it("resolves CLI > env > config precedence", () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "frigatebird-config-"));
		fs.writeFileSync(
			path.join(tmp, ".birdrc.json5"),
			`{ timeoutMs: 1000, cookieSource: ["safari"], quoteDepth: 1 }`,
		);

		const env = {
			BIRD_TIMEOUT_MS: "2000",
			BIRD_COOKIE_SOURCE: "firefox",
			BIRD_QUOTE_DEPTH: "2",
		} as NodeJS.ProcessEnv;

		const options = parseGlobalCliOptions(
			["--timeout", "3000", "--cookie-source", "chrome"],
			env,
			tmp,
		);

		expect(options.timeout).toBe(3000);
		expect(options.cookieSource).toEqual(["chrome"]);
		expect(options.quoteDepth).toBe(2);
	});

	it("uses env auth tokens and NO_COLOR", () => {
		const env = {
			AUTH_TOKEN: "a",
			CT0: "b",
			NO_COLOR: "1",
			FRIGATEBIRD_BASE_URL: "http://localhost:3001",
		} as NodeJS.ProcessEnv;
		const options = parseGlobalCliOptions([], env);

		expect(options.authToken).toBe("a");
		expect(options.ct0).toBe("b");
		expect(options.color).toBe(false);
		expect(options.baseUrl).toBe("http://localhost:3001");
	});

	it("supports frigatebird-specific config file", () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "frigatebird-local-"));
		fs.writeFileSync(
			path.join(tmp, ".frigatebirdrc.json5"),
			`{ firefoxProfile: "default-release", cookieTimeoutMs: 4321 }`,
		);
		const options = parseGlobalCliOptions([], {}, tmp);

		expect(options.firefoxProfile).toBe("default-release");
		expect(options.cookieTimeout).toBe(4321);
	});

	it("detects direct execution through symlinked bin path", () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "frigatebird-bin-"));
		const target = path.join(tmp, "cli.js");
		const link = path.join(tmp, "frigatebird");
		fs.writeFileSync(target, "console.log('hi')");
		fs.symlinkSync(target, link);

		const moduleUrl = pathToFileURL(target).href;
		expect(isDirectExecution(moduleUrl, link)).toBe(true);
	});

	it("returns false when argv path is missing", () => {
		expect(isDirectExecution(import.meta.url, undefined)).toBe(false);
	});
});
