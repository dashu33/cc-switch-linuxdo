/**
 * Parse clipboard text into NewAPI base URL + API key.
 *
 * Supports mixed formats commonly shared by NewAPI / relay gateways:
 * - JSON objects (baseUrl/apiKey and snake_case variants)
 * - key=value / key: value lines (incl. bare `API:` / `KEY:`)
 * - multi-line free text containing a URL and key
 * - bare domains without scheme (e.g. sub2api.example.com)
 * - query-string credentials on a URL
 * - whole-text or key-only Base64 payloads (auto-decode when content looks encoded)
 * - Base64 API keys glued next to titles/domains (common Sub2API paste format)
 * - Markdown links: [Name](https://host/path) and [url](url)
 * - Plain non-sk API keys (e.g. linuxdo-...)
 */

import { decodeBase64Utf8 } from "@/lib/utils/base64";

export interface ParsedNewApiCredentials {
  baseUrl: string;
  apiKey: string;
  name?: string;
}

/** Partial credentials when clipboard only has URL or only has API key. */
export interface PartialNewApiCredentials {
  baseUrl?: string;
  apiKey?: string;
  name?: string;
}

const SCHEME_URL_RE = /https?:\/\/[^\s"'`<>]+/gi;
// Bare host/domain with optional port + path, e.g. sub2api.cursorlao.online/v1
// Negative lookahead keeps glued suffixes like "online1Sub2API" out of the host.
const BARE_HOST_RE =
  /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d{1,5})?(?:\/[^\s"'`<>]*)?(?![A-Za-z-])/g;
const SK_KEY_RE = /\b(sk-[A-Za-z0-9._\-]{8,})\b/g;
const BEARER_KEY_RE = /\bBearer\s+([A-Za-z0-9._\-+=\/]{16,})\b/gi;
// base64("sk-...") almost always starts with "c2st"
const SK_BASE64_RE = /c2st[A-Za-z0-9+/_-]+={0,2}/g;
const BASE64_TOKEN_RE = /[A-Za-z0-9+/_-]{20,}={0,2}/g;
// KEY / API KEY / token / 密钥...  （支持单独 KEY： 与中文冒号）
const LABELED_KEY_RE =
  /(?:api[_\s-]?key|apikey|\bkey\b|token|auth[_\s-]?token|secret|access[_\s-]?token|密钥|金鑰|金钥|令牌)\s*[:=：]\s*["']?([^\s"'`,;]+)["']?/gi;
// API / BASE URL / ENDPOINT... （支持单独 API： 与中文冒号）
const LABELED_URL_RE =
  /(?:base[_\s-]?url|api[_\s-]?url|\bapi\b|endpoint|host|\burl\b|地址|接口|域名)\s*[:=：]\s*["']?((?:https?:\/\/)?[^\s"'`,;]+)["']?/gi;
const LABELED_NAME_RE =
  /(?:name|provider|title|名称|名稱)\s*[:=：]\s*["']?([^\n\r"'`,;]+)["']?/i;
const QUERY_KEY_RE =
  /[?&](?:api[_-]?key|apikey|key|token|access[_-]?token)=([^&\s"'`]+)/i;
const MARKDOWN_LINK_RE =
  /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
// Plain non-sk keys: long token with letters, not a URL / sk- / pure base64 blob.
const PLAIN_KEY_RE = /\b([A-Za-z][A-Za-z0-9._-]{15,127})\b/g;

/** Normalize smart quotes / fullwidth JSON punctuation so Chinese-copied JSON parses. */
function normalizeJsonText(text: string): string {
  return text
    .replace(/[\u201c\u201d\u201e\u201f\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201a\u201b\u2032\u2035]/g, "'")
    .replace(/\uFF5B/g, "{")
    .replace(/\uFF5D/g, "}")
    .replace(/\uFF1A/g, ":")
    .replace(/\uFF0C/g, ",");
}

function cleanToken(value: string): string {
  return value
    .trim()
    .replace(
      /^["'`\u201c\u201d\u2018\u2019]+|["'`\u201c\u201d\u2018\u2019,;]+$/g,
      "",
    );
}

/** Strip trailing punctuation that often clings to free-text URL extraction. */
function stripTrailingUrlJunk(value: string): string {
  let url = value.trim();
  let prev = "";
  while (url !== prev) {
    prev = url;
    url = url.replace(/[),.;:}\]"'`\u201c\u201d\u2018\u2019]+$/g, "");
  }
  return url;
}

function stripMarkdownWrapper(value: string): string {
  const trimmed = cleanToken(value);
  // [https://...](https://...)  or [text](https://...)
  const md = trimmed.match(/^\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/i);
  if (md?.[2]) return cleanToken(md[2]);
  // bare [https://...] without link target
  const bare = trimmed.match(/^\[(https?:\/\/[^\]]+)\]$/i);
  if (bare?.[1]) return cleanToken(bare[1]);
  // Free-text regex may swallow markdown as one token:
  // https://host](https://host/)"}
  const brokenMd = trimmed.match(
    /https?:\/\/[^\s"'`<>\]]+\]\((https?:\/\/[^)\s]+)\)/i,
  );
  if (brokenMd?.[1]) return cleanToken(brokenMd[1]);
  // Any embedded markdown link target
  const embedded = trimmed.match(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/i);
  if (embedded?.[2]) return cleanToken(embedded[2]);
  return stripTrailingUrlJunk(trimmed);
}

function looksLikeUrl(value: string): boolean {
  const v = stripMarkdownWrapper(value);
  if (/^https?:\/\//i.test(v)) return true;
  return /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d{1,5})?(?:\/\S*)?$/.test(
    v,
  );
}

function looksLikeSkKey(value: string): boolean {
  return /^sk-[A-Za-z0-9._\-]{8,}$/i.test(value.trim());
}

/** Decoded or plain secret that is not necessarily sk- prefixed. */
function looksLikeSecretToken(value: string): boolean {
  const v = cleanToken(value);
  if (v.length < 16 || v.length > 256) return false;
  if (looksLikeUrl(v) || looksLikeSkKey(v)) return false;
  if (/\s/.test(v)) return false;
  // printable secret chars only
  if (!/^[A-Za-z0-9._\-+=\/+]+$/.test(v)) return false;
  const hasLetter = /[A-Za-z]/.test(v);
  const hasDigit = /\d/.test(v);
  if (!hasLetter) return false;
  // Prefer mixed entropy; pure words rejected
  if (!(hasDigit || /[_\-+/=]/.test(v) || /[A-Z]/.test(v) && /[a-z]/.test(v))) {
    return false;
  }
  if (/^(https?|baseurl|apikey|endpoint|gateway|proxy|relay|key|token|api)$/i.test(v)) {
    return false;
  }
  return true;
}

function looksLikePlainApiKey(value: string): boolean {
  const v = cleanToken(value);
  if (v.length < 16 || v.length > 128) return false;
  if (looksLikeUrl(v) || looksLikeSkKey(v)) return false;
  // Prefer real secrets over product titles / prose fragments.
  if (/\s/.test(v)) return false;
  if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(v)) return false;
  // Must contain at least one letter and one digit, or a hyphenated long token.
  const hasLetter = /[A-Za-z]/.test(v);
  const hasDigit = /\d/.test(v);
  const hasHyphen = v.includes("-") || v.includes("_");
  if (!hasLetter) return false;
  if (!(hasDigit || hasHyphen)) return false;
  // Avoid common non-key labels.
  if (/^(https?|baseurl|apikey|endpoint|gateway|proxy|relay)$/i.test(v)) {
    return false;
  }
  // Strong signal: already looks like base64 of sk- — let base64 path handle it.
  if (v.startsWith("c2st")) return false;
  // If it is pure base64-looking and decodes to sk-, skip plain path.
  if (looksLikeBase64Blob(v)) {
    const decoded = tryDecodeBase64Candidate(v);
    if (decoded && (looksLikeSkKey(decoded) || collectSkKeys(decoded).length > 0)) {
      return false;
    }
    // Pure base64 blobs without clear secret shape are not plain keys.
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length % 4 === 0 && !hasHyphen) {
      return false;
    }
  }
  return true;
}

function looksLikeBase64Blob(value: string): boolean {
  const cleaned = value.trim().replace(/\s+/g, "");
  if (cleaned.length < 16) return false;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(cleaned)) return false;
  if (looksLikeSkKey(cleaned) || looksLikeUrl(cleaned)) return false;
  // Prefer padded / 4-aligned strings, but allow sk-base64 prefix always.
  if (cleaned.startsWith("c2st")) return true;
  if (cleaned.length % 4 !== 0) return false;
  return true;
}

function tryDecodeBase64Candidate(value: string): string | null {
  const cleaned = value.trim().replace(/\s+/g, "");
  if (!looksLikeBase64Blob(cleaned)) return null;
  try {
    const decoded = decodeBase64Utf8(cleaned);
    if (!decoded || decoded === value || decoded === cleaned) return null;
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Decode base64 key once (or twice only when 2nd decode still looks like a secret).
 * Avoid treating binary garbage from over-decoding as a key.
 */
function decodeSecretLayers(value: string): string {
  let current = cleanToken(value);
  for (let i = 0; i < 2; i++) {
    if (looksLikeSkKey(current)) return current;
    const decoded = tryDecodeBase64Candidate(current);
    if (!decoded) break;
    const next = cleanToken(decoded);
    if (looksLikeSkKey(next)) return next;
    // Accept non-sk secret after first successful decode
    if (looksLikeSecretToken(next) || looksLikePlainApiKey(next)) {
      // Only continue if next still looks like base64 of another secret
      const nested = tryDecodeBase64Candidate(next);
      if (
        nested &&
        (looksLikeSkKey(nested) ||
          looksLikeSecretToken(nested) ||
          looksLikePlainApiKey(nested))
      ) {
        current = next;
        continue;
      }
      return next;
    }
    // Decoded text may contain sk- / url+key freeform
    const sk = collectSkKeys(next)[0];
    if (sk) return sk;
    current = next;
  }
  return current;
}

function ensureHttps(url: string): string {
  const trimmed = stripMarkdownWrapper(url);
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (looksLikeUrl(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function normalizeBaseUrl(raw: string): string {
  let url = ensureHttps(raw);
  // Strip common trailing punctuation / smart quotes / braces from free-text extraction
  url = stripTrailingUrlJunk(url);
  try {
    const parsed = new URL(url);
    for (const key of [
      "api_key",
      "apiKey",
      "apikey",
      "key",
      "token",
      "access_token",
      "accessToken",
    ]) {
      parsed.searchParams.delete(key);
    }
    parsed.hash = "";
    const search = parsed.searchParams.toString();
    parsed.search = search ? `?${search}` : "";
    let href = parsed.toString();
    if (href.endsWith("/") && parsed.pathname === "/") {
      href = href.slice(0, -1);
    } else if (href.endsWith("/") && parsed.pathname.length > 1) {
      href = href.replace(/\/+$/, "");
    }
    return href;
  } catch {
    return url.replace(/\/+$/, "");
  }
}

function firstMatch(re: RegExp, text: string): string | null {
  re.lastIndex = 0;
  const match = re.exec(text);
  return match?.[1] ? cleanToken(match[1]) : null;
}

function collectUrls(text: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(SCHEME_URL_RE)) {
    const value = stripMarkdownWrapper(match[0]);
    if (looksLikeUrl(value) && !seen.has(value)) {
      seen.add(value);
      urls.push(value);
    }
  }

  for (const match of text.matchAll(BARE_HOST_RE)) {
    const value = stripTrailingUrlJunk(cleanToken(match[0]));
    if (!looksLikeUrl(value)) continue;
    if (looksLikeBase64Blob(value) || looksLikeSkKey(value)) continue;
    if (!seen.has(value) && !urls.some((u) => u.includes(value))) {
      seen.add(value);
      urls.push(value);
    }
  }

  return urls;
}

function collectSkKeys(text: string): string[] {
  const keys: string[] = [];
  for (const match of text.matchAll(SK_KEY_RE)) {
    if (match[1]) keys.push(cleanToken(match[1]));
  }
  return keys;
}

function collectPlainKeys(text: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(PLAIN_KEY_RE)) {
    const token = match[1] ? cleanToken(match[1]) : "";
    if (!token || !looksLikePlainApiKey(token)) continue;
    // Skip tokens that are clearly part of a URL host or path segment already used as URL.
    if (looksLikeUrl(token)) continue;
    pushUnique(keys, seen, token);
  }
  return keys;
}

function extractMarkdownLinks(
  text: string,
): Array<{ name: string; url: string }> {
  const links: Array<{ name: string; url: string }> = [];
  MARKDOWN_LINK_RE.lastIndex = 0;
  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const name = match[1] ? cleanToken(match[1]) : "";
    const url = match[2] ? cleanToken(match[2]).replace(/[),.;]+$/g, "") : "";
    if (!url || !looksLikeUrl(url)) continue;
    // If the "name" is itself a URL, don't treat it as a provider title.
    const safeName = name && !looksLikeUrl(name) ? name : "";
    links.push({ name: safeName, url });
  }
  return links;
}

function pushUnique(items: string[], seen: Set<string>, value: string) {
  const cleaned = cleanToken(value);
  if (!cleaned || seen.has(cleaned)) return;
  seen.add(cleaned);
  items.push(cleaned);
}

/**
 * Extract API keys from base64 blobs in free text.
 * Handles glued cases like: "Gatewayc2stYWVi...=="
 * Also accepts non-sk secrets after base64 decode (common labeled KEY pastes).
 */
function collectDecodedBase64Keys(text: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  const candidates: string[] = [];
  for (const match of text.matchAll(SK_BASE64_RE)) {
    candidates.push(cleanToken(match[0]));
  }
  for (const match of text.matchAll(BASE64_TOKEN_RE)) {
    const token = cleanToken(match[0]);
    candidates.push(token);
    const c2stIdx = token.indexOf("c2st");
    if (c2stIdx > 0) candidates.push(token.slice(c2stIdx));
  }

  for (const candidate of candidates) {
    const decoded = decodeSecretLayers(candidate);
    if (!decoded || decoded === candidate) {
      // keep going — may still be useless blob
    }
    if (looksLikeSkKey(decoded)) {
      pushUnique(keys, seen, decoded);
      continue;
    }
    for (const sk of collectSkKeys(decoded)) {
      pushUnique(keys, seen, sk);
    }
    // Non-sk secret after base64 decode (e.g. YkhOd1... → bHNwT48...)
    if (
      decoded !== candidate &&
      (looksLikeSecretToken(decoded) || looksLikePlainApiKey(decoded))
    ) {
      pushUnique(keys, seen, decoded);
    }
  }

  return keys;
}

function extractFromRecord(
  record: Record<string, unknown>,
): Partial<ParsedNewApiCredentials> {
  const pickFrom = (
    source: Record<string, unknown>,
    ...keys: string[]
  ): string | undefined => {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) {
        return cleanToken(value);
      }
    }
    const entries = Object.entries(source);
    for (const key of keys) {
      const found = entries.find(
        ([k, v]) =>
          k.toLowerCase() === key.toLowerCase() &&
          typeof v === "string" &&
          v.trim(),
      );
      if (found && typeof found[1] === "string") {
        return cleanToken(found[1]);
      }
    }
    return undefined;
  };

  const nestedSources: Record<string, unknown>[] = [record];
  for (const nestedKey of ["config", "env", "data", "provider", "settings"]) {
    const nested = record[nestedKey];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      nestedSources.push(nested as Record<string, unknown>);
    }
  }

  let baseUrl: string | undefined;
  let apiKey: string | undefined;
  let name: string | undefined;

  for (const source of nestedSources) {
    baseUrl ||= pickFrom(
      source,
      "baseUrl",
      "base_url",
      "apiUrl",
      "api_url",
      "endpoint",
      "url",
      "host",
      "ANTHROPIC_BASE_URL",
      "OPENAI_BASE_URL",
      "GOOGLE_GEMINI_BASE_URL",
      "GEMINI_BASE_URL",
    );
    apiKey ||= pickFrom(
      source,
      "apiKey",
      "api_key",
      "token",
      "authToken",
      "auth_token",
      "accessToken",
      "access_token",
      "secret",
      "key",
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
    );
    name ||= pickFrom(
      source,
      "name",
      "title",
      "provider",
      "providerName",
      "provider_name",
    );
  }

  return {
    baseUrl: baseUrl ? normalizeBaseUrl(baseUrl) : undefined,
    apiKey: apiKey || undefined,
    name: name || undefined,
  };
}

