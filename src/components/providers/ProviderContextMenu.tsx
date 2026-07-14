import {
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import type { AppId } from "@/lib/api/types";
import type { Provider, VisibleApps } from "@/types";
import { APP_ICON_MAP } from "@/config/appConfig";
import { getCopyTargetApps } from "@/utils/copyProviderToApp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ProviderContextMenuProps {
  provider: Provider;
  appId: AppId;
  visibleApps?: VisibleApps;
  onDuplicate: (provider: Provider) => void;
  onCopyToApp: (provider: Provider, targetApp: AppId) => void;
  children: ReactNode;
  className?: string;
}

/**
 * Right-click context menu for a provider card.
 * Offers "Duplicate" (same app) and "Copy to <other app>" options.
 */
export function ProviderContextMenu({
  provider,
  appId,
  visibleApps,
  onDuplicate,
  onCopyToApp,
  children,
  className,
}: ProviderContextMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const targetApps = useMemo(
    () => getCopyTargetApps(appId, visibleApps),
    [appId, visibleApps],
  );

  const handleContextMenu = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "input, textarea, select, [contenteditable='true'], [role='menu'], [data-no-provider-context-menu]",
      )
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setPosition({ x: event.clientX, y: event.clientY });
    setOpen(true);
  };

  const anchorStyle: CSSProperties = {
    position: "fixed",
    left: position.x,
    top: position.y,
    width: 1,
    height: 1,
    padding: 0,
    margin: 0,
    border: "none",
    opacity: 0,
    pointerEvents: "none",
  };

  return (
    <div className={cn(className)} onContextMenu={handleContextMenu}>
      {children}

      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <span style={anchorStyle} aria-hidden tabIndex={-1} />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          className="min-w-[12rem]"
          side="bottom"
          align="start"
          sideOffset={4}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground truncate max-w-[16rem]">
            {provider.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => {
              onDuplicate(provider);
            }}
          >
            <Copy className="h-4 w-4" />
            {t("provider.duplicate")}
          </DropdownMenuItem>

          {targetApps.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Copy className="h-4 w-4" />
                <span>
                  {t("provider.copyToApp", {
                    defaultValue: "复制到…",
                  })}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="min-w-[11rem]">
                  {targetApps.map((target) => {
                    const appMeta = APP_ICON_MAP[target];
                    return (
                      <DropdownMenuItem
                        key={target}
                        onSelect={() => {
                          onCopyToApp(provider, target);
                        }}
                      >
                        <span className="inline-flex h-4 w-4 items-center justify-center shrink-0">
                          {appMeta?.icon}
                        </span>
                        {t("provider.copyToAppTarget", {
                          app: t(`apps.${target}`, {
                            defaultValue: appMeta?.label ?? target,
                          }),
                          defaultValue: `复制到 ${appMeta?.label ?? target}`,
                        })}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
