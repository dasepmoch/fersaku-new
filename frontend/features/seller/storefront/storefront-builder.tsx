"use client";

import Link from "next/link";
import {
  Check,
  Eye,
  Globe2,
  LayoutGrid,
  List,
  Monitor,
  Palette,
  Redo2,
  Save,
  Settings2,
  Smartphone,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getStorefrontBuilderPreviewProducts } from "@/features/catalog/api";
import { useSellerProducts } from "@/features/catalog/hooks";
import { createIdempotencyKey } from "@/shared/query/mutation-policy";
import { useCurrentStore } from "@/shared/seller/current-store";
import { getDomainSource } from "@/shared/data/domain-source";
import { storefrontTemplates as templates } from "./config";
import { isSellerStorefrontApiDomain } from "./api";
import { readStorefrontDraft, writeStorefrontDraft } from "./draft";
import {
  pushHistory,
  redoState,
  reorderSectionsList,
  undoState,
} from "./history";
import {
  usePublishStorefrontMutation,
  useSaveStorefrontDraftMutation,
  useStorefrontStudio,
} from "./hooks";
import {
  formatStudioStatusLine,
  isStorefrontRevisionConflict,
  parseStorefrontConflict,
} from "./mappers";
import { BrandPanel } from "./panels/brand-panel";
import { LayoutPanel } from "./panels/layout-panel";
import { LinksPanel } from "./panels/links-panel";
import { SectionsPanel } from "./panels/sections-panel";
import { TemplatePanel } from "./panels/template-panel";
import { StorePreview } from "./preview/store-preview";
import type { BuilderConfig, BuilderTab } from "./types";
import type { LogoStyle } from "./contracts";
import { IMPERSONATION_COMMANDS } from "@/features/admin/impersonation/policy";
import {
  isImpersonationSessionActive,
  readImpersonationSession,
} from "@/features/admin/impersonation/session";
import { appendClientAuditEvent } from "@/features/admin/data/client-audit";

const tabs: Array<{ label: BuilderTab; icon: typeof Palette }> = [
  { label: "Templates", icon: Sparkles },
  { label: "Brand", icon: Palette },
  { label: "Layout", icon: LayoutGrid },
  { label: "Sections", icon: List },
  { label: "Links & SEO", icon: Globe2 },
];

const AUTOSAVE_MS = 800;

function sellerCatalogIsApi(): boolean {
  try {
    return getDomainSource("sellerCatalog") === "api";
  } catch {
    return false;
  }
}

