import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { providersApi, type AppId } from "@/lib/api";
import type { Provider } from "@/types";
import { convertProviderToApp } from "@/utils/copyProviderToApp";
import { extractErrorMessage } from "@/utils/errorUtils";
import { generateUUID } from "@/utils/uuid";
import { openclawKeys } from "@/hooks/useOpenClaw";
import { hermesKeys, invalidateHermesProviderCaches } from "@/hooks/useHermes";
import { injectCodingPlanUsageScript } from "@/config/codingPlanProviders";
import { nextProviderSortIndex } from "@/utils/providerSort";

/**
 * Copy a provider from the current app into another app's provider list,
 * converting settingsConfig into the destination format.
 */
export function useCopyProviderToApp(sourceApp: AppId) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useCallback(
    async (provider: Provider, targetApp: AppId) => {
      if (targetApp === sourceApp) return;

      try {
        const targetProviders = await providersApi.getAll(targetApp);
        let liveIds: string[] = [];

        if (
          targetApp === "opencode" ||
          targetApp === "openclaw" ||
          targetApp === "hermes"
        ) {
          try {
            liveIds =
              targetApp === "opencode"
                ? await providersApi.getOpenCodeLiveProviderIds()
                : targetApp === "openclaw"
                  ? await providersApi.getOpenClawLiveProviderIds()
                  : await providersApi.getHermesLiveProviderIds();
          } catch (error) {
            console.error(
              "[copyProviderToApp] Failed to load live provider IDs",
              error,
            );
            toast.error(
              t("provider.copyToAppLiveIdsLoadFailed", {
                defaultValue:
                  "读取目标应用配置中的供应商标识失败，请先修复配置后再试",
              }),
            );
            return;
          }
        }

        const existingKeys = Array.from(
          new Set([...Object.keys(targetProviders), ...liveIds]),
        );

        const converted = convertProviderToApp(provider, sourceApp, targetApp, {
          existingTargetKeys: existingKeys,
        });

        const isAdditive =
          targetApp === "opencode" ||
          targetApp === "openclaw" ||
          targetApp === "hermes";

        let id: string;
        if (isAdditive) {
          if (!converted.providerKey) {
            throw new Error(`Provider key is required for ${targetApp}`);
          }
          id = converted.providerKey;
        } else {
          id = generateUUID();
        }

        // Append to the end of the destination list (sortIndex first, then createdAt).
        const sortIndex = nextProviderSortIndex(Object.values(targetProviders));

        const newProvider: Provider = {
          name: converted.name,
          settingsConfig: converted.settingsConfig,
          websiteUrl: converted.websiteUrl,
          category: converted.category,
          notes: converted.notes,
          meta: converted.meta,
          icon: converted.icon,
          iconColor: converted.iconColor,
          id,
          createdAt: Date.now(),
          sortIndex,
        };

        const enhanced = injectCodingPlanUsageScript(targetApp, newProvider);

        await providersApi.add(
          enhanced as Provider,
          targetApp,
          converted.addToLive,
        );

        await queryClient.invalidateQueries({
          queryKey: ["providers", targetApp],
        });
        await queryClient.invalidateQueries({ queryKey: ["providers"] });

        if (targetApp === "opencode") {
          await queryClient.invalidateQueries({
            queryKey: ["opencodeLiveProviderIds"],
          });
        } else if (targetApp === "openclaw") {
          await queryClient.invalidateQueries({
            queryKey: openclawKeys.liveProviderIds,
          });
        } else if (targetApp === "hermes") {
          await invalidateHermesProviderCaches(queryClient);
          await queryClient.invalidateQueries({
            queryKey: hermesKeys.liveProviderIds,
          });
        }

        try {
          await providersApi.updateTrayMenu();
        } catch (error) {
          console.error(
            "[copyProviderToApp] Failed to update tray menu",
            error,
          );
        }

        const appName = t(`apps.${targetApp}`, {
          defaultValue: targetApp,
        });
        toast.success(
          t("provider.copiedToApp", {
            app: appName,
            defaultValue: `已复制到 ${appName}`,
          }),
        );
      } catch (error) {
        console.error("[copyProviderToApp] Failed", error);
        const detail = extractErrorMessage(error);
        toast.error(
          t("provider.copyToAppFailed", {
            defaultValue: "复制到其他应用失败",
          }) + (detail ? `: ${detail}` : ""),
        );
      }
    },
    [sourceApp, queryClient, t],
  );
}
