"use client";

// ChemAI: one picture of the Library, opened - a photo asked about (with the text read off it),
// a structure Iris drew, or a graph at full size - and the way back to its chat.

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { loadLibrary, saveLibrary } from "@/lib/graph-studio/store";
import { deleteMedia } from "@/lib/library/media";
import { useL, useLocale } from "@/mobile/i18n";
import OverlayPage from "./OverlayPage";
import { CopyIcon, NewChatIcon, TrashIcon } from "./icons";
import { shortDate } from "./PageHeader";
import { IRIS } from "./theme";
import type { LibraryMedia } from "./useLibrary";

const ChartRenderer = dynamic(() => import("@/components/graph-studio/charts/ChartRenderer"), { ssr: false });

export default function MediaViewer({ media, onClose }: { media: LibraryMedia; onClose: () => void }) {
  const l = useL();
  const language = useLocale().startsWith("en") ? "en" : "tr";
  const router = useRouter();
  const [showText, setShowText] = useState(false);
  const title = media.kind === "graph" ? media.graph.title : media.item.title;
  const conversationId = media.kind === "graph" ? null : media.item.conversationId ?? null;

  const remove = () => {
    if (media.kind === "graph") {
      saveLibrary(loadLibrary().filter((graph) => graph.id !== media.graph.id));
      window.dispatchEvent(new Event("chemai:library"));
    } else {
      void deleteMedia(media.item.id);
    }
    onClose();
  };

  const menu = [
    ...(conversationId
      ? [
          {
            label: l("Sohbeti aç", "Open the chat"),
            icon: <NewChatIcon size={20} />,
            onSelect: () => {
              onClose();
              router.push(media.kind !== "graph" && media.item.notebookId ? `/dashboard/notebook/?id=${media.item.notebookId}&c=${conversationId}` : `/dashboard/?c=${conversationId}`);
            },
          },
        ]
      : []),
    ...(media.kind === "molecule" && media.item.smiles
      ? [
          {
            label: l("SMILES'ı kopyala", "Copy SMILES"),
            icon: <CopyIcon size={20} />,
            onSelect: () => void navigator.clipboard.writeText(media.item.smiles ?? "").catch(() => undefined),
          },
        ]
      : []),
    { label: l("Sil", "Delete"), icon: <TrashIcon size={20} />, danger: true, onSelect: remove },
  ];

  return (
    <OverlayPage title={title || l("Medya", "Media")} onClose={onClose} menu={menu} dark={media.kind === "photo"}>
      {media.kind === "photo" && (
        <div className="flex min-h-full flex-col">
          <div className="grid flex-1 place-items-center px-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
            <img src={media.item.thumb} alt="" className="max-h-[70vh] w-full rounded-[18px] object-contain" />
          </div>
          <div className="px-5 pb-[calc(var(--app-safe-bottom)+20px)] pt-3">
            <p className="text-[14px] text-white/60">{shortDate(media.date, language)}</p>
            {media.item.text && (
              <>
                <button type="button" onClick={() => setShowText((value) => !value)} className="mt-2 text-[15px] font-medium text-white/85 underline underline-offset-4">
                  {showText ? l("Okunan metni gizle", "Hide the text read") : l("Fotoğraftan okunan metin", "Text read from the photo")}
                </button>
                {showText && <p className="mt-2 whitespace-pre-wrap text-[14px] leading-5 text-white/80">{media.item.text}</p>}
              </>
            )}
          </div>
        </div>
      )}

      {media.kind === "molecule" && (
        <div className="px-4 pb-8 pt-2">
          <div
            className="grid place-items-center rounded-[24px] bg-white p-5 shadow-[0_0_0_0.5px_rgb(0_0_0/0.05)] [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-[360px]"
            dangerouslySetInnerHTML={{ __html: media.item.svg ?? "" }}
          />
          <div className="mt-3 rounded-[24px] bg-white px-5 py-4 shadow-[0_0_0_0.5px_rgb(0_0_0/0.05)]">
            {media.item.formula && <p className="text-[20px] font-medium text-[#0B0B0C]">{media.item.formula}</p>}
            {media.item.smiles && (
              <p className="mt-1 break-all font-mono text-[13px] leading-5" style={{ color: IRIS.sub }}>
                {media.item.smiles}
              </p>
            )}
            <p className="mt-2 text-[14px]" style={{ color: IRIS.sub }}>
              {l("RDKit ile cihazda çizildi", "Drawn on the device with RDKit")} · {shortDate(media.date, language)}
            </p>
          </div>
        </div>
      )}

      {media.kind === "graph" && (
        <div className="pb-8 pt-2">
          <div className="mx-4 overflow-x-auto rounded-[24px] bg-white p-3 shadow-[0_0_0_0.5px_rgb(0_0_0/0.05)]">
            <div className="w-[720px]">
              <ChartRenderer spec={media.graph} height={420} />
            </div>
          </div>
          {media.graph.description && (
            <p className="mx-5 mt-3 text-[15px] leading-[22px]" style={{ color: IRIS.sub }}>
              {media.graph.description}
            </p>
          )}
        </div>
      )}
    </OverlayPage>
  );
}
