//! 统一供应商 (Universal Provider) DAO
//!
//! 提供统一供应商的 CRUD 操作。

use crate::database::{lock_conn, to_json_string, Database};
use crate::error::AppError;
use crate::provider::{universal_apps_json_needs_extended_fields, UniversalProvider};
use serde_json::Value;
use std::collections::HashMap;

/// 统一供应商的 Settings Key
const UNIVERSAL_PROVIDERS_KEY: &str = "universal_providers";

impl Database {
    /// 获取所有统一供应商
    ///
    /// 读取时会将缺少扩展应用字段的旧 JSON 迁移为完整 apps 对象并回写，
    /// 避免升级后 OpenClaw/Grok 等新增端因 `serde(default)=false` 永久关闭。
    pub fn get_all_universal_providers(
        &self,
    ) -> Result<HashMap<String, UniversalProvider>, AppError> {
        let conn = lock_conn!(self.conn);

        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = ?")
            .map_err(|e| AppError::Database(e.to_string()))?;

        let result: Option<String> = stmt
            .query_row([UNIVERSAL_PROVIDERS_KEY], |row| row.get(0))
            .ok();

        // Drop statement before optional rewrite uses the same connection.
        drop(stmt);

        match result {
            Some(json) => {
                let mut raw: Value = serde_json::from_str(&json).map_err(|e| {
                    AppError::Database(format!("解析统一供应商数据失败: {e}"))
                })?;
                let needs_rewrite = universal_providers_raw_needs_apps_migration(&raw);
                let providers: HashMap<String, UniversalProvider> =
                    serde_json::from_value(raw.take()).map_err(|e| {
                        AppError::Database(format!("解析统一供应商数据失败: {e}"))
                    })?;

                if needs_rewrite {
                    let migrated_json = to_json_string(&providers)?;
                    conn.execute(
                        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                        [UNIVERSAL_PROVIDERS_KEY, &migrated_json],
                    )
                    .map_err(|e| AppError::Database(e.to_string()))?;
                    log::info!(
                        "Migrated universal provider apps fields for {} record(s)",
                        providers.len()
                    );
                }

                Ok(providers)
            }
            None => Ok(HashMap::new()),
        }
    }

    /// 获取单个统一供应商
    pub fn get_universal_provider(&self, id: &str) -> Result<Option<UniversalProvider>, AppError> {
        let providers = self.get_all_universal_providers()?;
        Ok(providers.get(id).cloned())
    }

    /// 保存统一供应商（添加或更新）
    pub fn save_universal_provider(&self, provider: &UniversalProvider) -> Result<(), AppError> {
        let mut providers = self.get_all_universal_providers()?;
        providers.insert(provider.id.clone(), provider.clone());
        self.save_all_universal_providers(&providers)
    }

    /// 删除统一供应商
    pub fn delete_universal_provider(&self, id: &str) -> Result<bool, AppError> {
        let mut providers = self.get_all_universal_providers()?;
        let existed = providers.remove(id).is_some();
        if existed {
            self.save_all_universal_providers(&providers)?;
        }
        Ok(existed)
    }

    /// 保存所有统一供应商（内部方法）
    fn save_all_universal_providers(
        &self,
        providers: &HashMap<String, UniversalProvider>,
    ) -> Result<(), AppError> {
        let conn = lock_conn!(self.conn);
        let json = to_json_string(providers)?;

        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            [UNIVERSAL_PROVIDERS_KEY, &json],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(())
    }
}

/// 检查 raw settings JSON 是否需要扩展 apps 字段迁移
fn universal_providers_raw_needs_apps_migration(raw: &Value) -> bool {
    let Some(map) = raw.as_object() else {
        return false;
    };
    map.values().any(|provider| {
        provider
            .get("apps")
            .map(universal_apps_json_needs_extended_fields)
            .unwrap_or(false)
    })
}

#[cfg(test)]
mod tests {
    use super::universal_providers_raw_needs_apps_migration;
    use crate::provider::{universal_apps_json_needs_extended_fields, UniversalProviderApps};
    use serde_json::json;

    #[test]
    fn legacy_apps_json_missing_extended_fields_needs_migration() {
        let apps = json!({
            "claude": true,
            "codex": true,
            "gemini": true
        });
        assert!(universal_apps_json_needs_extended_fields(&apps));
    }

    #[test]
    fn complete_apps_json_does_not_need_migration() {
        let apps = json!({
            "claude": true,
            "codex": false,
            "gemini": true,
            "grokbuild": false,
            "claudeDesktop": true,
            "opencode": true,
            "openclaw": false,
            "hermes": true
        });
        assert!(!universal_apps_json_needs_extended_fields(&apps));
    }

    #[test]
    fn legacy_apps_deserialize_enables_missing_extended_apps() {
        let apps: UniversalProviderApps = serde_json::from_value(json!({
            "claude": true,
            "codex": true,
            "gemini": true
        }))
        .expect("deserialize legacy apps");

        assert!(apps.claude);
        assert!(apps.codex);
        assert!(apps.gemini);
        assert!(apps.grokbuild);
        assert!(apps.claude_desktop);
        assert!(apps.opencode);
        assert!(apps.openclaw);
        assert!(apps.hermes);
    }

    #[test]
    fn explicit_false_extended_apps_are_preserved() {
        let apps: UniversalProviderApps = serde_json::from_value(json!({
            "claude": true,
            "codex": true,
            "gemini": true,
            "grokbuild": false,
            "claudeDesktop": false,
            "opencode": false,
            "openclaw": false,
            "hermes": false
        }))
        .expect("deserialize apps with explicit false");

        assert!(!apps.grokbuild);
        assert!(!apps.claude_desktop);
        assert!(!apps.opencode);
        assert!(!apps.openclaw);
        assert!(!apps.hermes);
    }

    #[test]
    fn raw_providers_map_detects_legacy_apps() {
        let raw = json!({
            "u1": {
                "id": "u1",
                "name": "Legacy",
                "providerType": "newapi",
                "apps": { "claude": true, "codex": true, "gemini": true },
                "baseUrl": "https://example.com",
                "apiKey": "sk-test"
            }
        });
        assert!(universal_providers_raw_needs_apps_migration(&raw));
    }
}
