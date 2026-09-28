"use client";

// ChemAI: "Kitaplık", laid out as the Gemini app's Library (the user's reference screenshot):
// "Belgeler" with a round ">" to all of them and the two newest as cards, then "Medya içerikleri"
// as a three-column grid. The contents are Iris's own: the reports, notes, protocols and inventory
// it wrote, and the photos asked about, the structures and the graphs it drew.

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { KIND_LABEL, type LibraryDocument } from "@/lib/library/documents";
import { useL, useLocale } from "@/mobile/i18n";
import CircleButton from "./CircleButton";
import DocViewer from "./DocViewer";
import MediaViewer from "./MediaViewer";
import { ChartIcon, ChevronRightIcon, DocumentIcon, HexagonIcon, NewChatIcon } from "./icons";
import PageHeader, { shortDate } from "./PageHeader";
import { IRIS } from "./theme";
import { useLibrary, type LibraryMedia } from "./useLibrary";

const ChartRenderer = dynamic(() => import("@/components/graph-studio/charts/ChartRenderer"), { ssr: false });

export function DocumentCard({ doc, onOpen }: { doc: LibraryDocument; onOpen: () => void }) {
  const l = useL();
  const language = useLocale().startsWith("en") ? "en" : "tr";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-[19px] rounded-[20px] pb-[14px] pl-[24px] pr-5 pt-[13px] text-left transition active:brightness-95"
      style={{ background: IRIS.row }}
    >
      <DocumentIcon size={24} className="mt-[-2px] shrink-0 text-[#0B0B0C]" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[17px] leading-[20px] text-[#0B0B0C]">{doc.title}</span>
        <span className="mt-[5px] block text-[15px] leading-5" style={{ color: IRIS.sub }}>
          {l(...KIND_LABEL[doc.kind])} · {shortDate(doc.date, language)}
        </span>
      </span>
    </button>
  );
}

export function MediaTile({ media, onOpen }: { media: LibraryMedia; onOpen: () => void }) {
  const l = useL();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative aspect-square overflow-hidden bg-white text-left"
      aria-label={media.kind === "graph" ? media.graph.title : media.item.title}
    >
      {media.kind === "photo" && media.item.thumb && (
        // eslint-disable-next-line @next/next/no-img-element -- a local preview
        <img src={media.item.thumb} alt="" className="size-full object-cover" />
      )}
      {media.kind === "molecule" && media.item.svg && (
        <span
          className="grid size-full place-items-center bg-white p-2 [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: media.item.svg }}
        />
      )}
      {media.kind === "graph" && (
        <span className="pointer-events-none block size-full bg-white [&_svg]:max-w-full">
          <ChartRenderer spec={{ ...media.graph, title: "" }} height={118} />
        </span>
      )}
      {media.kind !== "photo" && (
        <span
          className="absolute bottom-[7px] left-[7px] grid size-[30px] place-items-center rounded-full bg-white/75 text-[#0B0B0C] backdrop-blur-sm"
          aria-label={media.kind === "graph" ? l("Grafik", "Graph") : l("Yapı", "Structure")}
        >
          {media.kind === "graph" ? <ChartIcon size={17} /> : <HexagonIcon size={17} />}
        </span>
      )}
    </button>
  );
}

export default function LibraryScreen() {
  const l = useL();
  const router = useRouter();
  const { documents, media, ready } = useLibrary();
  const [doc, setDoc] = useState<LibraryDocument | null>(null);
  const [picture, setPicture] = useState<LibraryMedia | null>(null);

  return (
    <main className="iris-ui flex min-h-[var(--app-content-h)] flex-col pb-[calc(var(--app-safe-bottom)+24px)]" style={{ background: IRIS.bg }}>
      <PageHeader
        title={l("Kitaplık", "Library")}
        right={
          <CircleButton label={l("Yeni sohbet", "New chat")} onClick={() => router.push("/dashboard/?new=1")}>
            <NewChatIcon size={24} />
          </CircleButton>
        }
      />

      <section className="mt-[29px]">
        <div className="flex h-10 items-center justify-between pl-4 pr-[21px]">
          <h2 className="text-[18px] font-medium text-[#0B0B0C]">{l("Belgeler", "Documents")}</h2>
          <button
            type="button"
            onClick={() => router.push("/dashboard/documents/")}
            aria-label={l("Tüm belgeler", "All documents")}
            className="grid size-10 place-items-center rounded-full text-[#0B0B0C] active:brightness-95"
            style={{ background: IRIS.row }}
          >
            <ChevronRightIcon size={18} strokeWidth={2.6} />
          </button>
        </div>
        <div className="mt-3 space-y-2 px-4">
          {documents.slice(0, 2).map((item) => (
            <DocumentCard key={item.key} doc={item} onOpen={() => setDoc(item)} />
          ))}
          {ready && documents.length === 0 && (
            <p className="rounded-[20px] px-5 py-4 text-[15px] leading-5" style={{ background: IRIS.row, color: IRIS.sub }}>
              {l(
                "İris'in senin için yazdığı raporlar, notlar, protokoller ve envanter burada durur. \"Deney raporu hazırla\" ya da \"şunu not al\" demen yeter.",
                "Reports, notes, protocols and the inventory Iris writes for you live here. Just say \"write a lab report\" or \"take a note\"."
              )}
            </p>
          )}
        </div>
      </section>

      <section className="mt-[29px]">
        <h2 className="pl-4 text-[18px] font-medium leading-6 text-[#0B0B0C]">{l("Medya içerikleri", "Media")}</h2>
        {media.length > 0 ? (
          <div className="mx-4 mt-[17px] grid grid-cols-3 gap-[1.5px] overflow-hidden rounded-[20px]">
            {media.map((item) => (
              <MediaTile key={item.key} media={item} onOpen={() => setPicture(item)} />
            ))}
          </div>
        ) : (
          ready && (
            <p className="mx-4 mt-[17px] rounded-[20px] px-5 py-4 text-[15px] leading-5" style={{ background: IRIS.row, color: IRIS.sub }}>
              {l(
                "İris'e sorduğun fotoğraflar, çizdiği moleküller ve grafikler burada toplanır.",
                "Photos you ask Iris about, and the molecules and graphs it draws, gather here."
              )}
            </p>
          )
        )}
      </section>

      {doc && <DocViewer doc={doc} onClose={() => setDoc(null)} />}
      {picture && <MediaViewer media={picture} onClose={() => setPicture(null)} />}
    </main>
  );
}
