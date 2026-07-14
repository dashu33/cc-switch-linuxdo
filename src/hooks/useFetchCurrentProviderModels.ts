import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Provider } from "@/types";
import type { AppId } from "@/lib/api";
import {
  fetchModelsForConfig,
  showFetchModelsError,
} from "@/lib/api/model-fetch";
import { resolveProviderModelsProbeTarget } from "@/utils/providerModelsProbe";

export type ModelsProbeStatus =
  | "idle"
  | "probing"
  | "success"
  | "empty"
  | "failed"
  | "skipped";

export interface ModelsProbeEntry {
  status: ModelsProbeStatus;
  at: number | null;
  modelCount?: number;
  reason?: string;
}

export interface ModelsProbeResult {
  /** 汇总态：用于顶部按钮配色 */
  status: ModelsProbeStatus;
  /** 兼容旧字段：批量探测时为 null；单测时可为当前 id */
  providerId: string | null;
  at: number | null;
  modelCount?: number;
  /** 成功/空/失败计数（批量） */
  successCount?: number;
  emptyCount?: number;
  failedCount?: number;
  skippedCount?: number;
  totalCount?: number;
}

export type ModelsProbeById = Record<string, ModelsProbeEntry>;

const CONCURRENCY = 4;
const RESULT_TTL_MS = 60_000;

/**
 * 一键拉取：批量探测当前 app 下所有可探测供应商的 /models。
 * - 顶部按钮：汇总进度 + 结果色
 * - 每张卡片：边框色 + Codex「获取」按钮色（按 providerId）
 */
