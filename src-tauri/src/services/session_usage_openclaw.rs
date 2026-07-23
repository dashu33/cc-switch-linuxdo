//! OpenClaw 会话用量同步
//!
//! 从 OpenClaw 会话记录导入 token/usage 到 `proxy_request_logs`，供供应商卡片
//! 「最近调用 / 本地成功率」按 `app_type=openclaw` 展示。
//!
//! ## 数据源（双轨）
//! ```text
//! 1) 旧 JSONL（session manager 仍扫描）：
//!    ~/.openclaw/agents/<agentId>/sessions/*.jsonl
//! 2) 新 SQLite runtime：
//!    ~/.openclaw/agents/<agentId>/agent/openclaw-agent.sqlite
//!    表 sessions + transcript_events(event_json)
//! ```
//!
//! ## 行结构（与 OpenClaw session-cost-usage 对齐）
//! ```json
//! {
//!   "type": "message",
//!   "timestamp": "2026-03-06T10:02:00Z",
//!   "provider": "openai",
//!   "model": "gpt-5.5",
//!   "message": {
//!     "role": "assistant",
//!     "usage": { "input": 10, "output": 20, "cacheRead": 0, "cacheWrite": 0 },
//!     "provider": "openai",
//!     "model": "gpt-5.5",
//!     "durationMs": 1200
//!   }
//! }
//! ```
//!
//! ## 供应商匹配
//! - 优先：日志 `provider` 字段 == CC Switch 供应商 id
//! - 否则：模型 id 命中供应商 `settings_config.models[].id`
//! - 再否则：`_openclaw_session` 占位（展示名 "OpenClaw (Session)"）

use crate::database::{lock_conn, Database};
use crate::error::AppError;
use crate::openclaw_config::get_openclaw_dir;
use crate::proxy::usage::calculator::CostCalculator;
use crate::proxy::usage::parser::TokenUsage;
use crate::services::session_usage::{
    get_sync_state, metadata_modified_nanos, update_sync_state, SessionSyncResult,
};
use crate::services::usage_stats::{find_model_pricing, should_skip_session_insert, DedupKey};
use rust_decimal::Decimal;
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

const APP_TYPE: &str = "openclaw";
const DATA_SOURCE: &str = "openclaw_session";
const FALLBACK_PROVIDER_ID: &str = "_openclaw_session";

#[derive(Debug, Clone)]
struct OpenClawUsageEntry {
    /// Stable id for request_id suffix (message id / event seq).
    entry_id: String,
    model: String,
    /// OpenClaw-native provider key (often the models.providers key).
    native_provider: Option<String>,
    input_tokens: u32,
    output_tokens: u32,
    cache_read_tokens: u32,
    cache_write_tokens: u32,
    cost_total: Option<f64>,
    created_at: i64,
    latency_ms: i64,
    status_code: i64,
    error_message: Option<String>,
}

