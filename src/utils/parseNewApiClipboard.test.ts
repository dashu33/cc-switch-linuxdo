import { describe, expect, it } from "vitest";
import {
  mergeNewApiCredentials,
  parseNewApiClipboard,
  parseNewApiClipboardPartial,
} from "./parseNewApiClipboard";

function toBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

describe("parseNewApiClipboard", () => {
  it("parses labeled multi-line text", () => {
    const text = `
API URL: https://api.example.com
API Key: sk-abc123456789
Name: My Gateway
`;
    expect(parseNewApiClipboard(text)).toEqual({
      baseUrl: "https://api.example.com",
      apiKey: "sk-abc123456789",
      name: "My Gateway",
    });
  });

  it("parses JSON snake_case and camelCase", () => {
    expect(
      parseNewApiClipboard(
        JSON.stringify({
          base_url: "https://gw.example.com/v1",
          api_key: "sk-json-key-123456",
          name: "JSON NewAPI",
        }),
      ),
    ).toEqual({
      baseUrl: "https://gw.example.com/v1",
      apiKey: "sk-json-key-123456",
      name: "JSON NewAPI",
    });

    expect(
      parseNewApiClipboard(
        JSON.stringify({
          baseUrl: "https://gw2.example.com",
          apiKey: "sk-camel-key-123456",
        }),
      ),
    ).toEqual({
      baseUrl: "https://gw2.example.com",
      apiKey: "sk-camel-key-123456",
    });
  });

  it("parses free-text url + sk key", () => {
    const text = `请使用以下配置
https://relay.example.com/openai
密钥 sk-freeform-key-999999
`;
    expect(parseNewApiClipboard(text)).toEqual({
      baseUrl: "https://relay.example.com/openai",
      apiKey: "sk-freeform-key-999999",
    });
  });

  it("parses key from query string", () => {
    expect(
      parseNewApiClipboard(
        "https://api.example.com/v1?api_key=sk-query-key-123456",
      ),
    ).toEqual({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-query-key-123456",
    });
  });

  it("auto-decodes base64 whole payload", () => {
    const payload = JSON.stringify({
      baseUrl: "https://b64.example.com",
      apiKey: "sk-b64-payload-123456",
    });
    expect(parseNewApiClipboard(toBase64(payload))).toEqual({
      baseUrl: "https://b64.example.com",
      apiKey: "sk-b64-payload-123456",
    });
  });

  it("auto-decodes base64 api key field", () => {
    const encodedKey = toBase64("sk-encoded-key-123456");
    const text = `
base_url: https://enc.example.com
api_key: ${encodedKey}
`;
    expect(parseNewApiClipboard(text)).toEqual({
      baseUrl: "https://enc.example.com",
      apiKey: "sk-encoded-key-123456",
    });
  });

  it("parses bare domain + glued base64 key sample", () => {
    const text =
      "sub2api.cursorlao.online1Sub2API - AI API Gatewayc2stYWViODgyODhiZTZkNTFjOWVhNGM3ZjZjODlhMzI1ZmNkMGRlNzU4MjFhZTU5MmFlNzk4NmYwMjc3Y2I1YTVmYw==";
    expect(parseNewApiClipboard(text)).toEqual({
      baseUrl: "https://sub2api.cursorlao.online",
      apiKey:
        "sk-aeb88288be6d51c9ea4c7f6c89a325fcd0de75821ae592ae7986f0277cb5a5fc",
      name: "Sub2API - AI API Gateway",
    });
  });

  it("parses bare domain and base64 key on separate lines", () => {
    const text = `sub2api.cursorlao.online
Sub2API - AI API Gateway
c2stYWViODgyODhiZTZkNTFjOWVhNGM3ZjZjODlhMzI1ZmNkMGRlNzU4MjFhZTU5MmFlNzk4NmYwMjc3Y2I1YTVmYw==`;
    expect(parseNewApiClipboard(text)).toEqual({
      baseUrl: "https://sub2api.cursorlao.online",
      apiKey:
        "sk-aeb88288be6d51c9ea4c7f6c89a325fcd0de75821ae592ae7986f0277cb5a5fc",
      name: "Sub2API - AI API Gateway",
    });
  });

  it("parses markdown link + plain non-sk key sample", () => {
    const text = `[Sub2API - AI API Gateway](https://sub2.zmoon.top/v1)
linuxdo-suiranjintianbushixingqisidanshiVwo50quchiKFC`;
    expect(parseNewApiClipboard(text)).toEqual({
      baseUrl: "https://sub2.zmoon.top/v1",
      apiKey: "linuxdo-suiranjintianbushixingqisidanshiVwo50quchiKFC",
      name: "Sub2API - AI API Gateway",
    });
  });

  it("returns null when incomplete", () => {
    expect(parseNewApiClipboard("https://only-url.example.com")).toBeNull();
    expect(parseNewApiClipboard("sk-only-key-12345678")).toBeNull();
    expect(parseNewApiClipboard("")).toBeNull();
  });

  it("parses partial url-only and key-only", () => {
    expect(parseNewApiClipboardPartial("https://only-url.example.com")).toEqual({
      baseUrl: "https://only-url.example.com",
      apiKey: undefined,
      name: undefined,
    });
    expect(parseNewApiClipboardPartial("sk-only-key-12345678")).toEqual({
      baseUrl: undefined,
      apiKey: "sk-only-key-12345678",
      name: undefined,
    });
    expect(parseNewApiClipboardPartial("")).toBeNull();
  });

  it("merges partial credentials across two pastes", () => {
    const first = parseNewApiClipboardPartial(
      "[Sub2API - AI API Gateway](https://sub2.zmoon.top/v1)",
    );
    const second = parseNewApiClipboardPartial(
      "linuxdo-suiranjintianbushixingqisidanshiVwo50quchiKFC",
    );
    expect(first).toMatchObject({
      baseUrl: "https://sub2.zmoon.top/v1",
      name: "Sub2API - AI API Gateway",
    });
    expect(second).toMatchObject({
      apiKey: "linuxdo-suiranjintianbushixingqisidanshiVwo50quchiKFC",
    });
    expect(mergeNewApiCredentials(first!, second!)).toEqual({
      baseUrl: "https://sub2.zmoon.top/v1",
      apiKey: "linuxdo-suiranjintianbushixingqisidanshiVwo50quchiKFC",
      name: "Sub2API - AI API Gateway",
    });
  });

  it("parses bare API:/KEY: labels with markdown url and non-sk base64 key", () => {
    const text = `API：[https://xai.nds.kdns.fr:8443/v1](https://xai.nds.kdns.fr:8443/v1)

KEY：YkhOd1Q0OEhoWkZwM2lUZHRBNjFOR3p4Q1lpNkNyY2Q5WlJzQ0o0NG1xWjhHaDhtOHFYNmRGYmRzUGJZZEdMWQ==`;
    expect(parseNewApiClipboard(text)).toEqual({
      baseUrl: "https://xai.nds.kdns.fr:8443/v1",
      // Single-layer base64 decode only (second pass becomes binary garbage)
      apiKey: "bHNwT48HhZFp3iTdtA61NGzxCYi6Crcd9ZRsCJ44mqZ8Gh8m8qX6dFbdsPbYdGLY",
    });
  });

  it("parses bare API:/KEY: with plain https url and base64 key", () => {
    const text = `API：https://xai.nds.kdns.fr:8443/v1
KEY：YkhOd1Q0OEhoWkZwM2lUZHRBNjFOR3p4Q1lpNkNyY2Q5WlJzQ0o0NG1xWjhHaDhtOHFYNmRGYmRzUGJZZEdMWQ==`;
    expect(parseNewApiClipboard(text)).toEqual({
      baseUrl: "https://xai.nds.kdns.fr:8443/v1",
      apiKey: "bHNwT48HhZFp3iTdtA61NGzxCYi6Crcd9ZRsCJ44mqZ8Gh8m8qX6dFbdsPbYdGLY",
    });
  });

});