export function useFetchCurrentProviderModels(
  appId: AppId,
  providers: Record<string, Provider>,
  currentProviderId: string,
) {
  const { t } = useTranslation();
  const [isFetching, setIsFetching] = useState(false);
  const [probeResult, setProbeResult] = useState<ModelsProbeResult>({
    status: "idle",
    providerId: null,
    at: null,
  });
  const [probeById, setProbeById] = useState<ModelsProbeById>({});
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runIdRef = useRef(0);

  const clearClearTimer = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearClearTimer();
  }, [clearClearTimer]);

  // 切换 app 时清空旧结果，避免串色
  useEffect(() => {
    runIdRef.current += 1;
    clearClearTimer();
    setIsFetching(false);
    setProbeResult({ status: "idle", providerId: null, at: null });
    setProbeById({});
  }, [appId, clearClearTimer]);

  const scheduleAutoClear = useCallback(() => {
    clearClearTimer();
    clearTimerRef.current = setTimeout(() => {
      setProbeResult({ status: "idle", providerId: null, at: null });
      setProbeById({});
      clearTimerRef.current = null;
    }, RESULT_TTL_MS);
  }, [clearClearTimer]);

  const probeOne = useCallback(
    async (
      provider: Provider,
    ): Promise<{ id: string; entry: ModelsProbeEntry }> => {
      const resolved = resolveProviderModelsProbeTarget(provider, appId);
      if (!resolved.ok) {
        return {
          id: provider.id,
          entry: {
            status: "skipped",
            at: Date.now(),
            reason: resolved.reason,
          },
        };
      }

      const { target } = resolved;
      try {
        const models = await fetchModelsForConfig(
          target.baseUrl,
          target.apiKey,
          target.isFullUrl,
          undefined,
          target.customUserAgent,
        );
        if (models.length === 0) {
          return {
            id: provider.id,
            entry: {
              status: "empty",
              at: Date.now(),
              modelCount: 0,
            },
          };
        }
        return {
          id: provider.id,
          entry: {
            status: "success",
            at: Date.now(),
            modelCount: models.length,
          },
        };
      } catch (err) {
        console.warn("[FetchProviderModels] failed", {
          provider: target.providerName,
          err,
        });
        return {
          id: provider.id,
          entry: {
            status: "failed",
            at: Date.now(),
          },
        };
      }
    },
    [appId],
  );

  const fetchCurrentProviderModels = useCallback(async () => {
    if (isFetching) return;

    const list = Object.values(providers);
    if (list.length === 0) {
      toast.error(
        t("provider.fetchModelsNoProviders", {
          defaultValue: "当前没有可探测的供应商",
        }),
      );
      return;
    }

    const runId = ++runIdRef.current;
    clearClearTimer();
    setIsFetching(true);

    // 先全部标为 probing / 预判 skipped
    const initial: ModelsProbeById = {};
    for (const p of list) {
      const resolved = resolveProviderModelsProbeTarget(p, appId);
      if (!resolved.ok) {
        initial[p.id] = {
          status: "skipped",
          at: Date.now(),
          reason: resolved.reason,
        };
      } else {
        initial[p.id] = { status: "probing", at: Date.now() };
      }
    }
    setProbeById(initial);
    setProbeResult({
      status: "probing",
      providerId: currentProviderId || null,
      at: Date.now(),
      totalCount: list.length,
      successCount: 0,
      emptyCount: 0,
      failedCount: 0,
      skippedCount: Object.values(initial).filter((e) => e.status === "skipped")
        .length,
    });

    const probeable = list.filter((p) => initial[p.id]?.status === "probing");
    const skippedCount = list.length - probeable.length;
    const results = new Map<string, ModelsProbeEntry>();

    const recount = () => {
      let successCount = 0;
      let emptyCount = 0;
      let failedCount = 0;
      let totalModels = 0;
      for (const entry of results.values()) {
        if (entry.status === "success") {
          successCount += 1;
          totalModels += entry.modelCount ?? 0;
        } else if (entry.status === "empty") {
          emptyCount += 1;
        } else if (entry.status === "failed") {
          failedCount += 1;
        }
      }
      return { successCount, emptyCount, failedCount, totalModels };
    };

    // 有限并发
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, Math.max(probeable.length, 1)) },
      async () => {
        while (cursor < probeable.length) {
          if (runIdRef.current !== runId) return;
          const index = cursor++;
          const provider = probeable[index];
          if (!provider) return;
          const { id, entry } = await probeOne(provider);
          if (runIdRef.current !== runId) return;

          results.set(id, entry);
          const counts = recount();
          setProbeById((prev) => ({ ...prev, [id]: entry }));
          setProbeResult((prev) => ({
            ...prev,
            status: "probing",
            at: Date.now(),
            successCount: counts.successCount,
            emptyCount: counts.emptyCount,
            failedCount: counts.failedCount,
            skippedCount,
            totalCount: list.length,
            modelCount: counts.totalModels,
          }));
        }
      },
    );

    try {
      await Promise.all(workers);
      if (runIdRef.current !== runId) return;

      const { successCount, emptyCount, failedCount, totalModels } = recount();

      // 汇总顶部按钮态
      let summary: ModelsProbeStatus = "idle";
      if (probeable.length === 0) {
        summary = "skipped";
      } else if (successCount > 0 && failedCount === 0 && emptyCount === 0) {
        summary = "success";
      } else if (successCount === 0 && emptyCount > 0 && failedCount === 0) {
        summary = "empty";
      } else if (successCount === 0 && emptyCount === 0 && failedCount > 0) {
        summary = "failed";
      } else if (successCount > 0 || emptyCount > 0 || failedCount > 0) {
        summary =
          successCount > 0 ? "success" : emptyCount > 0 ? "empty" : "failed";
      } else {
        summary = "skipped";
      }

      setProbeResult({
        status: summary,
        providerId: null,
        at: Date.now(),
        modelCount: totalModels,
        successCount,
        emptyCount,
        failedCount,
        skippedCount,
        totalCount: list.length,
      });
      scheduleAutoClear();

      if (probeable.length === 0) {
        toast.info(
          t("provider.fetchModelsAllSkipped", {
            skipped: skippedCount,
            defaultValue: `没有可探测的供应商（已跳过 ${skippedCount} 个官方/OAuth/缺配置项）`,
          }),
        );
        return;
      }

      toast.success(
        t("provider.fetchModelsBatchDone", {
          success: successCount,
          empty: emptyCount,
          failed: failedCount,
          skipped: skippedCount,
          models: totalModels,
          defaultValue: `探测完成：可用 ${successCount} · 无模型 ${emptyCount} · 失败 ${failedCount} · 跳过 ${skippedCount}`,
        }),
        {
          description: t("provider.fetchModelsBatchDoneHint", {
            defaultValue:
              "每张卡片边框与「获取」按钮已按结果着色（约 60 秒后复位）",
          }),
          closeButton: true,
        },
      );
    } catch (err) {
      if (runIdRef.current !== runId) return;
      console.warn("[FetchProviderModels] batch failed", err);
      const counts = recount();
      setProbeResult({
        status: "failed",
        providerId: null,
        at: Date.now(),
        successCount: counts.successCount,
        emptyCount: counts.emptyCount,
        failedCount: counts.failedCount,
        skippedCount,
        totalCount: list.length,
      });
      scheduleAutoClear();
      toast.error(
        t("provider.fetchModelsProbeFailed", {
          name: t("common.all", { defaultValue: "全部" }),
          defaultValue: "批量拉取模型失败",
        }),
      );
      showFetchModelsError(err, t);
    } finally {
      if (runIdRef.current === runId) {
        setIsFetching(false);
      }
    }
  }, [
    appId,
    clearClearTimer,
    currentProviderId,
    isFetching,
    probeOne,
    providers,
    scheduleAutoClear,
    t,
  ]);

  return {
    isFetching,
    fetchCurrentProviderModels,
    probeResult,
    probeById,
  };
}
