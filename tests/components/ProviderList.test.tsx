import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRef, type ReactElement } from "react";
import type { Provider } from "@/types";
import { ProviderList } from "@/components/providers/ProviderList";

const useDragSortMock = vi.fn();
const useSortableMock = vi.fn();
const providerCardRenderSpy = vi.fn();

vi.mock("@/hooks/useDragSort", () => ({
  useDragSort: (...args: unknown[]) => useDragSortMock(...args),
}));

vi.mock("@/components/providers/ProviderCard", () => ({
  ProviderCard: (props: any) => {
    providerCardRenderSpy(props);
    const {
      provider,
      onSwitch,
      onEdit,
      onDelete,
      onDuplicate,
      onConfigureUsage,
    } = props;

    return (
      <div data-testid={`provider-card-${provider.id}`}>
        <button
          data-testid={`switch-${provider.id}`}
          onClick={() => onSwitch(provider)}
        >
          switch
        </button>
        <button
          data-testid={`edit-${provider.id}`}
          onClick={() => onEdit(provider)}
        >
          edit
        </button>
        <button
          data-testid={`duplicate-${provider.id}`}
          onClick={() => onDuplicate(provider)}
        >
          duplicate
        </button>
        <button
          data-testid={`usage-${provider.id}`}
          onClick={() => onConfigureUsage(provider)}
        >
          usage
        </button>
        <button
          data-testid={`delete-${provider.id}`}
          onClick={() => onDelete(provider)}
        >
          delete
        </button>
        <span data-testid={`is-current-${provider.id}`}>
          {props.isCurrent ? "current" : "inactive"}
        </span>
        <span data-testid={`drag-attr-${provider.id}`}>
          {props.dragHandleProps?.attributes?.["data-dnd-id"] ?? "none"}
        </span>
      </div>
    );
  },
}));

vi.mock("@/components/UsageFooter", () => ({
  default: () => <div data-testid="usage-footer" />,
}));

vi.mock("@dnd-kit/sortable", async () => {
  const actual = await vi.importActual<any>("@dnd-kit/sortable");

  return {
    ...actual,
    useSortable: (...args: unknown[]) => useSortableMock(...args),
  };
});

// Mock hooks that use QueryClient
vi.mock("@/hooks/useStreamCheck", () => ({
  useStreamCheck: () => ({
    checkProvider: vi.fn(),
    isChecking: () => false,
  }),
}));

vi.mock("@/lib/query/failover", () => ({
  useAutoFailoverEnabled: () => ({ data: false }),
  useFailoverQueue: () => ({ data: [] }),
  useAddToFailoverQueue: () => ({ mutate: vi.fn() }),
  useRemoveFromFailoverQueue: () => ({ mutate: vi.fn() }),
  useReorderFailoverQueue: () => ({ mutate: vi.fn() }),
}));

function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: overrides.id ?? "provider-1",
    name: overrides.name ?? "Test Provider",
    settingsConfig: overrides.settingsConfig ?? {},
    category: overrides.category,
    createdAt: overrides.createdAt,
    sortIndex: overrides.sortIndex,
    meta: overrides.meta,
    websiteUrl: overrides.websiteUrl,
  };
}

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.removeItem("cc-switch-provider-sort-mode:claude");
  useDragSortMock.mockReset();
  useSortableMock.mockReset();
  providerCardRenderSpy.mockClear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });

  useSortableMock.mockImplementation(({ id }: { id: string }) => ({
    setNodeRef: vi.fn(),
    attributes: { "data-dnd-id": id },
    listeners: { onPointerDown: vi.fn() },
    transform: null,
    transition: null,
    isDragging: false,
  }));

  useDragSortMock.mockReturnValue({
    sortedProviders: [],
    sensors: [],
    handleDragEnd: vi.fn(),
  });
});

