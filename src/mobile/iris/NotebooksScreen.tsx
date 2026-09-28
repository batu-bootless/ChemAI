"use client";

// ChemAI: "Tüm not defterleri" - every notebook with its way of working, sources and chats, and
// the notebook's own menu (pin, rename, delete).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { refreshHistory, useHistory } from "@/lib/ai/historyStore";
import { MODE_INFO, deleteNotebook, notebookIdOf, updateNotebook, useNotebooks, type Notebook } from "@/lib/notebooks/store";
import { useL, useLocale } from "@/mobile/i18n";
import CircleButton from "./CircleButton";
import { MoreIcon, NotebookIcon, PencilIcon, PinIcon, PlusIcon, TrashIcon } from "./icons";
import { ConfirmDialog, PromptDialog } from "./NotebookDialogs";
import { GlassMenu } from "./OverlayPage";
import PageHeader, { shortDate } from "./PageHeader";
import { IRIS } from "./theme";

export default function NotebooksScreen() {
  const l = useL();
  const language = useLocale().startsWith("en") ? "en" : "tr";
  const router = useRouter();
  const notebooks = useNotebooks();
  const history = useHistory();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Notebook | null>(null);
  const [deleting, setDeleting] = useState<Notebook | null>(null);

  useEffect(() => {
    void refreshHistory();
  }, []);

  const chats = (id: string) => history.conversations.filter((conversation) => notebookIdOf(conversation.surface) === id).length;

  return (
    <main className="iris-ui flex min-h-[var(--app-content-h)] flex-col pb-[calc(var(--app-safe-bottom)+24px)]" style={{ background: IRIS.bg }}>
      <PageHeader
        title={l("Not defterleri", "Notebooks")}
        right={
          <CircleButton label={l("Yeni not defteri", "New notebook")} onClick={() => router.push("/dashboard/notebooks/new/")}>
            <PlusIcon size={24} />
          </CircleButton>
        }
      />

      <div className="mt-4">
        {notebooks.length === 0 && (
          <div className="mx-4 rounded-[22px] px-5 py-5" style={{ background: IRIS.row }}>
            <NotebookIcon size={24} />
            <p className="mt-2 text-[17px] font-medium text-[#0B0B0C]">{l("Henüz not defterin yok", "No notebooks yet")}</p>
            <p className="mt-1 text-[15px] leading-5" style={{ color: IRIS.sub }}>
              {l(
                "Bir proje, ders ya da deney için not defteri aç: sohbetlerin, kaynakların ve İris'e talimatların bir arada durur.",
                "Open a notebook for a project, a course or an experiment: its chats, sources and your instructions to Iris stay together."
              )}
            </p>
            <button type="button" onClick={() => router.push("/dashboard/notebooks/new/")} className="mt-4 h-11 rounded-full bg-[#1F1F1F] px-5 text-[16px] font-medium text-white">
              {l("Yeni not defteri", "New notebook")}
            </button>
          </div>
        )}
        {notebooks.map((notebook) => (
          <div key={notebook.id} className="relative">
            <div className="mx-2 flex items-center rounded-[22px] active:bg-[#F2F0F1]">
              <button type="button" onClick={() => router.push(`/dashboard/notebook/?id=${notebook.id}`)} className="flex min-w-0 flex-1 items-center gap-[13px] py-[11px] pl-[13px] text-left">
                <NotebookIcon size={24} className="shrink-0 text-[#0B0B0C]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[17px] leading-[22px] text-[#0B0B0C]">{notebook.title}</span>
                    {notebook.pinned && <PinIcon size={15} className="shrink-0" style={{ color: IRIS.sub }} />}
                  </span>
                  <span className="block truncate text-[14px] leading-5" style={{ color: IRIS.sub }}>
                    {[
                      language === "tr" ? MODE_INFO[notebook.mode].tr : MODE_INFO[notebook.mode].en,
                      notebook.sources.length ? l(`${notebook.sources.length} kaynak`, `${notebook.sources.length} sources`) : "",
                      chats(notebook.id) ? l(`${chats(notebook.id)} sohbet`, `${chats(notebook.id)} chats`) : "",
                      shortDate(notebook.updatedAt, language),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuFor(menuFor === notebook.id ? null : notebook.id)}
                  aria-label={l("Not defteri menüsü", "Notebook menu")}
                  className="grid size-11 place-items-center rounded-full text-[#0B0B0C]"
                >
                  <MoreIcon size={22} />
                </button>
                <AnimatePresence>
                  {menuFor === notebook.id && (
                    <GlassMenu
                      onClose={() => setMenuFor(null)}
                      items={[
                        {
                          label: notebook.pinned ? l("Sabitlemeyi kaldır", "Unpin") : l("Sabitle", "Pin"),
                          icon: <PinIcon size={20} />,
                          onSelect: () => updateNotebook(notebook.id, { pinned: !notebook.pinned }, false),
                        },
                        { label: l("Yeniden adlandır", "Rename"), icon: <PencilIcon size={20} />, onSelect: () => setRenaming(notebook) },
                        { label: l("Sil", "Delete"), icon: <TrashIcon size={20} />, danger: true, onSelect: () => setDeleting(notebook) },
                      ]}
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        ))}
      </div>

      {renaming && (
        <PromptDialog
          title={l("Yeniden adlandır", "Rename")}
          initial={renaming.title}
          placeholder={l("Not defterinin adı", "Notebook name")}
          max={90}
          onSave={(title) => updateNotebook(renaming.id, { title: title.trim() || renaming.title }, false)}
          onClose={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={l("Not defteri silinsin mi?", "Delete notebook?")}
          text={l(
            "Not defteri, kaynakları ve talimatları bu cihazdan silinir. Sohbetleri geçmişinde kalır.",
            "The notebook, its sources and instructions are removed from this device. Its chats stay in your history."
          )}
          confirmLabel={l("Sil", "Delete")}
          onConfirm={() => deleteNotebook(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </main>
  );
}