function tryParseJson(text: string): Partial<ParsedNewApiCredentials> | null {
  const trimmed = text.trim();
  // Only attempt when it looks like JSON (including smart-quoted Chinese copies)
  const normalized = normalizeJsonText(trimmed);
  if (
    !(
      trimmed.startsWith("{") ||
      trimmed.startsWith("[") ||
      normalized.startsWith("{") ||
      normalized.startsWith("[")
    )
  ) {
    return null;
  }

  const candidates = [trimmed];
  if (normalized !== trimmed) candidates.push(normalized);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object") {
            const extracted = extractFromRecord(item as Record<string, unknown>);
            if (extracted.baseUrl || extracted.apiKey) return extracted;
          }
        }
        continue;
      }
      if (parsed && typeof parsed === "object") {
        return extractFromRecord(parsed as Record<string, unknown>);
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function extractQueryKey(url: string): string | null {
  try {
    const parsed = new URL(ensureHttps(url));
    for (const key of [
      "api_key",
      "apiKey",
      "apikey",
      "key",
      "token",
      "access_token",
      "accessToken",
    ]) {
      const value = parsed.searchParams.get(key);
      if (value) return cleanToken(value);
    }
  } catch {
    // fall through
  }
  const match = url.match(QUERY_KEY_RE);
  return match?.[1] ? cleanToken(decodeURIComponent(match[1])) : null;
}

function decodeApiKeyIfNeeded(apiKey: string): string {
  const trimmed = cleanToken(apiKey);
  if (looksLikeSkKey(trimmed)) return trimmed;

  const decoded = decodeSecretLayers(trimmed);
  if (decoded !== trimmed) return decoded;

  // Nested freeform after single base64 decode
  const oneShot = tryDecodeBase64Candidate(trimmed);
  if (oneShot) {
    if (looksLikeSkKey(oneShot)) return cleanToken(oneShot);
    const nested = parseNewApiClipboard(oneShot);
    if (nested?.apiKey) return nested.apiKey;
    const sk = collectSkKeys(oneShot)[0];
    if (sk) return sk;
    if (looksLikeSecretToken(oneShot) || looksLikePlainApiKey(oneShot)) {
      return cleanToken(oneShot);
    }
  }

  return trimmed;
}

function guessNameFromFreeText(text: string): string | undefined {
  // Remove credentials first.
  let cleaned = text
    .replace(MARKDOWN_LINK_RE, " $1 ")
    .replace(SK_BASE64_RE, " ")
    .replace(BASE64_TOKEN_RE, " ")
    .replace(SCHEME_URL_RE, " ")
    .replace(SK_KEY_RE, " ");
  // Domain may still be present and glued: "online1Sub2API - ..."
  cleaned = cleaned.replace(
    /(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\d*/g,
    " ",
  );
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Require TitleCase product (avoid matching lowercase domain "sub2api")
  // e.g. "Sub2API - AI API Gateway"
  const match = cleaned.match(
    /\b([A-Z][A-Za-z0-9._+]{0,40}API)\s*[-–—]\s*([A-Za-z][A-Za-z0-9 ._+]{0,60}?(?:API Gateway|Gateway|Proxy|Relay))\b/,
  );
  if (!match) return undefined;

  const name = `${match[1]} - ${match[2]}`.replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 64) return undefined;
  return name;
}

function parseOnce(text: string): Partial<ParsedNewApiCredentials> {
  const result: Partial<ParsedNewApiCredentials> = {};

  const jsonPart = tryParseJson(text);
  if (jsonPart) Object.assign(result, jsonPart);

  // Markdown: [Name](https://...)
  const mdLinks = extractMarkdownLinks(text);
  if (mdLinks[0]) {
    result.baseUrl ||= normalizeBaseUrl(mdLinks[0].url);
    if (mdLinks[0].name) result.name ||= mdLinks[0].name;
  }

  const labeledUrl = firstMatch(LABELED_URL_RE, text);
  if (labeledUrl) {
    const unwrapped = stripMarkdownWrapper(labeledUrl);
    if (looksLikeUrl(unwrapped)) {
      result.baseUrl ||= normalizeBaseUrl(unwrapped);
    }
  }

  const labeledKey = firstMatch(LABELED_KEY_RE, text);
  if (labeledKey) {
    // Labeled values may still be base64 — keep raw; final decode happens later.
    result.apiKey ||= stripMarkdownWrapper(labeledKey);
  }

  const labeledName = firstMatch(LABELED_NAME_RE, text);
  if (labeledName) result.name ||= labeledName;

  const urls = collectUrls(text);
  if (!result.baseUrl && urls[0]) {
    result.baseUrl = normalizeBaseUrl(urls[0]);
  }

  if (!result.apiKey) {
    for (const url of urls) {
      const queryKey = extractQueryKey(url);
      if (queryKey) {
        result.apiKey = queryKey;
        break;
      }
    }
  }

  if (!result.apiKey) {
    const bearer = firstMatch(BEARER_KEY_RE, text);
    if (bearer) result.apiKey = bearer;
  }

  if (!result.apiKey) {
    const sk = collectSkKeys(text)[0];
    if (sk) result.apiKey = sk;
  }

  if (!result.apiKey) {
    const decodedKey = collectDecodedBase64Keys(text)[0];
    if (decodedKey) result.apiKey = decodedKey;
  }

  if (!result.apiKey) {
    const plainKey = collectPlainKeys(text)[0];
    if (plainKey) result.apiKey = plainKey;
  }

  if (!result.baseUrl || !result.apiKey) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => cleanToken(line))
      .filter(Boolean);
    for (const line of lines) {
      // Strip markdown link wrapper on a whole-line markdown link.
      const md = extractMarkdownLinks(line)[0];
      if (md) {
        if (!result.baseUrl) result.baseUrl = normalizeBaseUrl(md.url);
        if (!result.name && md.name) result.name = md.name;
        continue;
      }

      // Strip labels like "API：" / "KEY：" before treating the remainder.
      const lineUrlLabeled = firstMatch(LABELED_URL_RE, line);
      if (!result.baseUrl && lineUrlLabeled) {
        const unwrapped = stripMarkdownWrapper(lineUrlLabeled);
        if (looksLikeUrl(unwrapped)) {
          result.baseUrl = normalizeBaseUrl(unwrapped);
          continue;
        }
      }
      const lineKeyLabeled = firstMatch(LABELED_KEY_RE, line);
      if (!result.apiKey && lineKeyLabeled) {
        result.apiKey = stripMarkdownWrapper(lineKeyLabeled);
        continue;
      }

      if (!result.baseUrl && looksLikeUrl(line)) {
        result.baseUrl = normalizeBaseUrl(line);
        continue;
      }
      if (!result.apiKey && looksLikeSkKey(line)) {
        result.apiKey = line;
        continue;
      }
      if (!result.apiKey) {
        const decodedKeys = collectDecodedBase64Keys(line);
        if (decodedKeys[0]) {
          result.apiKey = decodedKeys[0];
          continue;
        }
      }
      if (
        !result.apiKey &&
        looksLikeBase64Blob(line) &&
        !looksLikeUrl(line) &&
        line.length >= 16
      ) {
        result.apiKey = line;
        continue;
      }
      if (!result.apiKey && looksLikePlainApiKey(line)) {
        result.apiKey = line;
      }
    }
  }

  if (!result.name) {
    result.name = guessNameFromFreeText(text);
  }

  return result;
}

