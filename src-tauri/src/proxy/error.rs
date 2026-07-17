use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProxyError {
    #[error("服务器已在运行")]
    AlreadyRunning,

    #[error("服务器未运行")]
    NotRunning,

    #[error("地址绑定失败: {0}")]
    BindFailed(String),

    #[error("停止超时")]
    StopTimeout,

    #[error("停止失败: {0}")]
    StopFailed(String),

    #[error("请求转发失败: {0}")]
    ForwardFailed(String),

    #[error("无可用的Provider")]
    NoAvailableProvider,

    #[error("所有供应商已熔断，无可用渠道")]
    AllProvidersCircuitOpen,

    #[error("未配置供应商")]
    NoProvidersConfigured,

    #[allow(dead_code)]
    #[error("Provider不健康: {0}")]
    ProviderUnhealthy(String),

    #[error("上游错误 (状态码 {status}): {body:?}")]
    UpstreamError { status: u16, body: Option<String> },

    #[error("超过最大重试次数")]
    MaxRetriesExceeded,

    #[error("数据库错误: {0}")]
    DatabaseError(String),

    #[error("配置错误: {0}")]
    ConfigError(String),

    #[allow(dead_code)]
    #[error("格式转换错误: {0}")]
    TransformError(String),

    #[allow(dead_code)]
    #[error("无效的请求: {0}")]
    InvalidRequest(String),

    #[error("超时: {0}")]
    Timeout(String),

    /// 流式响应空闲超时
    #[allow(dead_code)]
    #[error("流式响应空闲超时: {0}秒无数据")]
    StreamIdleTimeout(u64),

    /// 认证错误
    #[error("认证失败: {0}")]
    AuthError(String),

    #[allow(dead_code)]
    #[error("内部错误: {0}")]
    Internal(String),
}

impl IntoResponse for ProxyError {
    fn into_response(self) -> Response {
        let (status, body) = match &self {
            ProxyError::UpstreamError {
                status: upstream_status,
                body: upstream_body,
            } => {
                let http_status =
                    StatusCode::from_u16(*upstream_status).unwrap_or(StatusCode::BAD_GATEWAY);

                // 尝试解析上游响应体为 JSON，如果失败则包装为字符串
                let error_body = if let Some(body_str) = upstream_body {
                    if let Ok(mut json_body) = serde_json::from_str::<serde_json::Value>(body_str) {
                        // 上游 JSON 直接透传，但补齐 Grok/Codex 严格客户端需要的字段。
                        normalize_proxy_error_body(&mut json_body);
                        json_body
                    } else {
                        // 上游返回的不是 JSON，包装为错误消息
                        json!({
                            "error": {
                                "message": body_str,
                                "type": "upstream_error",
                                "code": "upstream_error",
                                "param": serde_json::Value::Null,
                            }
                        })
                    }
                } else {
                    json!({
                        "error": {
                            "message": format!("Upstream error (status {})", upstream_status),
                            "type": "upstream_error",
                            "code": "upstream_error",
                            "param": serde_json::Value::Null,
                        }
                    })
                };

                (http_status, error_body)
            }
            _ => {
                let (http_status, message) = match &self {
                    ProxyError::AlreadyRunning => (StatusCode::CONFLICT, self.to_string()),
                    ProxyError::NotRunning => (StatusCode::SERVICE_UNAVAILABLE, self.to_string()),
                    ProxyError::BindFailed(_) => {
                        (StatusCode::INTERNAL_SERVER_ERROR, self.to_string())
                    }
                    ProxyError::StopTimeout => {
                        (StatusCode::INTERNAL_SERVER_ERROR, self.to_string())
                    }
                    ProxyError::StopFailed(_) => {
                        (StatusCode::INTERNAL_SERVER_ERROR, self.to_string())
                    }
                    ProxyError::ForwardFailed(_) => (StatusCode::BAD_GATEWAY, self.to_string()),
                    ProxyError::NoAvailableProvider => {
                        (StatusCode::SERVICE_UNAVAILABLE, self.to_string())
                    }
                    ProxyError::AllProvidersCircuitOpen => {
                        (StatusCode::SERVICE_UNAVAILABLE, self.to_string())
                    }
                    ProxyError::NoProvidersConfigured => {
                        (StatusCode::SERVICE_UNAVAILABLE, self.to_string())
                    }
                    ProxyError::ProviderUnhealthy(_) => {
                        (StatusCode::SERVICE_UNAVAILABLE, self.to_string())
                    }
                    ProxyError::MaxRetriesExceeded => {
                        (StatusCode::SERVICE_UNAVAILABLE, self.to_string())
                    }
                    ProxyError::DatabaseError(_) => {
                        (StatusCode::INTERNAL_SERVER_ERROR, self.to_string())
                    }
                    ProxyError::ConfigError(_) => (StatusCode::BAD_REQUEST, self.to_string()),
                    ProxyError::TransformError(_) => {
                        (StatusCode::UNPROCESSABLE_ENTITY, self.to_string())
                    }
                    ProxyError::InvalidRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
                    ProxyError::Timeout(_) => (StatusCode::GATEWAY_TIMEOUT, self.to_string()),
                    ProxyError::StreamIdleTimeout(_) => {
                        (StatusCode::GATEWAY_TIMEOUT, self.to_string())
                    }
                    ProxyError::AuthError(_) => (StatusCode::UNAUTHORIZED, self.to_string()),
                    ProxyError::Internal(_) => {
                        (StatusCode::INTERNAL_SERVER_ERROR, self.to_string())
                    }
                    ProxyError::UpstreamError { .. } => unreachable!(),
                };

                let error_body = json!({
                    "error": {
                        "message": message,
                        "type": "proxy_error",
                        "code": "proxy_error",
                        "param": serde_json::Value::Null,
                    }
                });

                (http_status, error_body)
            }
        };

        (status, Json(body)).into_response()
    }
}