export function StorefrontBuilder() {
  const apiMode = sellerCatalogIsApi() && isSellerStorefrontApiDomain();
  const { storeId: contextStoreId, bootstrap } = useCurrentStore();
  const storeId = apiMode
    ? (contextStoreId ?? "")
    : (contextStoreId ?? "store_demo_asep");

  const localDraft = useMemo(() => readStorefrontDraft(), []);
  const studioQuery = useStorefrontStudio(apiMode ? storeId : null);
  const productsQuery = useSellerProducts(apiMode ? storeId : "");
  const previewProducts = useMemo(() => {
    if (apiMode) return productsQuery.data ?? [];
    return getStorefrontBuilderPreviewProducts();
  }, [apiMode, productsQuery.data]);

  const [config, setConfig] = useState(localDraft.config);
  const [history, setHistory] = useState<BuilderConfig[]>([]);
  const [future, setFuture] = useState<BuilderConfig[]>([]);
  const [tab, setTab] = useState<BuilderTab>("Templates");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saved, setSaved] = useState(false);
  const [logoStyle, setLogoStyle] = useState<LogoStyle>(localDraft.logoStyle);
  const [revision, setRevision] = useState(14);
  const [etag, setEtag] = useState('W/"mock_storefront_draft_14"');
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() =>
    apiMode ? null : Date.now(),
  );
  const [hydrated, setHydrated] = useState(!apiMode);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveAbort = useRef<AbortController | null>(null);
  const revisionRef = useRef(revision);
  const etagRef = useRef(etag);
  const configRef = useRef(config);
  const logoStyleRef = useRef(logoStyle);
  const hydratedFromServer = useRef(false);

  useEffect(() => {
    revisionRef.current = revision;
    etagRef.current = etag;
    configRef.current = config;
    logoStyleRef.current = logoStyle;
  }, [revision, etag, config, logoStyle]);

  const saveMutation = useSaveStorefrontDraftMutation(storeId);
  const publishMutation = usePublishStorefrontMutation(storeId);
  const saveDraft = saveMutation.mutateAsync;
  const isSaving = saveMutation.isPending;

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveAbort.current?.abort();
    },
    [],
  );

  // Hydrate from server studio once per store (API mode).
  useEffect(() => {
    if (!apiMode || !storeId || !studioQuery.data) return;
    if (hydratedFromServer.current) return;
    const studio = studioQuery.data;
    hydratedFromServer.current = true;
    setConfig(studio.config);
    setLogoStyle(studio.logoStyle);
    setRevision(studio.draftRevision);
    setEtag(studio.draftETag);
    setHistory([]);
    setFuture([]);
    setDirty(false);
    setConflict(false);
    setHydrated(true);
    setLastSavedAt(Date.now());
  }, [apiMode, storeId, studioQuery.data]);

  // Reset hydrate flag when store changes.
  useEffect(() => {
    hydratedFromServer.current = false;
    queueMicrotask(() => {
      setHydrated(!apiMode);
    });
  }, [storeId, apiMode]);

  const commit = useCallback((next: BuilderConfig) => {
    setHistory((items) => pushHistory(items, configRef.current));
    setFuture([]);
    setConfig(next);
    setDirty(true);
    setConflict(false);
    setSaved(false);
  }, []);

  const update = (patch: Partial<BuilderConfig>) => {
    commit({ ...config, ...patch });
  };

  const setLogoStyleTracked = (next: LogoStyle) => {
    setLogoStyle(next);
    setDirty(true);
    setConflict(false);
    setSaved(false);
  };

  const undo = () => {
    const next = undoState(history, config, future);
    if (!next) return;
    setFuture(next.future);
    setConfig(next.config);
    setHistory(next.history);
    setDirty(true);
    setConflict(false);
  };
  const redo = () => {
    const next = redoState(history, config, future);
    if (!next) return;
    setHistory(next.history);
    setConfig(next.config);
    setFuture(next.future);
    setDirty(true);
    setConflict(false);
  };
  const applyTemplate = (template: (typeof templates)[number]) => {
    update({ ...template.config, template: template.name });
  };
  const reorderSections = (from: number, to: number) => {
    const sections = reorderSectionsList(config.sections, from, to);
    if (!sections) return;
    update({ sections });
  };
  const moveSection = (index: number, direction: number) => {
    reorderSections(index, index + direction);
  };
  const visibleSections = useMemo(
    () => config.sections.filter((item) => item.visible),
    [config.sections],
  );

  const persistMockDraft = useCallback(
    (nextConfig: BuilderConfig, nextLogo: LogoStyle) => {
      writeStorefrontDraft(nextConfig, nextLogo);
      setLastSavedAt(Date.now());
      setDirty(false);
    },
    [],
  );

  // Debounced autosave — mock writes localStorage; API PUT draft with revision.
  useEffect(() => {
    if (!dirty || !hydrated) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    autosaveTimer.current = setTimeout(() => {
      const nextConfig = configRef.current;
      const nextLogo = logoStyleRef.current;

      if (!apiMode) {
        persistMockDraft(nextConfig, nextLogo);
        return;
      }
      if (!storeId) return;

      autosaveAbort.current?.abort();
      const controller = new AbortController();
      autosaveAbort.current = controller;

      void saveDraft({
        storeId,
        config: nextConfig,
        logoStyle: nextLogo,
        expectedRevision: revisionRef.current,
        expectedETag: etagRef.current,
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          setRevision(result.revision);
          setEtag(result.etag);
          setDirty(false);
          setConflict(false);
          setLastSavedAt(Date.now());
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (isStorefrontRevisionConflict(error)) {
            const details = parseStorefrontConflict(error);
            setConflict(true);
            if (details?.currentRevision != null) {
              setRevision(details.currentRevision);
            }
            if (details?.currentETag) {
              setEtag(details.currentETag);
            }
            // Keep local draft (config) — do not overwrite with server.
            return;
          }
          // Network/other: retain in-memory edits; leave dirty true.
        });
    }, AUTOSAVE_MS);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [
    dirty,
    hydrated,
    apiMode,
    storeId,
    config,
    logoStyle,
    persistMockDraft,
    saveDraft,
  ]);

  const publishStorefront = async () => {
    const impersonationSession = readImpersonationSession();
    if (
      impersonationSession &&
      (!isImpersonationSessionActive(impersonationSession) ||
        impersonationSession.scope !== "support-write")
    ) {
      setSaved(false);
      return;
    }
    const supportSession =
      impersonationSession?.scope === "support-write"
        ? impersonationSession
        : null;
    const baseConfig = supportSession
      ? {
          ...config,
          name: config.name,
          bio: config.bio,
        }
      : config;
    // Support-write: only name/bio from current; other fields stay as last loaded draft baseline.
    const publishConfig = supportSession
      ? {
          ...(apiMode && studioQuery.data
            ? studioQuery.data.config
            : localDraft.config),
          name: config.name,
          bio: config.bio,
        }
      : baseConfig;
    const publishLogoStyle = supportSession
      ? apiMode && studioQuery.data
        ? studioQuery.data.logoStyle
        : localDraft.logoStyle
      : logoStyle;

    setSaved(false);
    setConflict(false);

    try {
      if (apiMode) {
        if (!storeId) return;
        // Flush pending draft first so publish hits matching revision.
        if (dirty) {
          const flushed = await saveDraft({
            storeId,
            config: publishConfig,
            logoStyle: publishLogoStyle,
            expectedRevision: revisionRef.current,
            expectedETag: etagRef.current,
          });
          setRevision(flushed.revision);
          setEtag(flushed.etag);
          revisionRef.current = flushed.revision;
          etagRef.current = flushed.etag;
          setDirty(false);
        }

        const result = await publishMutation.mutateAsync({
          storeId,
          config: publishConfig,
          logoStyle: publishLogoStyle,
          expectedRevision: revisionRef.current,
          expectedETag: etagRef.current,
          reason: supportSession?.reason ?? "seller_storefront_publish",
          idempotencyKey: createIdempotencyKey(),
        });
        if (!result.accepted) {
          setSaved(false);
          return;
        }
        // After publish BE creates next draft shell at revision+1 — refetch studio.
        const refreshed = await studioQuery.refetch();
        if (refreshed.data) {
          setRevision(refreshed.data.draftRevision);
          setEtag(refreshed.data.draftETag);
          revisionRef.current = refreshed.data.draftRevision;
          etagRef.current = refreshed.data.draftETag;
        } else if (result.etag) {
          setEtag(result.etag);
        }
      } else {
        await publishMutation.mutateAsync({
          storeId: storeId || "store_demo_asep",
          config: publishConfig,
          logoStyle: publishLogoStyle,
          expectedRevision: revision,
          expectedETag: etag,
          reason: supportSession?.reason ?? "seller_storefront_publish",
          idempotencyKey: createIdempotencyKey(),
        });
        if (!writeStorefrontDraft(publishConfig, publishLogoStyle)) {
          throw new Error("Unable to persist storefront draft");
        }
      }

      if (supportSession) {
        appendClientAuditEvent({
          actor: supportSession.actor,
          action: IMPERSONATION_COMMANDS.storePresentationSupportUpdate,
          target: supportSession.targetId,
          ip: "mock-admin-session",
          result: "Success",
          context: supportSession.reason,
        });
        setConfig(publishConfig);
        setLogoStyle(publishLogoStyle);
        setHistory([]);
        setFuture([]);
      }
      setSaved(true);
      setDirty(false);
      setLastSavedAt(Date.now());
      const timer = setTimeout(() => setSaved(false), 1800);
      timers.current.push(timer);
    } catch (error) {
      setSaved(false);
      if (isStorefrontRevisionConflict(error)) {
        const details = parseStorefrontConflict(error);
        setConflict(true);
        if (details?.currentRevision != null) {
          setRevision(details.currentRevision);
        }
        if (details?.currentETag) {
          setEtag(details.currentETag);
        }
      }
    }
  };

  const statusLine = formatStudioStatusLine({
    revision,
    savedAt: lastSavedAt,
    conflict,
    saving: isSaving,
    dirty,
  });

  const storeSlug = bootstrap?.stores?.find((s) => s.storeId === storeId)?.slug;
  const liveHref = storeSlug ? `/@${storeSlug}` : "/@asep-ai-tools";

  return (
    <div className="-mt-2">
      <div className="hairline shadow-card mb-4 flex flex-col gap-3 rounded-[22px] border bg-[#fbfaf7] p-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-xl bg-[#d7ff64] text-[#173f2c]">
            <Settings2 className="size-4" />
          </span>
          <div className="min-w-0">
            <b className="block truncate text-xs">Storefront Studio</b>
            <span className="text-[8px] text-[#718078]">{statusLine}</span>
          </div>
        </div>
        <div className="flex overflow-x-auto lg:ml-4">
          {tabs.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              data-impersonation-safe="true"
              onClick={() => setTab(label)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-[9px] font-extrabold",
                tab === label ? "bg-[#173f2c] text-white" : "text-[#718078]",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label="Undo perubahan"
            onClick={undo}
            disabled={!history.length}
            className="hairline grid size-10 place-items-center rounded-xl border bg-white disabled:opacity-30"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Redo perubahan"
            onClick={redo}
            disabled={!future.length}
            className="hairline grid size-10 place-items-center rounded-xl border bg-white disabled:opacity-30"
          >
            <Redo2 className="size-4" />
          </button>
          <Link
            href={liveHref}
            className="hairline hidden h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[9px] font-bold sm:flex"
          >
            <Eye className="size-3.5" /> Live store
          </Link>
          <button
            type="button"
            disabled={publishMutation.isPending || saveMutation.isPending}
            data-impersonation-command={
              IMPERSONATION_COMMANDS.storePresentationSupportUpdate
            }
            data-impersonation-fields="name,description"
            onClick={() => void publishStorefront()}
            className="flex h-10 items-center gap-2 rounded-xl bg-[#173f2c] px-4 text-[9px] font-extrabold text-white"
          >
            {saved ? <Check className="size-4" /> : <Save className="size-4" />}
            {saved ? "Published" : "Publish"}
          </button>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(420px,560px)_minmax(0,1fr)]">
        <section className="hairline shadow-card rounded-[22px] border bg-[#fbfaf7] p-5 sm:p-6">
          {tab === "Templates" && (
            <TemplatePanel config={config} applyTemplate={applyTemplate} />
          )}
          {tab === "Brand" && (
            <BrandPanel
              config={config}
              update={update}
              logoStyle={logoStyle}
              setLogoStyle={setLogoStyleTracked}
            />
          )}
          {tab === "Layout" && <LayoutPanel config={config} update={update} />}
          {tab === "Sections" && (
            <SectionsPanel
              config={config}
              update={update}
              moveSection={moveSection}
              reorderSections={reorderSections}
              products={previewProducts}
            />
          )}
          {tab === "Links & SEO" && (
            <LinksPanel config={config} update={update} />
          )}
        </section>

        <aside className="min-w-0">
          <div className="hairline shadow-card sticky top-24 rounded-[22px] border bg-[#e7e9e4] p-3">
            <div className="mb-3 flex items-center px-2">
              <div>
                <b className="block text-[10px]">Live preview</b>
                <span className="text-[8px] text-[#718078]">
                  Every control updates this canvas instantly
                </span>
              </div>
              <div className="hairline ml-auto flex rounded-xl border bg-white p-1">
                <button
                  type="button"
                  aria-label="Preview desktop"
                  onClick={() => setDevice("desktop")}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg",
                    device === "desktop" && "bg-[#e9ff9b] text-[#173f2c]",
                  )}
                >
                  <Monitor className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Preview mobile"
                  onClick={() => setDevice("mobile")}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg",
                    device === "mobile" && "bg-[#e9ff9b] text-[#173f2c]",
                  )}
                >
                  <Smartphone className="size-4" />
                </button>
              </div>
            </div>
            <div
              className={cn(
                "mx-auto overflow-hidden border border-black/10 bg-white shadow-2xl transition-all duration-500",
                device === "mobile"
                  ? "max-w-[330px] rounded-[32px] border-[8px] border-[#17231d]"
                  : "w-full rounded-[18px]",
              )}
            >
              <StorePreview
                config={config}
                device={device}
                logoStyle={logoStyle}
                visibleSections={visibleSections}
                products={previewProducts}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