/// 同步 OpenClaw 会话用量。
pub fn sync_openclaw_usage(db: &Database) -> Result<SessionSyncResult, AppError> {
    let root = get_openclaw_dir();
    let agents_dir = root.join("agents");

    let mut result = SessionSyncResult {
        imported: 0,
        skipped: 0,
        files_scanned: 0,
        errors: vec![],
    };

    if !agents_dir.is_dir() {
        return Ok(result);
    }

    let provider_index = load_openclaw_provider_index(db);

    let agent_entries = match fs::read_dir(&agents_dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(result),
    };

    for agent_entry in agent_entries.flatten() {
        let agent_path = agent_entry.path();
        if !agent_path.is_dir() {
            continue;
        }
        let agent_id = agent_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("agent")
            .to_string();

        // 1) Legacy / still-present JSONL sessions
        let sessions_dir = agent_path.join("sessions");
        if sessions_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&sessions_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                        continue;
                    }
                    result.files_scanned += 1;
                    match sync_jsonl_file(db, &path, &agent_id, &provider_index) {
                        Ok((imported, skipped)) => {
                            result.imported += imported;
                            result.skipped += skipped;
                        }
                        Err(e) => {
                            let msg = format!(
                                "OpenClaw JSONL 解析失败 {}: {e}",
                                path.display()
                            );
                            log::warn!("[OPENCLAW-SYNC] {msg}");
                            result.errors.push(msg);
                        }
                    }
                }
            }
        }

        // 2) SQLite runtime store
        let sqlite_path = agent_path.join("agent").join("openclaw-agent.sqlite");
        if sqlite_path.is_file() {
            result.files_scanned += 1;
            match sync_sqlite_db(db, &sqlite_path, &agent_id, &provider_index) {
                Ok((imported, skipped)) => {
                    result.imported += imported;
                    result.skipped += skipped;
                }
                Err(e) => {
                    let msg = format!(
                        "OpenClaw SQLite 解析失败 {}: {e}",
                        sqlite_path.display()
                    );
                    log::warn!("[OPENCLAW-SYNC] {msg}");
                    result.errors.push(msg);
                }
            }
        }
    }

    if result.imported > 0 {
        log::info!(
            "[OPENCLAW-SYNC] 同步完成: 导入 {} 条, 跳过 {} 条, 扫描 {} 个源",
            result.imported,
            result.skipped,
            result.files_scanned
        );
    }

    Ok(result)
}

/// Map model_id -> preferred provider_id (first match wins by sort_index order).
/// Also expose id set for direct native provider key hits.
struct OpenClawProviderIndex {
    by_id: HashMap<String, String>,
    /// model id (case-insensitive) -> provider id
    by_model: HashMap<String, String>,
}

fn load_openclaw_provider_index(db: &Database) -> OpenClawProviderIndex {
    let mut by_id = HashMap::new();
    let mut by_model = HashMap::new();

    // lock_conn! uses `?` and only works in Result-returning functions; use raw lock here.
    let conn = match db.conn.lock() {
        Ok(c) => c,
        Err(_) => return OpenClawProviderIndex { by_id, by_model },
    };

    let mut stmt = match conn.prepare(
        "SELECT id, settings_config FROM providers WHERE app_type = 'openclaw' ORDER BY sort_index ASC, created_at ASC",
    ) {
        Ok(s) => s,
        Err(_) => return OpenClawProviderIndex { by_id, by_model },
    };

    let rows = match stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) {
        Ok(r) => r,
        Err(_) => return OpenClawProviderIndex { by_id, by_model },
    };

    for row in rows.flatten() {
        let (id, settings_json) = row;
        by_id.insert(id.clone(), id.clone());
        if let Ok(value) = serde_json::from_str::<Value>(&settings_json) {
            if let Some(models) = value.get("models").and_then(|m| m.as_array()) {
                for model in models {
                    let model_id = model
                        .get("id")
                        .and_then(|v| v.as_str())
                        .or_else(|| model.as_str())
                        .unwrap_or("")
                        .trim();
                    if model_id.is_empty() {
                        continue;
                    }
                    by_model
                        .entry(model_id.to_ascii_lowercase())
                        .or_insert_with(|| id.clone());
                }
            }
        }
    }

    OpenClawProviderIndex { by_id, by_model }
}
fn resolve_provider_id(
    index: &OpenClawProviderIndex,
    native_provider: Option<&str>,
    model: &str,
) -> String {
    if let Some(native) = native_provider.map(str::trim).filter(|s| !s.is_empty()) {
        if index.by_id.contains_key(native) {
            return native.to_string();
        }
        // OpenClaw default model refs look like "providerKey/modelId"
        if let Some((head, _)) = native.split_once('/') {
            if index.by_id.contains_key(head) {
                return head.to_string();
            }
        }
    }

    let model_key = model.trim().to_ascii_lowercase();
    if !model_key.is_empty() {
        if let Some(pid) = index.by_model.get(&model_key) {
            return pid.clone();
        }
        // strip provider/ prefix from model refs
        if let Some((_, tail)) = model_key.split_once('/') {
            if let Some(pid) = index.by_model.get(tail) {
                return pid.clone();
            }
        }
    }

    FALLBACK_PROVIDER_ID.to_string()
}

