// ==UserScript==
// @name         CC Switch 快速导入（识别 URL + KEY）
// @namespace    https://github.com/farion1231/cc-switch
// @version      1.0.0
// @description  在网页上自动识别 BASE URL 与 API Key，复用 CC Switch「快速导入」解析逻辑，通过 ccswitch:// 深链接一键导入
// @author       CC Switch
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  /**
   * 桌面端「快速导入」：
   *   src/App.tsx + src/utils/parseNewApiClipboard.ts
   *   parseNewApiClipboardPartial → createUniversalProviderFromPreset("newapi") → upsert + sync
   *
   * 网页侧无法调 Tauri，改为官方深链接：
   *   ccswitch://v1/import?resource=provider&app=...&endpoint=...&apiKey=...
   *
   * 差异：桌面快速导入写「统一供应商 NewAPI」；深链接写单应用供应商。
   * 脚本默认导入 Claude，可在面板改为 Codex / Gemini / 三个都导。
   */

  const STORAGE_APP = "ccswitch_qi_app";
  const PANEL_ID = "ccswitch-qi-panel";
  const STYLE_ID = "ccswitch-qi-style";
  const AUTO_SCAN_DEBOUNCE_MS = 800;

  function decodeBase64Utf8(input) {
    const cleaned = String(input || "").replace(/\s+/g, "");
    const binary = atob(cleaned);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch (e) {
      let s = "";
      for (let i = 0; i < binary.length; i++) s += binary[i];
      try { return decodeURIComponent(escape(s)); } catch (e2) { return s; }
    }
  }

  const SCHEME_URL_RE = /https?:\/\/[^\s"'`<>]+/gi;
  const BARE_HOST_RE =
    /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d{1,5})?(?:\/[^\s"'`<>]*)?(?![A-Za-z-])/g;
  const SK_KEY_RE = /\b(sk-[A-Za-z0-9._\-]{8,})\b/g;
  const BEARER_KEY_RE = /\bBearer\s+([A-Za-z0-9._\-+=\/]{16,})\b/gi;
  const SK_BASE64_RE = /c2st[A-Za-z0-9+/_-]+={0,2}/g;
  const BASE64_TOKEN_RE = /[A-Za-z0-9+/_-]{20,}={0,2}/g;
  const LABELED_KEY_RE =
    /(?:api[_\s-]?key|apikey|\bkey\b|token|auth[_\s-]?token|secret|access[_\s-]?token|密钥|金鑰|金钥|令牌)\s*[:=：]\s*["']?([^\s"'`,;]+)["']?/gi;
  const LABELED_URL_RE =
    /(?:base[_\s-]?url|api[_\s-]?url|\bapi\b|endpoint|host|\burl\b|地址|接口|域名)\s*[:=：]\s*["']?((?:https?:\/\/)?[^\s"'`,;]+)["']?/gi;
  const LABELED_NAME_RE =
    /(?:name|provider|title|名称|名稱)\s*[:=：]\s*["']?([^\n\r"'`,;]+)["']?/i;
  const QUERY_KEY_RE =
    /[?&](?:api[_-]?key|apikey|key|token|access[_-]?token)=([^&\s"'`]+)/i;
  const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
  const PLAIN_KEY_RE = /\b([A-Za-z][A-Za-z0-9._-]{15,127})\b/g;

  function cleanToken(value) {
    return String(value || "").trim().replace(/^["'`]+|["'`,;]+$/g, "");
  }

  function stripMarkdownWrapper(value) {
    const trimmed = cleanToken(value);
    const md = trimmed.match(/^\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/i);
    if (md && md[2]) return cleanToken(md[2]);
    const bare = trimmed.match(/^\[(https?:\/\/[^\]]+)\]$/i);
    if (bare && bare[1]) return cleanToken(bare[1]);
    return trimmed;
  }

  function looksLikeUrl(value) {
    const v = stripMarkdownWrapper(value);
    if (/^https?:\/\//i.test(v)) return true;
    return /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d{1,5})?(?:\/\S*)?$/.test(v);
  }

  function looksLikeSkKey(value) {
    return /^sk-[A-Za-z0-9._\-]{8,}$/i.test(String(value || "").trim());
  }

  function looksLikeSecretToken(value) {
    const v = cleanToken(value);
    if (v.length < 16 || v.length > 256) return false;
    if (looksLikeUrl(v) || looksLikeSkKey(v)) return false;
    if (/\s/.test(v)) return false;
    if (!/^[A-Za-z0-9._\-+=\/+]+$/.test(v)) return false;
    const hasLetter = /[A-Za-z]/.test(v);
    const hasDigit = /\d/.test(v);
    if (!hasLetter) return false;
    if (!(hasDigit || /[_\-+/=]/.test(v) || (/[A-Z]/.test(v) && /[a-z]/.test(v)))) return false;
    if (/^(https?|baseurl|apikey|endpoint|gateway|proxy|relay|key|token|api)$/i.test(v)) return false;
    return true;
  }

  function looksLikeBase64Blob(value) {
    const cleaned = String(value || "").trim().replace(/\s+/g, "");
    if (cleaned.length < 16) return false;
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(cleaned)) return false;
    if (looksLikeSkKey(cleaned) || looksLikeUrl(cleaned)) return false;
    if (cleaned.startsWith("c2st")) return true;
    if (cleaned.length % 4 !== 0) return false;
    return true;
  }

  function tryDecodeBase64Candidate(value) {
    const cleaned = String(value || "").trim().replace(/\s+/g, "");
    if (!looksLikeBase64Blob(cleaned)) return null;
    try {
      const decoded = decodeBase64Utf8(cleaned);
      if (!decoded || decoded === value || decoded === cleaned) return null;
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(decoded)) return null;
      return decoded;
    } catch (e) { return null; }
  }

  function looksLikePlainApiKey(value) {
    const v = cleanToken(value);
    if (v.length < 16 || v.length > 128) return false;
    if (looksLikeUrl(v) || looksLikeSkKey(v)) return false;
    if (/\s/.test(v)) return false;
    if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(v)) return false;
    const hasLetter = /[A-Za-z]/.test(v);
    const hasDigit = /\d/.test(v);
    const hasHyphen = v.includes("-") || v.includes("_");
    if (!hasLetter) return false;
    if (!(hasDigit || hasHyphen)) return false;
    if (/^(https?|baseurl|apikey|endpoint|gateway|proxy|relay)$/i.test(v)) return false;
    if (v.startsWith("c2st")) return false;
    if (looksLikeBase64Blob(v)) {
      const decoded = tryDecodeBase64Candidate(v);
      if (decoded && (looksLikeSkKey(decoded) || collectSkKeys(decoded).length > 0)) return false;
      if (/^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length % 4 === 0 && !hasHyphen) return false;
    }
    return true;
  }

  function decodeSecretLayers(value) {
    let current = cleanToken(value);
    for (let i = 0; i < 2; i++) {
      if (looksLikeSkKey(current)) return current;
      const decoded = tryDecodeBase64Candidate(current);
      if (!decoded) break;
      const next = cleanToken(decoded);
      if (looksLikeSkKey(next)) return next;
      if (looksLikeSecretToken(next) || looksLikePlainApiKey(next)) {
        const nested = tryDecodeBase64Candidate(next);
        if (nested && (looksLikeSkKey(nested) || looksLikeSecretToken(nested) || looksLikePlainApiKey(nested))) {
          current = next;
          continue;
        }
        return next;
      }
      const sk = collectSkKeys(next)[0];
      if (sk) return sk;
      current = next;
    }
    return current;
  }

  function ensureHttps(url) {
    const trimmed = stripMarkdownWrapper(url);
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (looksLikeUrl(trimmed)) return "https://" + trimmed;
    return trimmed;
  }

  function normalizeBaseUrl(raw) {
    let url = ensureHttps(raw).replace(/[),.;]+$/g, "");
    try {
      const parsed = new URL(url);
      ["api_key","apiKey","apikey","key","token","access_token","accessToken"].forEach(function (key) {
        parsed.searchParams.delete(key);
      });
      parsed.hash = "";
      const search = parsed.searchParams.toString();
      parsed.search = search ? "?" + search : "";
      let href = parsed.toString();
      if (href.endsWith("/") && parsed.pathname === "/") href = href.slice(0, -1);
      else if (href.endsWith("/") && parsed.pathname.length > 1) href = href.replace(/\/+$/, "");
      return href;
    } catch (e) { return url.replace(/\/+$/, ""); }
  }

  function firstMatch(re, text) {
    re.lastIndex = 0;
    const match = re.exec(text);
    return match && match[1] ? cleanToken(match[1]) : null;
  }

  function collectUrls(text) {
    const urls = [];
    const seen = new Set();
    for (const match of text.matchAll(SCHEME_URL_RE)) {
      const value = cleanToken(match[0]).replace(/[),.;]+$/g, "");
      if (looksLikeUrl(value) && !seen.has(value)) { seen.add(value); urls.push(value); }
    }
    for (const match of text.matchAll(BARE_HOST_RE)) {
      const value = cleanToken(match[0]).replace(/[),.;]+$/g, "");
      if (!looksLikeUrl(value)) continue;
      if (looksLikeBase64Blob(value) || looksLikeSkKey(value)) continue;
      if (!seen.has(value) && !urls.some(function (u) { return u.includes(value); })) {
        seen.add(value); urls.push(value);
      }
    }
    return urls;
  }

  function collectSkKeys(text) {
    const keys = [];
    for (const match of text.matchAll(SK_KEY_RE)) {
      if (match[1]) keys.push(cleanToken(match[1]));
    }
    return keys;
  }

  function pushUnique(items, seen, value) {
    const cleaned = cleanToken(value);
    if (!cleaned || seen.has(cleaned)) return;
    seen.add(cleaned);
    items.push(cleaned);
  }

  function collectPlainKeys(text) {
    const keys = [];
    const seen = new Set();
    for (const match of text.matchAll(PLAIN_KEY_RE)) {
      const token = match[1] ? cleanToken(match[1]) : "";
      if (!token || !looksLikePlainApiKey(token) || looksLikeUrl(token)) continue;
      pushUnique(keys, seen, token);
    }
    return keys;
  }

  function extractMarkdownLinks(text) {
    const links = [];
    MARKDOWN_LINK_RE.lastIndex = 0;
    for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
      const name = match[1] ? cleanToken(match[1]) : "";
      const url = match[2] ? cleanToken(match[2]).replace(/[),.;]+$/g, "") : "";
      if (!url || !looksLikeUrl(url)) continue;
      links.push({ name: name && !looksLikeUrl(name) ? name : "", url: url });
    }
    return links;
  }

  function collectDecodedBase64Keys(text) {
    const keys = [];
    const seen = new Set();
    const candidates = [];
    for (const match of text.matchAll(SK_BASE64_RE)) candidates.push(cleanToken(match[0]));
    for (const match of text.matchAll(BASE64_TOKEN_RE)) {
      const token = cleanToken(match[0]);
      candidates.push(token);
      const c2stIdx = token.indexOf("c2st");
      if (c2stIdx > 0) candidates.push(token.slice(c2stIdx));
    }
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const decoded = decodeSecretLayers(candidate);
      if (looksLikeSkKey(decoded)) { pushUnique(keys, seen, decoded); continue; }
      collectSkKeys(decoded).forEach(function (sk) { pushUnique(keys, seen, sk); });
      if (decoded !== candidate && (looksLikeSecretToken(decoded) || looksLikePlainApiKey(decoded))) {
        pushUnique(keys, seen, decoded);
      }
    }
    return keys;
  }

  function extractFromRecord(record) {
    const pickFrom = function (source) {
      const keys = Array.prototype.slice.call(arguments, 1);
      for (let i = 0; i < keys.length; i++) {
        const value = source[keys[i]];
        if (typeof value === "string" && value.trim()) return cleanToken(value);
      }
      const entries = Object.entries(source);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const found = entries.find(function (pair) {
          return pair[0].toLowerCase() === key.toLowerCase() && typeof pair[1] === "string" && pair[1].trim();
        });
        if (found && typeof found[1] === "string") return cleanToken(found[1]);
      }
      return undefined;
    };
    const nestedSources = [record];
    ["config", "env", "data", "provider", "settings"].forEach(function (nestedKey) {
      const nested = record[nestedKey];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) nestedSources.push(nested);
    });
    let baseUrl, apiKey, name;
    nestedSources.forEach(function (source) {
      baseUrl = baseUrl || pickFrom(source, "baseUrl", "base_url", "apiUrl", "api_url", "endpoint", "url", "host", "ANTHROPIC_BASE_URL", "OPENAI_BASE_URL", "GOOGLE_GEMINI_BASE_URL", "GEMINI_BASE_URL");
      apiKey = apiKey || pickFrom(source, "apiKey", "api_key", "token", "authToken", "auth_token", "accessToken", "access_token", "secret", "key", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY");
      name = name || pickFrom(source, "name", "title", "provider", "providerName", "provider_name");
    });
    return {
      baseUrl: baseUrl ? normalizeBaseUrl(baseUrl) : undefined,
      apiKey: apiKey || undefined,
      name: name || undefined,
    };
  }

  function tryParseJson(text) {
    const trimmed = text.trim();
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (let i = 0; i < parsed.length; i++) {
          const item = parsed[i];
          if (item && typeof item === "object") {
            const extracted = extractFromRecord(item);
            if (extracted.baseUrl || extracted.apiKey) return extracted;
          }
        }
        return null;
      }
      if (parsed && typeof parsed === "object") return extractFromRecord(parsed);
    } catch (e) { return null; }
    return null;
  }

  function extractQueryKey(url) {
    try {
      const parsed = new URL(ensureHttps(url));
      const keys = ["api_key", "apiKey", "apikey", "key", "token", "access_token", "accessToken"];
      for (let i = 0; i < keys.length; i++) {
        const value = parsed.searchParams.get(keys[i]);
        if (value) return cleanToken(value);
      }
    } catch (e) {}
    const match = url.match(QUERY_KEY_RE);
    return match && match[1] ? cleanToken(decodeURIComponent(match[1])) : null;
  }

  function decodeApiKeyIfNeeded(apiKey) {
    const trimmed = cleanToken(apiKey);
    if (looksLikeSkKey(trimmed)) return trimmed;
    const decoded = decodeSecretLayers(trimmed);
    if (decoded !== trimmed) return decoded;
    const oneShot = tryDecodeBase64Candidate(trimmed);
    if (oneShot) {
      if (looksLikeSkKey(oneShot)) return cleanToken(oneShot);
      const nested = parseNewApiClipboard(oneShot);
      if (nested && nested.apiKey) return nested.apiKey;
      const sk = collectSkKeys(oneShot)[0];
      if (sk) return sk;
      if (looksLikeSecretToken(oneShot) || looksLikePlainApiKey(oneShot)) return cleanToken(oneShot);
    }
    return trimmed;
  }

  function guessNameFromFreeText(text) {
    let cleaned = text
      .replace(MARKDOWN_LINK_RE, " $1 ")
      .replace(SK_BASE64_RE, " ")
      .replace(BASE64_TOKEN_RE, " ")
      .replace(SCHEME_URL_RE, " ")
      .replace(SK_KEY_RE, " ");
    cleaned = cleaned.replace(/(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\d*/g, " ");
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    const match = cleaned.match(/\b([A-Z][A-Za-z0-9._+]{0,40}API)\s*[-–—]\s*([A-Za-z][A-Za-z0-9 ._+]{0,60}?(?:API Gateway|Gateway|Proxy|Relay))\b/);
    if (!match) return undefined;
    const name = (match[1] + " - " + match[2]).replace(/\s+/g, " ").trim();
    if (name.length < 3 || name.length > 64) return undefined;
    return name;
  }

  function parseOnce(text) {
    const result = {};
    const jsonPart = tryParseJson(text);
    if (jsonPart) Object.assign(result, jsonPart);

    const mdLinks = extractMarkdownLinks(text);
    if (mdLinks[0]) {
      result.baseUrl = result.baseUrl || normalizeBaseUrl(mdLinks[0].url);
      if (mdLinks[0].name) result.name = result.name || mdLinks[0].name;
    }

    const labeledUrl = firstMatch(LABELED_URL_RE, text);
    if (labeledUrl) {
      const unwrapped = stripMarkdownWrapper(labeledUrl);
      if (looksLikeUrl(unwrapped)) result.baseUrl = result.baseUrl || normalizeBaseUrl(unwrapped);
    }

    const labeledKey = firstMatch(LABELED_KEY_RE, text);
    if (labeledKey) result.apiKey = result.apiKey || stripMarkdownWrapper(labeledKey);

    const labeledName = firstMatch(LABELED_NAME_RE, text);
    if (labeledName) result.name = result.name || labeledName;

    const urls = collectUrls(text);
    if (!result.baseUrl && urls[0]) result.baseUrl = normalizeBaseUrl(urls[0]);

    if (!result.apiKey) {
      for (let i = 0; i < urls.length; i++) {
        const queryKey = extractQueryKey(urls[i]);
        if (queryKey) { result.apiKey = queryKey; break; }
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
      const lines = text.split(/\r?\n/).map(function (line) { return cleanToken(line); }).filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const md = extractMarkdownLinks(line)[0];
        if (md) {
          if (!result.baseUrl) result.baseUrl = normalizeBaseUrl(md.url);
          if (!result.name && md.name) result.name = md.name;
          continue;
        }
        const lineUrlLabeled = firstMatch(LABELED_URL_RE, line);
        if (!result.baseUrl && lineUrlLabeled) {
          const unwrapped = stripMarkdownWrapper(lineUrlLabeled);
          if (looksLikeUrl(unwrapped)) { result.baseUrl = normalizeBaseUrl(unwrapped); continue; }
        }
        const lineKeyLabeled = firstMatch(LABELED_KEY_RE, line);
        if (!result.apiKey && lineKeyLabeled) { result.apiKey = stripMarkdownWrapper(lineKeyLabeled); continue; }
        if (!result.baseUrl && looksLikeUrl(line)) { result.baseUrl = normalizeBaseUrl(line); continue; }
        if (!result.apiKey && looksLikeSkKey(line)) { result.apiKey = line; continue; }
        if (!result.apiKey) {
          const decodedKeys = collectDecodedBase64Keys(line);
          if (decodedKeys[0]) { result.apiKey = decodedKeys[0]; continue; }
        }
        if (!result.apiKey && looksLikeBase64Blob(line) && !looksLikeUrl(line) && line.length >= 16) {
          result.apiKey = line; continue;
        }
        if (!result.apiKey && looksLikePlainApiKey(line)) result.apiKey = line;
      }
    }

    if (!result.name) result.name = guessNameFromFreeText(text);
    return result;
  }

  function parseNewApiClipboardPartial(rawText) {
    if (!rawText || !String(rawText).trim()) return null;
    const candidates = [String(rawText).trim()];
    const wholeDecoded = tryDecodeBase64Candidate(rawText);
    if (wholeDecoded && wholeDecoded !== String(rawText).trim()) candidates.push(wholeDecoded);
    const best = {};
    for (let i = 0; i < candidates.length; i++) {
      const parsed = parseOnce(candidates[i]);
      if (parsed.baseUrl) best.baseUrl = best.baseUrl || parsed.baseUrl;
      if (parsed.apiKey) best.apiKey = best.apiKey || parsed.apiKey;
      if (parsed.name) best.name = best.name || parsed.name;
      if (best.baseUrl && best.apiKey) break;
    }
    if (!best.baseUrl && !best.apiKey) return null;
    return {
      baseUrl: best.baseUrl ? normalizeBaseUrl(best.baseUrl) : undefined,
      apiKey: best.apiKey ? decodeApiKeyIfNeeded(best.apiKey) : undefined,
      name: best.name ? String(best.name).trim() : undefined,
    };
  }

  function parseNewApiClipboard(rawText) {
    const partial = parseNewApiClipboardPartial(rawText);
    if (!partial || !partial.baseUrl || !partial.apiKey) return null;
    return { baseUrl: partial.baseUrl, apiKey: partial.apiKey, name: partial.name };
  }

  function mergeNewApiCredentials(current, next) {
    return {
      baseUrl: next.baseUrl || current.baseUrl,
      apiKey: next.apiKey || current.apiKey,
      name: next.name || current.name,
    };
  }

  function getSelectionText() {
    try { return (window.getSelection && window.getSelection().toString()) || ""; }
    catch (e) { return ""; }
  }

  function getVisibleInputSnippets() {
    const nodes = document.querySelectorAll("input, textarea, [contenteditable='true'], code, pre");
    const chunks = [];
    for (let i = 0, n = 0; i < nodes.length && n < 40; i++) {
      const el = nodes[i];
      let text = (el.tagName === "INPUT" || el.tagName === "TEXTAREA")
        ? (el.value || el.placeholder || "")
        : (el.textContent || "");
      text = String(text).trim();
      if (text.length >= 8 && text.length <= 4000) { chunks.push(text); n += 1; }
    }
    return chunks.join("\n");
  }

  function getBodyTextSample() {
    try {
      const text = document.body ? (document.body.innerText || "") : "";
      return text.length > 80000 ? text.slice(0, 80000) : text;
    } catch (e) { return ""; }
  }

  function collectPageCandidates() {
    const parts = [];
    const selection = getSelectionText().trim();
    if (selection) parts.push(selection);
    const inputs = getVisibleInputSnippets();
    if (inputs) parts.push(inputs);
    const body = getBodyTextSample();
    if (body) parts.push(body);
    return parts;
  }

  function detectFromPage() {
    let best = {};
    const candidates = collectPageCandidates();
    for (let i = 0; i < candidates.length; i++) {
      const partial = parseNewApiClipboardPartial(candidates[i]);
      if (partial) {
        best = mergeNewApiCredentials(best, partial);
        if (best.baseUrl && best.apiKey) break;
      }
    }
    if (!best.baseUrl && !best.apiKey) return null;
    return best;
  }

  function defaultProviderName(credentials) {
    const now = new Date();
    const stamp = (now.getMonth() + 1) + "月" + now.getDate() + "日 " +
      String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    return credentials.name ? (stamp + " " + credentials.name) : (stamp + " " + credentials.baseUrl);
  }

  function buildDeeplink(app, credentials) {
    const params = new URLSearchParams({
      resource: "provider",
      app: app,
      name: defaultProviderName(credentials),
      endpoint: credentials.baseUrl,
      apiKey: credentials.apiKey,
      homepage: credentials.baseUrl,
      notes: "Imported via Tampermonkey (CC Switch quick-import logic)",
    });
    if (app === "claude") {
      params.set("model", "claude-sonnet-5");
      params.set("haikuModel", "claude-haiku-4-5-20251001");
      params.set("sonnetModel", "claude-sonnet-5");
      params.set("opusModel", "claude-opus-4-8");
    } else if (app === "codex") {
      params.set("model", "gpt-5.5");
    } else if (app === "gemini") {
      params.set("model", "gemini-3.5-flash");
    }
    return "ccswitch://v1/import?" + params.toString();
  }

  function openDeeplinks(credentials, appMode) {
    const apps = appMode === "all" ? ["claude", "codex", "gemini"] : [appMode || "claude"];
    apps.forEach(function (app, index) {
      const url = buildDeeplink(app, credentials);
      setTimeout(function () { window.location.href = url; }, index * 600);
    });
    return apps;
  }

  let state = { pending: null };

  function getAppMode() {
    try { return GM_getValue(STORAGE_APP, "claude"); } catch (e) { return "claude"; }
  }
  function setAppMode(mode) {
    try { GM_setValue(STORAGE_APP, mode); } catch (e) {}
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "#" + PANEL_ID + "{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:340px;max-width:calc(100vw - 24px);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 40px rgba(15,23,42,.18);overflow:hidden}" +
      "#" + PANEL_ID + " *{box-sizing:border-box}" +
      "#" + PANEL_ID + " .ccs-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:#0f172a;color:#f8fafc;cursor:pointer;user-select:none}" +
      "#" + PANEL_ID + " .ccs-hd h3{margin:0;font-size:13px;font-weight:600}" +
      "#" + PANEL_ID + " .ccs-badge{font-size:11px;opacity:.85}" +
      "#" + PANEL_ID + " .ccs-bd{padding:12px;display:none}" +
      "#" + PANEL_ID + ".open .ccs-bd{display:block}" +
      "#" + PANEL_ID + " .ccs-row{display:grid;grid-template-columns:56px 1fr;gap:8px;margin-bottom:8px;font-size:12px;align-items:start}" +
      "#" + PANEL_ID + " .ccs-row label{color:#64748b;padding-top:6px}" +
      "#" + PANEL_ID + " .ccs-row input,#" + PANEL_ID + " .ccs-row select{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:6px 8px;font-size:12px;color:#0f172a;background:#f8fafc;outline:none}" +
      "#" + PANEL_ID + " .ccs-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}" +
      "#" + PANEL_ID + " button{border:0;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:600;cursor:pointer}" +
      "#" + PANEL_ID + " .ccs-primary{background:#2563eb;color:#fff}" +
      "#" + PANEL_ID + " .ccs-primary:disabled{opacity:.45;cursor:not-allowed}" +
      "#" + PANEL_ID + " .ccs-secondary{background:#e2e8f0;color:#0f172a}" +
      "#" + PANEL_ID + " .ccs-ghost{background:transparent;color:#475569;border:1px solid #cbd5e1}" +
      "#" + PANEL_ID + " .ccs-hint{margin-top:8px;font-size:11px;color:#64748b;line-height:1.45}" +
      "#" + PANEL_ID + " .ccs-toast{margin-top:8px;font-size:11px;color:#0369a1;background:#e0f2fe;border-radius:8px;padding:6px 8px;display:none}" +
      "#" + PANEL_ID + " .ccs-toast.show{display:block}" +
      "#" + PANEL_ID + " .ccs-status-dot{width:8px;height:8px;border-radius:50%;background:#94a3b8;display:inline-block;margin-right:6px}" +
      "#" + PANEL_ID + ".ready .ccs-status-dot{background:#22c55e}" +
      "#" + PANEL_ID + ".partial .ccs-status-dot{background:#f59e0b}";
    document.documentElement.appendChild(style);
  }

  function maskKey(key) {
    if (!key) return "";
    if (key.length <= 12) return key;
    return key.slice(0, 6) + "…" + key.slice(-4);
  }

  function toast(msg) {
    const el = document.querySelector("#" + PANEL_ID + " .ccs-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, 3500);
  }

  function readFormCredentials() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return null;
    const baseUrl = panel.querySelector('[data-f="baseUrl"]').value.trim();
    const apiKey = panel.querySelector('[data-f="apiKey"]').value.trim();
    const name = panel.querySelector('[data-f="name"]').value.trim();
    if (!baseUrl && !apiKey) return null;
    return {
      baseUrl: baseUrl ? normalizeBaseUrl(baseUrl) : undefined,
      apiKey: apiKey || undefined,
      name: name || undefined,
    };
  }

  function writeFormCredentials(partial) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.querySelector('[data-f="baseUrl"]').value = (partial && partial.baseUrl) || "";
    panel.querySelector('[data-f="apiKey"]').value = (partial && partial.apiKey) || "";
    panel.querySelector('[data-f="name"]').value = (partial && partial.name) || "";
    updatePanelStatus(partial);
  }

  function updatePanelStatus(partial) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.classList.remove("ready", "partial");
    const badge = panel.querySelector(".ccs-badge");
    const importBtn = panel.querySelector('[data-a="import"]');
    if (partial && partial.baseUrl && partial.apiKey) {
      panel.classList.add("ready");
      badge.textContent = "可导入";
      importBtn.disabled = false;
    } else if (partial && (partial.baseUrl || partial.apiKey)) {
      panel.classList.add("partial");
      badge.textContent = partial.baseUrl ? "缺 API Key" : "缺 URL";
      importBtn.disabled = true;
    } else {
      badge.textContent = "未识别";
      importBtn.disabled = true;
    }
  }

  function ensurePanel() {
    ensureStyles();
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "open";
    panel.innerHTML =
      '<div class="ccs-hd" data-a="toggle">' +
      '<h3><span class="ccs-status-dot"></span>CC Switch 快速导入</h3>' +
      '<span class="ccs-badge">未识别</span></div>' +
      '<div class="ccs-bd">' +
      '<div class="ccs-row"><label>URL</label><input data-f="baseUrl" placeholder="https://api.example.com" spellcheck="false" /></div>' +
      '<div class="ccs-row"><label>KEY</label><input data-f="apiKey" placeholder="sk-... 或其它密钥" spellcheck="false" /></div>' +
      '<div class="ccs-row"><label>名称</label><input data-f="name" placeholder="可选，默认按时间+URL 命名" spellcheck="false" /></div>' +
      '<div class="ccs-row"><label>应用</label><select data-f="app">' +
      '<option value="claude">Claude</option>' +
      '<option value="codex">Codex</option>' +
      '<option value="gemini">Gemini</option>' +
      '<option value="all">三个都导</option>' +
      "</select></div>" +
      '<div class="ccs-actions">' +
      '<button class="ccs-primary" data-a="import" disabled>导入到 CC Switch</button>' +
      '<button class="ccs-secondary" data-a="scan">重新扫描页面</button>' +
      '<button class="ccs-secondary" data-a="from-selection">从选中文本</button>' +
      '<button class="ccs-ghost" data-a="copy-link">复制深链接</button>' +
      "</div>" +
      '<div class="ccs-hint">解析逻辑对齐桌面端「快速导入」按钮。识别到 URL + KEY 后会唤起 <code>ccswitch://</code> 深链接；请确认已安装并注册协议的 CC Switch。</div>' +
      '<div class="ccs-toast"></div></div>';
    document.documentElement.appendChild(panel);

    const appSelect = panel.querySelector('[data-f="app"]');
    appSelect.value = getAppMode();
    appSelect.addEventListener("change", function () { setAppMode(appSelect.value); });
    panel.querySelector('[data-a="toggle"]').addEventListener("click", function () {
      panel.classList.toggle("open");
    });
    ["baseUrl", "apiKey", "name"].forEach(function (field) {
      panel.querySelector('[data-f="' + field + '"]').addEventListener("input", function () {
        updatePanelStatus(readFormCredentials());
      });
    });

    panel.querySelector('[data-a="scan"]').addEventListener("click", function () {
      const found = detectFromPage();
      if (!found) { writeFormCredentials(null); toast("页面上未识别到 URL 或 API Key"); return; }
      writeFormCredentials(found);
      if (found.baseUrl && found.apiKey) toast("已识别：" + found.baseUrl + " / " + maskKey(found.apiKey));
      else if (found.baseUrl) toast("已识别 URL，还差 API Key：" + found.baseUrl);
      else toast("已识别 KEY，还差 URL：" + maskKey(found.apiKey));
    });

    panel.querySelector('[data-a="from-selection"]').addEventListener("click", function () {
      const text = getSelectionText().trim();
      if (!text) { toast("请先选中包含 URL / KEY 的文本"); return; }
      const partial = parseNewApiClipboardPartial(text);
      if (!partial) { toast("选中文本中未识别到可用字段"); return; }
      const merged = mergeNewApiCredentials(readFormCredentials() || {}, partial);
      writeFormCredentials(merged);
      toast(merged.baseUrl && merged.apiKey ? "已从选中文本补齐 URL + KEY" : "已写入选中文本中的部分字段");
    });

    panel.querySelector('[data-a="copy-link"]').addEventListener("click", function () {
      const creds = readFormCredentials();
      if (!creds || !creds.baseUrl || !creds.apiKey) { toast("请先补齐 URL 和 KEY"); return; }
      const mode = panel.querySelector('[data-f="app"]').value;
      const app = mode === "all" ? "claude" : mode;
      const url = buildDeeplink(app, creds);
      try {
        if (typeof GM_setClipboard === "function") GM_setClipboard(url, "text");
        else navigator.clipboard.writeText(url);
        toast("深链接已复制到剪贴板");
      } catch (e) {
        toast("复制失败，请手动复制控制台输出");
        console.log("[CC Switch QI] deeplink:", url);
      }
    });

    panel.querySelector('[data-a="import"]').addEventListener("click", function () {
      const creds = readFormCredentials();
      if (!creds || !creds.baseUrl || !creds.apiKey) { toast("请先补齐 URL 和 KEY"); return; }
      const mode = panel.querySelector('[data-f="app"]').value;
      const apps = openDeeplinks(creds, mode);
      toast(apps.length > 1
        ? "正在依次唤起 CC Switch（" + apps.join(" / ") + "）…"
        : "正在唤起 CC Switch（" + apps[0] + "）…");
    });

    return panel;
  }

  let scanTimer = null;
  function scheduleAutoScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(function () {
      const found = detectFromPage();
      if (!found) return;
      const current = readFormCredentials();
      if (current && current.baseUrl && current.apiKey) return;
      const merged = mergeNewApiCredentials(current || {}, found);
      writeFormCredentials(merged);
      if (merged.baseUrl && merged.apiKey && !state.pending) {
        state.pending = merged;
        toast("自动识别到凭据：" + merged.baseUrl);
      }
    }, AUTO_SCAN_DEBOUNCE_MS);
  }

  function boot() {
    ensurePanel();
    scheduleAutoScan();

    document.addEventListener("mouseup", function () {
      const text = getSelectionText().trim();
      if (!text || text.length < 8) return;
      const partial = parseNewApiClipboardPartial(text);
      if (!partial) return;
      writeFormCredentials(mergeNewApiCredentials(readFormCredentials() || {}, partial));
    }, true);

    if (document.body) {
      new MutationObserver(function () { scheduleAutoScan(); }).observe(document.body, {
        childList: true, subtree: true, characterData: false,
      });
    }

    try {
      GM_registerMenuCommand("重新扫描页面", function () {
        const btn = document.querySelector("#" + PANEL_ID + ' [data-a="scan"]');
        if (btn) btn.click();
      });
      GM_registerMenuCommand("显示/隐藏面板", function () {
        ensurePanel().classList.toggle("open");
      });
      GM_registerMenuCommand("导入到 CC Switch", function () {
        const btn = document.querySelector("#" + PANEL_ID + ' [data-a="import"]');
        if (btn) btn.click();
      });
    } catch (e) {}

    window.__CCSWITCH_QI__ = {
      parse: parseNewApiClipboard,
      parsePartial: parseNewApiClipboardPartial,
      detect: detectFromPage,
      buildDeeplink: buildDeeplink,
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
