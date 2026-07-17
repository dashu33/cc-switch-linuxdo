import { describe, expect, it } from "vitest";
import { classifyFetchModelsError } from "./model-fetch";

describe("classifyFetchModelsError", () => {
  it.each([
    ["request failed: HTTP 401 Unauthorized", "auth"],
    ["HTTP 429 Too Many Requests", "rate_limit"],
    ["All candidates failed with HTTP 404", "endpoint"],
    ["operation timed out", "timeout"],
    ["Failed to parse JSON response", "response"],
    ["HTTP 503 Service Unavailable", "server"],
    ["network connection refused", "network"],
    ["something unexpected", "unknown"],
  ])("maps %s to %s", (message, expected) => {
    expect(classifyFetchModelsError(message)).toBe(expected);
  });

  it("classifies missing API key separately from generic config", () => {
    expect(
      classifyFetchModelsError(null, {
        hasApiKey: false,
        hasBaseUrl: true,
      }),
    ).toBe("api_key");
    expect(
      classifyFetchModelsError(null, {
        hasApiKey: true,
        hasBaseUrl: false,
      }),
    ).toBe("config");
    expect(
      classifyFetchModelsError(null, {
        hasApiKey: false,
        hasBaseUrl: false,
      }),
    ).toBe("api_key");
  });

  it("classifies invalid API key phrasing as api_key", () => {
    expect(classifyFetchModelsError("Invalid API key provided")).toBe(
      "api_key",
    );
    expect(classifyFetchModelsError("missing api key in request")).toBe(
      "api_key",
    );
    expect(classifyFetchModelsError("invalid_api_key")).toBe("api_key");
    expect(classifyFetchModelsError("API密钥无效")).toBe("api_key");
  });
});
