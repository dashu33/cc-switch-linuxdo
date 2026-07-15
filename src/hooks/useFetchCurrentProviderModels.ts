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
  /** Sample model ids from last successful probe (v1+ extension, optional). */
  modelIds?: string[];
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
const PROBE_HISTORY_STORAGE_PREFIX = "cc-switch-models-probe-history:v1:";
/** Keep storage small while still feeding brand logos / filters. */
const MAX_STORED_MODEL_IDS = 24;

const isCompletedProbeStatus = (
  status: unknown,
): status is "success" | "empty" | "failed" | "skipped" =>
  status === "success" ||
  status === "empty" ||
  status === "failed" ||
  status === "skipped";

function normalizeModelIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  if (ids.length === 0) return undefined;
  return ids.slice(0, MAX_STORED_MODEL_IDS);
}

export function parseModelsProbeHistory(raw: string | null): ModelsProbeById {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const history: ModelsProbeById = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      if (!isCompletedProbeStatus(entry.status)) continue;
      const modelIds = normalizeModelIds(entry.modelIds);
      history[id] = {
        status: entry.status,
        at: typeof entry.at === "number" ? entry.at : null,
        ...(typeof entry.modelCount === "number"
          ? { modelCount: entry.modelCount }
          : {}),
        ...(modelIds ? { modelIds } : {}),
        ...(typeof entry.reason === "string" ? { reason: entry.reason } : {}),
      };
    }
    return history;
  } catch {
    return {};
  }
}

export function readModelsProbeHistory(
  appId: AppId,
  storage?: Pick<Storage, "getItem">,
): ModelsProbeById {
  try {
    const target = storage ?? globalThis.localStorage;
    return parseModelsProbeHistory(
      target?.getItem(`${PROBE_HISTORY_STORAGE_PREFIX}${appId}`) ?? null,
    );
  } catch {
    return {};
  }
}

export function saveModelsProbeHistory(
  appId: AppId,
  history: ModelsProbeById,
  storage?: Pick<Storage, "setItem">,
) {
  try {
    const target = storage ?? globalThis.localStorage;
    target?.setItem(
      `${PROBE_HISTORY_STORAGE_PREFIX}${appId}`,
      JSON.stringify(history),
    );
  } catch {
    // The in-memory result remains available when storage is unavailable.
  }
}

function mergeProbeHistory(
  previous: ModelsProbeById,
  updates: ModelsProbeById,
): ModelsProbeById {
  return { ...previous, ...updates };
}