/**
 * Extract any recoverable NewAPI fields from clipboard text.
 * Returns null when neither base URL nor API key is found.
 */
export function parseNewApiClipboardPartial(
  rawText: string,
): PartialNewApiCredentials | null {
  if (!rawText || !rawText.trim()) return null;

  const candidates: string[] = [rawText.trim()];

  const wholeDecoded = tryDecodeBase64Candidate(rawText);
  if (wholeDecoded && wholeDecoded !== rawText.trim()) {
    candidates.push(wholeDecoded);
  }

  let best: PartialNewApiCredentials = {};
  for (const candidate of candidates) {
    const parsed = parseOnce(candidate);
    if (parsed.baseUrl) best.baseUrl ||= parsed.baseUrl;
    if (parsed.apiKey) best.apiKey ||= parsed.apiKey;
    if (parsed.name) best.name ||= parsed.name;
    if (best.baseUrl && best.apiKey) break;
  }

  if (!best.baseUrl && !best.apiKey) return null;

  return {
    baseUrl: best.baseUrl ? normalizeBaseUrl(best.baseUrl) : undefined,
    apiKey: best.apiKey ? decodeApiKeyIfNeeded(best.apiKey) : undefined,
    name: best.name?.trim() || undefined,
  };
}

/** Merge two partial credential sets (later values win when present). */
export function mergeNewApiCredentials(
  current: PartialNewApiCredentials,
  next: PartialNewApiCredentials,
): PartialNewApiCredentials {
  return {
    baseUrl: next.baseUrl || current.baseUrl,
    apiKey: next.apiKey || current.apiKey,
    name: next.name || current.name,
  };
}

/**
 * Extract NewAPI credentials from arbitrary clipboard text.
 * Returns null when base URL or API key cannot be recovered.
 */
export function parseNewApiClipboard(
  rawText: string,
): ParsedNewApiCredentials | null {
  const partial = parseNewApiClipboardPartial(rawText);
  if (!partial?.baseUrl || !partial?.apiKey) return null;
  return {
    baseUrl: partial.baseUrl,
    apiKey: partial.apiKey,
    name: partial.name,
  };
}
