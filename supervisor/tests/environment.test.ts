import { describe, expect, test } from "bun:test";
import { environmentFor } from "../src/environment";

describe("what the supervisor tells a computer about its browser", () => {
  test("passes the deployment's browser mode to every per-Bot computer", () => {
    expect(
      environmentFor("invoice-collector", {
        COMPUTER_TOKEN: "secret",
        COMPUTER_BROWSER_MODE: "headed",
      }),
    ).toEqual([
      "COMPUTER_BOT_ID=invoice-collector",
      "COMPUTER_TOKEN=secret",
      "COMPUTER_BROWSER_MODE=headed",
    ]);
  });

  test("does not invent a browser mode when the deployment left it unset", () => {
    expect(
      environmentFor("invoice-collector", { COMPUTER_TOKEN: "secret" }),
    ).toEqual(["COMPUTER_BOT_ID=invoice-collector", "COMPUTER_TOKEN=secret"]);
  });
});

describe("per-Bot browser mode overrides", () => {
  const env = {
    COMPUTER_BROWSER_MODE: "headless",
    COMPUTER_BROWSER_MODES: '{"knowledge-local":"headed"}',
  };
  test("scopes headed mode to Knowledge and does not forward the mapping", () => {
    expect(environmentFor("knowledge-local", env)).toEqual([
      "COMPUTER_BOT_ID=knowledge-local",
      "COMPUTER_BROWSER_MODE=headed",
    ]);
    expect(environmentFor("other", env)).toEqual([
      "COMPUTER_BOT_ID=other",
      "COMPUTER_BROWSER_MODE=headless",
    ]);
    expect(environmentFor("toString", env)).toContain(
      "COMPUTER_BROWSER_MODE=headless",
    );
  });
  test("rejects malformed mappings before creating a computer", () => {
    for (const value of [
      "{",
      "null",
      "[]",
      '"headed"',
      '{"bot":"invalid"}',
      '{"":"headed"}',
    ]) {
      expect(() =>
        environmentFor("other", { COMPUTER_BROWSER_MODES: value }),
      ).toThrow();
    }
  });
});