describe("ProviderList Component", () => {
  it("should render skeleton placeholders when loading", () => {
    const { container } = renderWithQueryClient(
      <ProviderList
        providers={{}}
        currentProviderId=""
        appId="claude"
        onSwitch={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onOpenWebsite={vi.fn()}
        toolbarActions={<button>quick-action</button>}
        isLoading
      />,
    );

    const placeholders = container.querySelectorAll(
      ".border-dashed.border-muted-foreground\\/40",
    );
    expect(placeholders).toHaveLength(3);
    expect(screen.getByRole("toolbar")).toContainElement(
      screen.getByRole("button", { name: "quick-action" }),
    );
  });

  it("should show empty state and trigger create callback when no providers exist", () => {
    const handleCreate = vi.fn();
    useDragSortMock.mockReturnValueOnce({
      sortedProviders: [],
      sensors: [],
      handleDragEnd: vi.fn(),
    });

    renderWithQueryClient(
      <ProviderList
        providers={{}}
        currentProviderId=""
        appId="claude"
        onSwitch={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onOpenWebsite={vi.fn()}
        onCreate={handleCreate}
        toolbarActions={<button>quick-action</button>}
      />,
    );

    const addButton = screen.getByRole("button", {
      name: "provider.addProvider",
    });
    fireEvent.click(addButton);

    expect(handleCreate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("toolbar")).toContainElement(
      screen.getByRole("button", { name: "quick-action" }),
    );
  });

  it("should render in order returned by useDragSort and pass through action callbacks", () => {
    const providerA = createProvider({ id: "a", name: "A" });
    const providerB = createProvider({ id: "b", name: "B" });

    const handleSwitch = vi.fn();
    const handleEdit = vi.fn();
    const handleDelete = vi.fn();
    const handleDuplicate = vi.fn();
    const handleUsage = vi.fn();
    const handleOpenWebsite = vi.fn();

    useDragSortMock.mockReturnValue({
      sortedProviders: [providerB, providerA],
      sensors: [],
      handleDragEnd: vi.fn(),
    });

    renderWithQueryClient(
      <ProviderList
        providers={{ a: providerA, b: providerB }}
        currentProviderId="b"
        appId="claude"
        onSwitch={handleSwitch}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onConfigureUsage={handleUsage}
        onOpenWebsite={handleOpenWebsite}
        modelsProbeHistoryById={{
          a: { status: "failed", at: 10 },
          b: { status: "success", at: 20 },
        }}
      />,
    );

    // Verify sort order
    expect(providerCardRenderSpy).toHaveBeenCalledTimes(2);
    expect(providerCardRenderSpy.mock.calls[0][0].provider.id).toBe("b");
    expect(providerCardRenderSpy.mock.calls[1][0].provider.id).toBe("a");
    expect(providerCardRenderSpy.mock.calls[0][0].sequenceNumber).toBe(1);
    expect(providerCardRenderSpy.mock.calls[1][0].sequenceNumber).toBe(2);
    expect(
      providerCardRenderSpy.mock.calls[0][0].modelsProbeHistoryStatus,
    ).toBe("success");
    expect(
      providerCardRenderSpy.mock.calls[1][0].modelsProbeHistoryStatus,
    ).toBe("failed");

    // Verify current provider marker
    expect(providerCardRenderSpy.mock.calls[0][0].isCurrent).toBe(true);

    // Drag attributes from useSortable
    expect(
      providerCardRenderSpy.mock.calls[0][0].dragHandleProps?.attributes[
        "data-dnd-id"
      ],
    ).toBe("b");
    expect(
      providerCardRenderSpy.mock.calls[1][0].dragHandleProps?.attributes[
        "data-dnd-id"
      ],
    ).toBe("a");

    // Trigger action buttons
    fireEvent.click(screen.getByTestId("switch-b"));
    fireEvent.click(screen.getByTestId("edit-b"));
    fireEvent.click(screen.getByTestId("duplicate-b"));
    fireEvent.click(screen.getByTestId("usage-b"));
    fireEvent.click(screen.getByTestId("delete-a"));

    expect(handleSwitch).toHaveBeenCalledWith(providerB);
    expect(handleEdit).toHaveBeenCalledWith(providerB);
    expect(handleDuplicate).toHaveBeenCalledWith(providerB);
    expect(handleUsage).toHaveBeenCalledWith(providerB);
    expect(handleDelete).toHaveBeenCalledWith(providerA);

    // Verify useDragSort call parameters
    expect(useDragSortMock).toHaveBeenCalledWith(
      { a: providerA, b: providerB },
      "claude",
    );
  });

  it("filters providers with the search input", () => {
    const providerAlpha = createProvider({ id: "alpha", name: "Alpha Labs" });
    const providerBeta = createProvider({ id: "beta", name: "Beta Works" });

    useDragSortMock.mockReturnValue({
      sortedProviders: [providerAlpha, providerBeta],
      sensors: [],
      handleDragEnd: vi.fn(),
    });

    const listRef =
      createRef<
        import("@/components/providers/ProviderList").ProviderListHandle
      >();
    renderWithQueryClient(
      <ProviderList
        ref={listRef}
        providers={{ alpha: providerAlpha, beta: providerBeta }}
        currentProviderId=""
        appId="claude"
        onSwitch={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onOpenWebsite={vi.fn()}
      />,
    );

    act(() => listRef.current?.openSearch());
    const searchInput = screen.getByPlaceholderText(
      "Search name, notes, or URL...",
    );
    // Initially both providers are rendered
    expect(screen.getByTestId("provider-card-alpha")).toBeInTheDocument();
    expect(screen.getByTestId("provider-card-beta")).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "beta" } });
    expect(screen.queryByTestId("provider-card-alpha")).not.toBeInTheDocument();
    expect(screen.getByTestId("provider-card-beta")).toBeInTheDocument();
    expect(providerCardRenderSpy.mock.calls.at(-1)?.[0].sequenceNumber).toBe(2);

    fireEvent.keyDown(searchInput, { key: "Enter" });
    const latestBetaCall = [...providerCardRenderSpy.mock.calls]
      .reverse()
      .find(([props]) => props.provider.id === "beta");
    expect(latestBetaCall?.[0].scrollHighlight).toBe(true);

    act(() => listRef.current?.openSearch());
    const reopenedSearchInput = screen.getByPlaceholderText(
      "Search name, notes, or URL...",
    );

    fireEvent.change(reopenedSearchInput, { target: { value: "gamma" } });
    expect(screen.queryByTestId("provider-card-alpha")).not.toBeInTheDocument();
    expect(screen.queryByTestId("provider-card-beta")).not.toBeInTheDocument();
    expect(screen.getByText("没有符合搜索条件的供应商。")).toBeInTheDocument();
  });

  it("filters failed providers by reason and cleans the selected status", async () => {
    const auth = createProvider({ id: "auth", name: "Auth Failed" });
    const timeout = createProvider({ id: "timeout", name: "Timed Out" });
    const healthy = createProvider({ id: "healthy", name: "Healthy" });
    const handleBulkDelete = vi.fn().mockResolvedValue(undefined);

    useDragSortMock.mockReturnValue({
      sortedProviders: [auth, timeout, healthy],
      sensors: [],
      handleDragEnd: vi.fn(),
    });

    renderWithQueryClient(
      <ProviderList
        providers={{ auth, timeout, healthy }}
        currentProviderId=""
        appId="claude"
        onSwitch={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onBulkDelete={handleBulkDelete}
        onDuplicate={vi.fn()}
        onOpenWebsite={vi.fn()}
        modelsProbeHistoryById={{
          auth: { status: "failed", at: 10, reason: "auth" },
          timeout: { status: "failed", at: 11, reason: "timeout" },
          healthy: { status: "success", at: 12 },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "筛选供应商" }));
    fireEvent.click(screen.getByRole("button", { name: "失败" }));
    expect(screen.getByTestId("provider-card-auth")).toBeInTheDocument();
    expect(screen.getByTestId("provider-card-timeout")).toBeInTheDocument();
    expect(
      screen.queryByTestId("provider-card-healthy"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "鉴权失败 1" }));
    expect(screen.getByTestId("provider-card-auth")).toBeInTheDocument();
    expect(
      screen.queryByTestId("provider-card-timeout"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "一键清理此状态（1）" }),
    );
    expect(screen.getByText(/将永久删除 1 个/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认清理" }));

    await waitFor(() => expect(handleBulkDelete).toHaveBeenCalledWith([auth]));
  });

  it("persists a view sort mode and disables dragging outside custom order", () => {
    const older = createProvider({
      id: "older",
      name: "Older",
      createdAt: 100,
    });
    const newer = createProvider({
      id: "newer",
      name: "Newer",
      createdAt: 200,
    });

    useDragSortMock.mockReturnValue({
      sortedProviders: [older, newer],
      sensors: [],
      handleDragEnd: vi.fn(),
    });

    renderWithQueryClient(
      <ProviderList
        providers={{ older, newer }}
        currentProviderId=""
        appId="claude"
        onSwitch={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onOpenWebsite={vi.fn()}
      />,
    );

    providerCardRenderSpy.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: "provider.sortMode.newest" }),
    );

    expect(localStorage.getItem("cc-switch-provider-sort-mode:claude")).toBe(
      "newest",
    );
    expect(providerCardRenderSpy.mock.calls[0][0].provider.id).toBe("newer");
    expect(providerCardRenderSpy.mock.calls[0][0].sequenceNumber).toBe(1);
    expect(providerCardRenderSpy.mock.calls[0][0].isDragDisabled).toBe(true);
    expect(useSortableMock.mock.calls.at(-1)?.[0].disabled).toBe(true);
  });
});