fn sync_jsonl_file(
    db: &Database,
    path: &Path,
    agent_id: &str,
    index: &OpenClawProviderIndex,
) -> Result<(u32, u32), AppError> {
    let path_str = path.to_string_lossy().to_string();
    let metadata = fs::metadata(path)
        .map_err(|e| AppError::Config(format!("无法读取 OpenClaw JSONL 元数据: {e}")))?;
    let file_modified = metadata_modified_nanos(&metadata);
    let (last_modified, _) = get_sync_state(db, &path_str)?;
    if file_modified <= last_modified {
        return Ok((0, 0));
    }

    let session_id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    let file = File::open(path)
        .map_err(|e| AppError::Config(format!("无法打开 OpenClaw JSONL: {e}")))?;
    let reader = BufReader::new(file);

    let mut imported = 0u32;
    let mut skipped = 0u32;
    let mut line_no: u64 = 0;

    for line in reader.lines() {
        line_no += 1;
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let value: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let Some(entry) = parse_usage_from_event(&value, &format!("L{line_no}")) else {
            continue;
        };
        let request_id = format!(
            "openclaw_session:{agent_id}:{session_id}:{}",
            entry.entry_id
        );
        match insert_openclaw_entry(db, &request_id, &session_id, &entry, index) {
            Ok(true) => imported += 1,
            Ok(false) => skipped += 1,
            Err(e) => {
                log::warn!("[OPENCLAW-SYNC] 写入失败 ({request_id}): {e}");
                skipped += 1;
            }
        }
    }

    update_sync_state(db, &path_str, file_modified, line_no as i64)?;
    Ok((imported, skipped))
}

fn sync_sqlite_db(
    db: &Database,
    sqlite_path: &Path,
    agent_id: &str,
    index: &OpenClawProviderIndex,
) -> Result<(u32, u32), AppError> {
    let path_str = sqlite_path.to_string_lossy().to_string();
    let metadata = fs::metadata(sqlite_path)
        .map_err(|e| AppError::Config(format!("无法读取 OpenClaw SQLite 元数据: {e}")))?;
    let mut file_modified = metadata_modified_nanos(&metadata);
    // WAL sidecar is typically "<dbfile>-wal" (not a replaced extension).
    let wal_path = PathBuf::from(format!("{}-wal", sqlite_path.display()));
    if let Ok(wal_meta) = fs::metadata(&wal_path) {
        file_modified = file_modified.max(metadata_modified_nanos(&wal_meta));
    }

    let (last_modified, _) = get_sync_state(db, &path_str)?;
    if file_modified <= last_modified {
        return Ok((0, 0));
    }

    let oc_conn = rusqlite::Connection::open_with_flags(
        sqlite_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| AppError::Database(format!("无法打开 OpenClaw SQLite: {e}")))?;

    // Ensure expected tables exist (older installs may only have JSONL)
    let has_events: bool = oc_conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='transcript_events')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !has_events {
        update_sync_state(db, &path_str, file_modified, 0)?;
        return Ok((0, 0));
    }

    let mut stmt = oc_conn
        .prepare(
            "SELECT e.session_id, e.seq, e.event_json, e.created_at,
                    s.model, s.model_provider
             FROM transcript_events e
             LEFT JOIN sessions s ON s.session_id = e.session_id
             ORDER BY e.session_id, e.seq",
        )
        .map_err(|e| AppError::Database(format!("准备 OpenClaw transcript 查询失败: {e}")))?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })
        .map_err(|e| AppError::Database(format!("查询 OpenClaw transcript 失败: {e}")))?;

    let mut imported = 0u32;
    let mut skipped = 0u32;
    let mut scanned = 0i64;

    for row in rows {
        let (session_id, seq, event_json, created_at, session_model, session_provider) =
            match row {
                Ok(v) => v,
                Err(_) => continue,
            };
        scanned += 1;
        let value: Value = match serde_json::from_str(&event_json) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let Some(mut entry) = parse_usage_from_event(&value, &format!("S{seq}")) else {
            continue;
        };
        // Fill missing model/provider from session row
        if entry.model.is_empty() || entry.model == "unknown" {
            if let Some(m) = session_model.as_deref().filter(|s| !s.is_empty()) {
                entry.model = m.to_string();
            }
        }
        if entry.native_provider.is_none() {
            entry.native_provider = session_provider.clone();
        }
        if entry.created_at <= 0 {
            // SQLite created_at is typically ms
            entry.created_at = if created_at > 1_000_000_000_000 {
                created_at / 1000
            } else {
                created_at
            };
        }

        let request_id = format!("openclaw_session:{agent_id}:{session_id}:{seq}");
        match insert_openclaw_entry(db, &request_id, &session_id, &entry, index) {
            Ok(true) => imported += 1,
            Ok(false) => skipped += 1,
            Err(e) => {
                log::warn!("[OPENCLAW-SYNC] 写入失败 ({request_id}): {e}");
                skipped += 1;
            }
        }
    }

    update_sync_state(db, &path_str, file_modified, scanned)?;
    Ok((imported, skipped))
}

