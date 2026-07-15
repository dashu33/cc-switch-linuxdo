import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { DownloadCloud, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { settingsApi } from "@/lib/api";
import { useSettingsQuery } from "@/lib/query";
import type { RemoteSnapshotInfo } from "@/types";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errorUtils";

type S3ActionState =
  | "idle"
  | "fetching_upload"
  | "fetching_download"
  | "uploading"
  | "downloading";
type S3ConfirmType = "upload" | "download" | null;

function formatRemoteDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

/**
 * Toolbar quick actions for S3-compatible cloud sync upload/download.
 * Placed next to the bulk "fetch models" control on the providers view.
 */
export function S3QuickSyncButtons({ className }: { className?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings } = useSettingsQuery();

  const [actionState, setActionState] = useState<S3ActionState>("idle");
  const [confirmType, setConfirmType] = useState<S3ConfirmType>(null);
  const [remoteInfo, setRemoteInfo] = useState<RemoteSnapshotInfo | null>(null);

  const s3Config = settings?.s3Sync;
  const isBusy = actionState !== "idle";
  const hasSavedConfig = Boolean(
    s3Config?.bucket?.trim() && s3Config?.accessKeyId?.trim(),
  );
  const isEnabled = s3Config?.enabled === true;

  const ensureReady = useCallback((): boolean => {
    if (!hasSavedConfig) {
      toast.error(t("settings.s3Sync.notConfigured"));
      return false;
    }
    if (!isEnabled) {
      toast.error(t("settings.s3Sync.disabled"));
      return false;
    }
    return true;
  }, [hasSavedConfig, isEnabled, t]);

  const closeConfirm = useCallback(() => {
    setConfirmType(null);
  }, []);

  const handleUploadClick = useCallback(async () => {
    if (!ensureReady() || isBusy) return;
    setActionState("fetching_upload");
    try {
      const info = await settingsApi.s3SyncFetchRemoteInfo();
      if ("empty" in info) {
        setRemoteInfo(null);
      } else {
        setRemoteInfo(info);
      }
      setConfirmType("upload");
    } catch (error) {
      setRemoteInfo(null);
      const detail = extractErrorMessage(error);
      toast.error(
        detail
          ? `${t("settings.s3Sync.fetchRemoteFailed")} (${detail})`
          : t("settings.s3Sync.fetchRemoteFailed"),
      );
    } finally {
      setActionState("idle");
    }
  }, [ensureReady, isBusy, t]);

  const handleDownloadClick = useCallback(async () => {
    if (!ensureReady() || isBusy) return;
    setActionState("fetching_download");
    try {
      const info = await settingsApi.s3SyncFetchRemoteInfo();
      if ("empty" in info) {
        toast.info(t("settings.s3Sync.noRemoteData"));
        return;
      }
      if (!info.compatible) {
        toast.error(
          t("settings.s3Sync.incompatibleVersion", {
            version: info.version,
          }),
        );
        return;
      }
      setRemoteInfo(info);
      setConfirmType("download");
    } catch (error) {
      toast.error(
        t("settings.s3Sync.downloadFailed", {
          error: extractErrorMessage(error) || String(error),
        }),
      );
    } finally {
      setActionState("idle");
    }
  }, [ensureReady, isBusy, t]);

  const handleUploadConfirm = useCallback(async () => {
    closeConfirm();
    setActionState("uploading");
    try {
      await settingsApi.s3SyncUpload();
      toast.success(t("settings.s3Sync.uploadSuccess"));
      await queryClient.invalidateQueries();
    } catch (error) {
      toast.error(
        t("settings.s3Sync.uploadFailed", {
          error: extractErrorMessage(error) || String(error),
        }),
      );
    } finally {
      setActionState("idle");
    }
  }, [closeConfirm, queryClient, t]);

  const handleDownloadConfirm = useCallback(async () => {
    closeConfirm();
    setActionState("downloading");
    try {
      await settingsApi.s3SyncDownload();
      toast.success(t("settings.s3Sync.downloadSuccess"));
      await queryClient.invalidateQueries();
    } catch (error) {
      toast.error(
        t("settings.s3Sync.downloadFailed", {
          error: extractErrorMessage(error) || String(error),
        }),
      );
    } finally {
      setActionState("idle");
    }
  }, [closeConfirm, queryClient, t]);

  const uploadMessage = useMemo(() => {
    const lines = [
      t("settings.s3Sync.confirmUpload.content"),
      `• ${t("settings.s3Sync.confirmUpload.dbItem")}`,
      `• ${t("settings.s3Sync.confirmUpload.skillsItem")}`,
    ];
    if (remoteInfo) {
      lines.push(
        "",
        t("settings.s3Sync.confirmUpload.existingData"),
        `${t("settings.s3Sync.confirmUpload.deviceName")}: ${remoteInfo.deviceName}`,
        `${t("settings.s3Sync.confirmUpload.createdAt")}: ${formatRemoteDate(remoteInfo.createdAt)}`,
        "",
        t("settings.s3Sync.confirmUpload.warning"),
      );
    }
    return lines.join("\n");
  }, [remoteInfo, t]);

  const downloadMessage = useMemo(() => {
    const lines: string[] = [];
    if (remoteInfo) {
      lines.push(
        `${t("settings.s3Sync.confirmDownload.deviceName")}: ${remoteInfo.deviceName}`,
        `${t("settings.s3Sync.confirmDownload.createdAt")}: ${formatRemoteDate(remoteInfo.createdAt)}`,
        `${t("settings.s3Sync.confirmDownload.artifacts")}: ${remoteInfo.artifacts.join(", ")}`,
        "",
      );
    }
    lines.push(t("settings.s3Sync.confirmDownload.warning"));
    return lines.join("\n");
  }, [remoteInfo, t]);

  const uploadTitle = t("settings.s3Sync.upload", {
    defaultValue: "上传到云端",
  });
  const downloadTitle = t("settings.s3Sync.download", {
    defaultValue: "从云端下载",
  });

  const uploadLoading =
    actionState === "fetching_upload" || actionState === "uploading";
  const downloadLoading =
    actionState === "fetching_download" || actionState === "downloading";

  return (
    <>
      <Button
        onClick={() => void handleUploadClick()}
        size="icon"
        variant="outline"
        disabled={isBusy}
        className={cn("mr-1", className)}
        title={
          uploadLoading
            ? actionState === "uploading"
              ? t("settings.s3Sync.uploading")
              : t("settings.s3Sync.fetchingRemote")
            : uploadTitle
        }
        aria-label={uploadTitle}
      >
        {uploadLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UploadCloud className="h-4 w-4" />
        )}
      </Button>
      <Button
        onClick={() => void handleDownloadClick()}
        size="icon"
        variant="outline"
        disabled={isBusy}
        className={cn("mr-1", className)}
        title={
          downloadLoading
            ? actionState === "downloading"
              ? t("settings.s3Sync.downloading")
              : t("settings.s3Sync.fetchingRemote")
            : downloadTitle
        }
        aria-label={downloadTitle}
      >
        {downloadLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <DownloadCloud className="h-4 w-4" />
        )}
      </Button>

      <ConfirmDialog
        isOpen={confirmType === "upload"}
        title={t("settings.s3Sync.confirmUpload.title")}
        message={uploadMessage}
        confirmText={t("settings.s3Sync.confirmUpload.confirm")}
        onConfirm={() => void handleUploadConfirm()}
        onCancel={closeConfirm}
      />
      <ConfirmDialog
        isOpen={confirmType === "download"}
        title={t("settings.s3Sync.confirmDownload.title")}
        message={downloadMessage}
        confirmText={t("settings.s3Sync.confirmDownload.confirm")}
        onConfirm={() => void handleDownloadConfirm()}
        onCancel={closeConfirm}
      />
    </>
  );
}