describe("newapi_channel_conn import formats", () => {
  it("parses ascii newapi_channel_conn with markdown url", () => {
    const text =
      '{"_type":"newapi_channel_conn","key":"sk-67qDCQDZGkzgeFCuBivFPHmNL9IrCirrVZ4rrWkXzHr5zwXx","url":"[https://api.shirosora.cn](https://api.shirosora.cn/)"}';
    expect(parseNewApiClipboard(text)).toEqual({
      baseUrl: "https://api.shirosora.cn",
      apiKey: "sk-67qDCQDZGkzgeFCuBivFPHmNL9IrCirrVZ4rrWkXzHr5zwXx",
    });
  });

  it("parses smart-quoted newapi_channel_conn without mangling host to punycode", () => {
    // Chinese software often converts JSON quotes to curly quotes when copying.
    const text =
      "{\u201c_type\u201d:\u201cnewapi_channel_conn\u201d,\u201ckey\u201d:\u201csk-67qDCQDZGkzgeFCuBivFPHmNL9IrCirrVZ4rrWkXzHr5zwXx\u201d,\u201curl\u201d:\u201c[https://api.shirosora.cn](https://api.shirosora.cn/)\u201d}";
    const parsed = parseNewApiClipboard(text);
    expect(parsed).toEqual({
      baseUrl: "https://api.shirosora.cn",
      apiKey: "sk-67qDCQDZGkzgeFCuBivFPHmNL9IrCirrVZ4rrWkXzHr5zwXx",
    });
    expect(parsed?.baseUrl).not.toContain("xn--");
  });

  it("parses free-text markdown url contaminated by trailing smart quotes/braces", () => {
    const text =
      "key: sk-67qDCQDZGkzgeFCuBivFPHmNL9IrCirrVZ4rrWkXzHr5zwXx\nurl: https://api.shirosora.cn](https://api.shirosora.cn/)\u201d}";
    expect(parseNewApiClipboard(text)).toEqual({
      baseUrl: "https://api.shirosora.cn",
      apiKey: "sk-67qDCQDZGkzgeFCuBivFPHmNL9IrCirrVZ4rrWkXzHr5zwXx",
    });
  });
});