fn parse_usage_from_event(value: &Value, fallback_id: &str) -> Option<OpenClawUsageEntry> {
    // Prefer type=message entries; also accept bare message objects.
    let message = if value.get("type").and_then(|t| t.as_str()) == Some("message") {
        value.get("message")?
    } else if value.get("message").is_some() {
        value.get("message")?
    } else if value.get("role").is_some() {
        value
    } else {
        return None;
    };

    let role = message.get("role").and_then(|r| r.as_str()).unwrap_or("");
    if role != "assistant" {
        return None;
    }

    let usage = message
        .get("usage")
        .or_else(|| value.get("usage"))
        .filter(|u| u.is_object())?;

    let input = usage_u32(usage, &["input", "inputTokens", "input_tokens", "prompt_tokens"]);
    let mut output = usage_u32(
        usage,
        &["output", "outputTokens", "output_tokens", "completion_tokens"],
    );
    let reasoning = usage_u32(
        usage,
        &["reasoningTokens", "reasoning_tokens", "reasoning"],
    );
    output = output.saturating_add(reasoning);
    let cache_read = usage_u32(
        usage,
        &[
            "cacheRead",
            "cache_read",
            "cache_read_input_tokens",
            "cached_tokens",
        ],
    )
    .max(
        usage
            .get("cache")
            .and_then(|c| c.get("read"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
    );
    let cache_write = usage_u32(
        usage,
        &[
            "cacheWrite",
            "cache_write",
            "cache_creation_input_tokens",
            "cache_creation_tokens",
        ],
    )
    .max(
        usage
            .get("cache")
            .and_then(|c| c.get("write"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
    );

    if input == 0 && output == 0 && cache_read == 0 && cache_write == 0 {
        return None;
    }

    let model = message
        .get("model")
        .and_then(|v| v.as_str())
        .or_else(|| value.get("model").and_then(|v| v.as_str()))
        .unwrap_or("unknown")
        .trim()
        .to_string();

    let native_provider = message
        .get("provider")
        .and_then(|v| v.as_str())
        .or_else(|| value.get("provider").and_then(|v| v.as_str()))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let cost_total = usage
        .get("cost")
        .and_then(|c| {
            if let Some(total) = c.get("total").and_then(|v| v.as_f64()) {
                Some(total)
            } else if c.is_object() {
                let sum = ["input", "output", "cacheRead", "cacheWrite"]
                    .iter()
                    .filter_map(|k| c.get(*k).and_then(|v| v.as_f64()))
                    .sum::<f64>();
                if sum > 0.0 {
                    Some(sum)
                } else {
                    None
                }
            } else {
                c.as_f64()
            }
        })
        .or_else(|| value.get("cost").and_then(|v| v.as_f64()));

    let created_at = parse_created_at(value, message);
    let latency_ms = message
        .get("durationMs")
        .or_else(|| value.get("durationMs"))
        .and_then(|v| v.as_f64())
        .map(|v| v.max(0.0) as i64)
        .unwrap_or(0);

    let stop_reason = message
        .get("stopReason")
        .or_else(|| message.get("stop_reason"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let (status_code, error_message) = match stop_reason {
        "error" | "aborted" | "timeout" => (
            500i64,
            Some(format!("stopReason={stop_reason}")),
        ),
        _ => (200i64, None),
    };

    let entry_id = message
        .get("id")
        .and_then(|v| v.as_str())
        .or_else(|| value.get("id").and_then(|v| v.as_str()))
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            // Stable fallback: model+tokens+time
            format!(
                "{fallback_id}:{created_at}:{input}:{output}:{cache_read}:{cache_write}"
            )
        });

    Some(OpenClawUsageEntry {
        entry_id,
        model,
        native_provider,
        input_tokens: input,
        output_tokens: output,
        cache_read_tokens: cache_read,
        cache_write_tokens: cache_write,
        cost_total,
        created_at,
        latency_ms,
        status_code,
        error_message,
    })
}

fn usage_u32(usage: &Value, keys: &[&str]) -> u32 {
    for key in keys {
        if let Some(v) = usage.get(*key).and_then(|x| x.as_u64()) {
            return v as u32;
        }
        if let Some(v) = usage.get(*key).and_then(|x| x.as_f64()) {
            if v.is_finite() && v >= 0.0 {
                return v as u32;
            }
        }
    }
    0
}

fn parse_created_at(entry: &Value, message: &Value) -> i64 {
    // Prefer numeric ms timestamps on message, then entry.
    for candidate in [
        message.get("timestamp"),
        entry.get("timestamp"),
        message.get("createdAt"),
        entry.get("createdAt"),
    ]
    .into_iter()
    .flatten()
    {
        if let Some(n) = candidate.as_i64() {
            return if n > 1_000_000_000_000 { n / 1000 } else { n };
        }
        if let Some(n) = candidate.as_f64() {
            let n = n as i64;
            return if n > 1_000_000_000_000 { n / 1000 } else { n };
        }
        if let Some(s) = candidate.as_str() {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                return dt.timestamp();
            }
            if let Ok(n) = s.parse::<i64>() {
                return if n > 1_000_000_000_000 { n / 1000 } else { n };
            }
        }
    }
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn insert_openclaw_entry(
    db: &Database,
    request_id: &str,
    session_id: &str,
    entry: &OpenClawUsageEntry,
    index: &OpenClawProviderIndex,
) -> Result<bool, AppError> {
    let conn = lock_conn!(db.conn);
    let provider_id = resolve_provider_id(
        index,
        entry.native_provider.as_deref(),
        &entry.model,
    );

    let dedup_key = DedupKey {
        app_type: APP_TYPE,
        model: &entry.model,
        input_tokens: entry.input_tokens,
        output_tokens: entry.output_tokens,
        cache_read_tokens: entry.cache_read_tokens,
        cache_creation_tokens: entry.cache_write_tokens,
        created_at: entry.created_at,
    };
    if should_skip_session_insert(&conn, request_id, &dedup_key)? {
        return Ok(false);
    }

    let (input_cost, output_cost, cache_read_cost, cache_creation_cost, total_cost) =
        if let Some(total) = entry.cost_total.filter(|c| c.is_finite() && *c > 0.0) {
            (
                "0".to_string(),
                "0".to_string(),
                "0".to_string(),
                "0".to_string(),
                total.to_string(),
            )
        } else {
            let usage = TokenUsage {
                input_tokens: entry.input_tokens,
                output_tokens: entry.output_tokens,
                cache_read_tokens: entry.cache_read_tokens,
                cache_creation_tokens: entry.cache_write_tokens,
                model: Some(entry.model.clone()),
                message_id: None,
            };
            match find_model_pricing(&conn, &entry.model) {
                Some(pricing) => {
                    let cost = CostCalculator::calculate_for_app(
                        APP_TYPE,
                        &usage,
                        &pricing,
                        Decimal::from(1),
                    );
                    (
                        cost.input_cost.to_string(),
                        cost.output_cost.to_string(),
                        cost.cache_read_cost.to_string(),
                        cost.cache_creation_cost.to_string(),
                        cost.total_cost.to_string(),
                    )
                }
                None => (
                    "0".to_string(),
                    "0".to_string(),
                    "0".to_string(),
                    "0".to_string(),
                    "0".to_string(),
                ),
            }
        };

    let inserted = conn
        .execute(
            "INSERT OR IGNORE INTO proxy_request_logs (
                request_id, provider_id, app_type, model, request_model,
                input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
                input_cost_usd, output_cost_usd, cache_read_cost_usd, cache_creation_cost_usd, total_cost_usd,
                latency_ms, first_token_ms, status_code, error_message, session_id,
                provider_type, is_streaming, cost_multiplier, created_at, data_source
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)",
            rusqlite::params![
                request_id,
                provider_id,
                APP_TYPE,
                entry.model,
                entry.model,
                entry.input_tokens,
                entry.output_tokens,
                entry.cache_read_tokens,
                entry.cache_write_tokens,
                input_cost,
                output_cost,
                cache_read_cost,
                cache_creation_cost,
                total_cost,
                entry.latency_ms,
                Option::<i64>::None,
                entry.status_code,
                entry.error_message,
                Some(session_id.to_string()),
                Some(DATA_SOURCE),
                1i64,
                "1.0",
                entry.created_at,
                DATA_SOURCE,
            ],
        )
        .map_err(|e| AppError::Database(format!("插入 OpenClaw 会话日志失败: {e}")))?;

    if inserted > 0 {
        crate::usage_events::notify_log_recorded();
        Ok(true)
    } else {
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use tempfile::tempdir;

    #[test]
    fn parse_usage_from_assistant_message() {
        let value = serde_json::json!({
            "type": "message",
            "timestamp": "2026-03-06T10:02:00Z",
            "provider": "openai",
            "model": "gpt-5.5",
            "message": {
                "role": "assistant",
                "id": "msg-1",
                "usage": {
                    "input": 10,
                    "output": 20,
                    "cacheRead": 2,
                    "cacheWrite": 1,
                    "cost": { "total": 0.0123 }
                },
                "durationMs": 1500
            }
        });
        let entry = parse_usage_from_event(&value, "L1").expect("parsed");
        assert_eq!(entry.entry_id, "msg-1");
        assert_eq!(entry.model, "gpt-5.5");
        assert_eq!(entry.native_provider.as_deref(), Some("openai"));
        assert_eq!(entry.input_tokens, 10);
        assert_eq!(entry.output_tokens, 20);
        assert_eq!(entry.cache_read_tokens, 2);
        assert_eq!(entry.cache_write_tokens, 1);
        assert_eq!(entry.cost_total, Some(0.0123));
        assert_eq!(entry.latency_ms, 1500);
        assert_eq!(entry.status_code, 200);
    }

    #[test]
    fn parse_skips_user_and_empty_usage() {
        let user = serde_json::json!({
            "type": "message",
            "message": { "role": "user", "usage": { "input": 1, "output": 0 } }
        });
        assert!(parse_usage_from_event(&user, "L1").is_none());

        let empty = serde_json::json!({
            "type": "message",
            "message": { "role": "assistant", "usage": { "input": 0, "output": 0 } }
        });
        assert!(parse_usage_from_event(&empty, "L2").is_none());
    }

    #[test]
    fn resolve_provider_prefers_id_then_model() {
        let index = OpenClawProviderIndex {
            by_id: HashMap::from([("my-gateway".into(), "my-gateway".into())]),
            by_model: HashMap::from([("gpt-5.5".into(), "my-gateway".into())]),
        };
        assert_eq!(
            resolve_provider_id(&index, Some("my-gateway"), "other"),
            "my-gateway"
        );
        assert_eq!(
            resolve_provider_id(&index, Some("unknown"), "gpt-5.5"),
            "my-gateway"
        );
        assert_eq!(
            resolve_provider_id(&index, None, "nope"),
            FALLBACK_PROVIDER_ID
        );
    }

    #[test]
    fn sync_jsonl_imports_rows_matched_to_provider() -> Result<(), AppError> {
        let db = Database::memory()?;
        {
            let conn = lock_conn!(db.conn);
            conn.execute(
                "INSERT INTO providers (id, app_type, name, settings_config, meta, is_current, in_failover_queue, sort_index, created_at)
                 VALUES ('gw-1', 'openclaw', 'Gateway One', ?1, '{}', 0, 0, 0, 1)",
                rusqlite::params![serde_json::json!({
                    "baseUrl": "https://example.com/v1",
                    "apiKey": "sk",
                    "api": "openai-completions",
                    "models": [{ "id": "gpt-5.5", "name": "GPT" }]
                })
                .to_string()],
            )?;
        }

        let temp = tempdir().expect("tempdir");
        let sessions = temp.path().join("agents").join("main").join("sessions");
        fs::create_dir_all(&sessions).expect("mkdir");
        let path = sessions.join("sess-1.jsonl");
        fs::write(
            &path,
            concat!(
                "{\"type\":\"session\",\"id\":\"sess-1\",\"timestamp\":\"2026-03-06T10:00:00Z\"}\n",
                "{\"type\":\"message\",\"timestamp\":\"2026-03-06T10:01:00Z\",\"message\":{\"role\":\"user\",\"content\":\"hi\"}}\n",
                "{\"type\":\"message\",\"timestamp\":\"2026-03-06T10:02:00Z\",\"provider\":\"gw-1\",\"model\":\"gpt-5.5\",\"message\":{\"role\":\"assistant\",\"id\":\"a1\",\"usage\":{\"input\":11,\"output\":22},\"durationMs\":800}}\n",
            ),
        )
        .expect("write");

        // Point get_openclaw_dir via override is not trivial here; call sync_jsonl directly.
        let index = load_openclaw_provider_index(&db);
        let (imported, skipped) = sync_jsonl_file(&db, &path, "main", &index)?;
        assert_eq!(imported, 1);
        assert_eq!(skipped, 0);

        let conn = lock_conn!(db.conn);
        let (provider_id, app_type, model, data_source, latency): (
            String,
            String,
            String,
            String,
            i64,
        ) = conn.query_row(
            "SELECT provider_id, app_type, model, data_source, latency_ms
             FROM proxy_request_logs WHERE data_source = 'openclaw_session'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )?;
        assert_eq!(provider_id, "gw-1");
        assert_eq!(app_type, "openclaw");
        assert_eq!(model, "gpt-5.5");
        assert_eq!(data_source, "openclaw_session");
        assert_eq!(latency, 800);

        // Second sync is a no-op via watermark
        let (imported2, _) = sync_jsonl_file(&db, &path, "main", &index)?;
        assert_eq!(imported2, 0);
        Ok(())
    }
}