fn normalize_proxy_error_body(body: &mut serde_json::Value) {
    let Some(error) = body.get_mut("error") else {
        // Some gateways return a bare object without the error wrapper.
        if body.is_object() {
            let message = body
                .get("message")
                .and_then(|v| v.as_str())
                .or_else(|| body.get("detail").and_then(|v| v.as_str()))
                .unwrap_or("Upstream error")
                .to_string();
            let error_type = body
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("upstream_error")
                .to_string();
            let code = body
                .get("code")
                .cloned()
                .filter(|v| !v.is_null())
                .unwrap_or_else(|| serde_json::json!(error_type.clone()));
            *body = serde_json::json!({
                "error": {
                    "message": message,
                    "type": error_type,
                    "code": code,
                    "param": body.get("param").cloned().unwrap_or(serde_json::Value::Null),
                }
            });
        }
        return;
    };

    if !error.is_object() {
        let message = error
            .as_str()
            .map(ToString::to_string)
            .unwrap_or_else(|| error.to_string());
        *error = serde_json::json!({
            "message": message,
            "type": "upstream_error",
            "code": "upstream_error",
            "param": serde_json::Value::Null,
        });
        return;
    }

    if error
        .get("message")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().is_empty())
        .unwrap_or(true)
    {
        let message = error
            .get("detail")
            .and_then(|v| v.as_str())
            .unwrap_or("Upstream error");
        error["message"] = serde_json::json!(message);
    }
    if error
        .get("type")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().is_empty())
        .unwrap_or(true)
    {
        error["type"] = serde_json::json!("upstream_error");
    }
    let needs_code = match error.get("code") {
        None => true,
        Some(v) if v.is_null() => true,
        Some(v) if v.as_str().map(|s| s.trim().is_empty()).unwrap_or(false) => true,
        _ => false,
    };
    if needs_code {
        let synthesized = error
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("upstream_error");
        error["code"] = serde_json::json!(synthesized);
    }
    if error.get("param").is_none() {
        error["param"] = serde_json::Value::Null;
    }
}

/// 错误分类
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCategory {
    /// 可重试错误（网络问题、5xx）
    Retryable, // 网络超时、5xx 错误
    /// 不可重试错误（4xx、认证失败）
    NonRetryable, // 认证失败、参数错误、4xx 错误
    #[allow(dead_code)]
    ClientAbort, // 客户端主动中断
}

/// 判断错误是否可重试
#[allow(dead_code)]
pub fn categorize_error(error: &reqwest::Error) -> ErrorCategory {
    if error.is_timeout() || error.is_connect() {
        return ErrorCategory::Retryable;
    }

    if let Some(status) = error.status() {
        if status.is_server_error() {
            ErrorCategory::Retryable
        } else if status.is_client_error() {
            ErrorCategory::NonRetryable
        } else {
            ErrorCategory::Retryable
        }
    } else {
        ErrorCategory::Retryable
    }
}