/**
 * 一键拉取：批量探测当前 app 下所有可探测供应商的 /models。
 * - 顶部按钮：汇总进度 + 结果色
 * - 每张卡片：边框色 + Codex「获取」按钮色（按 providerId）
 * - 另提供 probeProviders：导入/新建后对指定供应商做静默单条/少量探测
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
  const [probeHistoryById, setProbeHistoryById] = useState<ModelsProbeById>(
    () => readModelsProbeHistory(appId),
  );
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runIdRef = useRef(0);
  const providersRef = useRef(providers);
  providersRef.current = providers;

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
    setProbeHistoryById(readModelsProbeHistory(appId));
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
              modelIds: [],
            },
          };
        }
        const modelIds = models
          .map((model) => model.id)
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
          .slice(0, MAX_STORED_MODEL_IDS);
        return {
          id: provider.id,
          entry: {
            status: "success",
            at: Date.now(),
            modelCount: models.length,
            modelIds,
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

  const commitPartialHistory = useCallback(
    (entries: ModelsProbeById) => {
      setProbeHistoryById((prev) => {
        const next = mergeProbeHistory(prev, entries);
        saveModelsProbeHistory(appId, next);
        return next;
      });
    },
    [appId],
  );

  /**
   * Probe one or more providers without replacing the whole-list history.
   * Used after import/create. Quiet mode skips batch toasts.
   */
  const probeProviders = useCallback(
    async (
      providerIds: string[],
      options?: { quiet?: boolean },
    ): Promise<ModelsProbeById> => {
      const quiet = options?.quiet ?? true;
      const uniqueIds = Array.from(
        new Set(providerIds.filter((id) => typeof id === "string" && id)),
      );
      if (uniqueIds.length === 0) return {};

      const list = uniqueIds
        .map((id) => providersRef.current[id])
        .filter((provider): provider is Provider => Boolean(provider));
      if (list.length === 0) return {};

      const runId = ++runIdRef.current;
      clearClearTimer();
      setIsFetching(true);

      const initial: ModelsProbeById = {};
      for (const provider of list) {
        const resolved = resolveProviderModelsProbeTarget(provider, appId);
        initial[provider.id] = resolved.ok
          ? { status: "probing", at: Date.now() }
          : {
              status: "skipped",
              at: Date.now(),
              reason: resolved.reason,
            };
      }
      setProbeById((prev) => ({ ...prev, ...initial }));
      setProbeResult({
        status: "probing",
        providerId: list.length === 1 ? list[0]?.id ?? null : null,
        at: Date.now(),
        totalCount: list.length,
        successCount: 0,
        emptyCount: 0,
        failedCount: 0,
        skippedCount: Object.values(initial).filter((e) => e.status === "skipped")
          .length,
      });

      const probeable = list.filter((p) => initial[p.id]?.status === "probing");
      const results = new Map<string, ModelsProbeEntry>();

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
            setProbeById((prev) => ({ ...prev, [id]: entry }));
          }
        },
      );

      const completed: ModelsProbeById = {};
      try {
        await Promise.all(workers);
        if (runIdRef.current !== runId) return {};

        for (const provider of list) {
          const entry = results.get(provider.id) ?? initial[provider.id];
          completed[provider.id] =
            entry && isCompletedProbeStatus(entry.status)
              ? entry
              : { status: "failed", at: Date.now() };
        }
        commitPartialHistory(completed);

        let successCount = 0;
        let emptyCount = 0;
        let failedCount = 0;
        let totalModels = 0;
        for (const entry of Object.values(completed)) {
          if (entry.status === "success") {
            successCount += 1;
            totalModels += entry.modelCount ?? 0;
          } else if (entry.status === "empty") {
            emptyCount += 1;
          } else if (entry.status === "failed") {
            failedCount += 1;
          }
        }

        const summary: ModelsProbeStatus =
          successCount > 0
            ? "success"
            : emptyCount > 0
              ? "empty"
              : failedCount > 0
                ? "failed"
                : "skipped";

        setProbeResult({
          status: summary,
          providerId: list.length === 1 ? list[0]?.id ?? null : null,
          at: Date.now(),
          modelCount: totalModels,
          successCount,
          emptyCount,
          failedCount,
          skippedCount: list.length - probeable.length,
          totalCount: list.length,
        });
        scheduleAutoClear();

        if (!quiet && probeable.length > 0) {
          toast.success(
            t("provider.fetchModelsBatchDone", {
              success: successCount,
              empty: emptyCount,
              failed: failedCount,
              skipped: list.length - probeable.length,
              models: totalModels,
              defaultValue: `探测完成：可用 ${successCount} · 无模型 ${emptyCount} · 失败 ${failedCount} · 跳过 ${list.length - probeable.length}`,
            }),
          );
        }
        return completed;
      } catch (err) {
        if (runIdRef.current !== runId) return {};
        console.warn("[FetchProviderModels] partial probe failed", err);
        for (const provider of list) {
          const entry = results.get(provider.id) ?? initial[provider.id];
          completed[provider.id] =
            entry && isCompletedProbeStatus(entry.status)
              ? entry
              : { status: "failed", at: Date.now() };
        }
        if (Object.keys(completed).length > 0) {
          commitPartialHistory(completed);
        }
        setProbeResult({
          status: "failed",
          providerId: list.length === 1 ? list[0]?.id ?? null : null,
          at: Date.now(),
          totalCount: list.length,
        });
        scheduleAutoClear();
        if (!quiet) {
          showFetchModelsError(err, t);
        }
        return completed;
      } finally {
        if (runIdRef.current === runId) {
          setIsFetching(false);
        }
      }
    },
    [
      appId,
      clearClearTimer,
      commitPartialHistory,
      probeOne,
      scheduleAutoClear,
      t,
    ],
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

    const commitProbeHistory = () => {
      const completed: ModelsProbeById = {};
      for (const provider of list) {
        const entry = results.get(provider.id) ?? initial[provider.id];
        completed[provider.id] =
          entry && isCompletedProbeStatus(entry.status)
            ? entry
            : { status: "failed", at: Date.now() };
      }
      setProbeHistoryById(completed);
      saveModelsProbeHistory(appId, completed);
    };

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
      commitProbeHistory();

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
              "卡片边框约 60 秒后复位；右上角状态保留到下次手动拉取",
          }),
          closeButton: true,
        },
      );
    } catch (err) {
      if (runIdRef.current !== runId) return;
      console.warn("[FetchProviderModels] batch failed", err);
      const counts = recount();
      commitProbeHistory();
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

  /**
   * 单卡手动「获取」完成后写入瞬时色 + 持久 history（含 modelIds）。
   * 与批量探测共用同一 localStorage 键，保证行内按钮色重启仍保留。
   */
  const recordProviderProbeResult = useCallback(
    (
      providerId: string,
      entry: {
        status: ModelsProbeStatus;
        at?: number | null;
        modelCount?: number;
        modelIds?: string[];
        reason?: string;
      },
    ) => {
      if (!providerId) return;
      const nextEntry: ModelsProbeEntry = {
        status: entry.status,
        at: entry.at ?? Date.now(),
        ...(typeof entry.modelCount === "number"
          ? { modelCount: entry.modelCount }
          : {}),
        ...(entry.modelIds ? { modelIds: entry.modelIds } : {}),
        ...(entry.reason ? { reason: entry.reason } : {}),
      };
      setProbeById((prev) => ({ ...prev, [providerId]: nextEntry }));
      if (isCompletedProbeStatus(nextEntry.status)) {
        commitPartialHistory({ [providerId]: nextEntry });
      }
    },
    [commitPartialHistory],
  );

  return {
    isFetching,
    fetchCurrentProviderModels,
    probeProviders,
    recordProviderProbeResult,
    probeResult,
    probeById,
    probeHistoryById,
  };
}
