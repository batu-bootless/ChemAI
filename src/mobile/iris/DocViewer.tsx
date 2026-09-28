"use client";

// ChemAI: one document of the Library, opened - a lab report with its PDF, a note, a protocol
// (with a run button), or the chemical inventory with its storage warnings.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { saveReportPdf } from "@/lib/agent/actions";
import { chemicalById } from "@/lib/safety/chemicals";
import { findConflicts, expiryState } from "@/lib/inventory/store";
import { INCOMPATIBILITY_LABELS } from "@/lib/safety/chemicals";
import { reportSections } from "@/components/lab-notebook/notebook-core";
import { KIND_LABEL, deleteDocument, noteText, readInventory, readNote, readProtocol, readReport, type LibraryDocument } from "@/lib/library/documents";
import { runOrder } from "@/lib/protocols/model";
import { useL, useLocale } from "@/mobile/i18n";
import OverlayPage from "./OverlayPage";
import { CopyIcon, DownloadIcon, NewChatIcon, PlayIcon, TrashIcon, WarningIcon } from "./icons";
import { shortDate } from "./PageHeader";
import { IRIS } from "./theme";

function Lines({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-[16px] leading-[24px] text-[#1F1F22]">
      {text.split("\n").map((line, index) => {
        if (!line.trim()) return <div key={index} className="h-2" />;
        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        if (heading) return <p key={index} className="pt-2 text-[18px] font-medium text-[#0B0B0C]">{heading[2]}</p>;
        const bullet = line.match(/^(-|\d+\.)\s+(.*)$/);
        if (bullet)
          return (
            <p key={index} className="flex gap-2 pl-1">
              <span className="shrink-0" style={{ color: IRIS.sub }}>
                {bullet[1] === "-" ? "•" : bullet[1]}
              </span>
              <span>{bullet[2]}</span>
            </p>
          );
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}

function Paper({ children }: { children: React.ReactNode }) {
  return <div className="mx-4 rounded-[24px] bg-white px-5 py-5 shadow-[0_0_0_0.5px_rgb(0_0_0/0.05)]">{children}</div>;
}

export default function DocViewer({ doc, onClose }: { doc: LibraryDocument; onClose: () => void }) {
  const l = useL();
  const language = useLocale().startsWith("en") ? "en" : "tr";
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pdf, setPdf] = useState<"idle" | "busy" | "saved" | "failed">("idle");
  const [copied, setCopied] = useState(false);

  const report = useMemo(() => (doc.kind === "report" ? readReport(doc.id) : null), [doc]);
  const note = useMemo(() => (doc.kind === "note" ? readNote(doc.id) : null), [doc]);
  const protocol = useMemo(() => (doc.kind === "protocol" ? readProtocol(doc.id, language) : null), [doc, language]);
  const inventory = useMemo(() => (doc.kind === "inventory" ? readInventory() : []), [doc]);

  const text = useMemo(() => {
    if (report) return reportSections(report).map(([heading, body]) => `# ${heading}\n${body}`).join("\n\n");
    if (note) return noteText(note);
    if (protocol)
      return [
        protocol.description,
        protocol.materials.length ? `${l("Malzemeler", "Materials")}: ${protocol.materials.join(", ")}` : "",
        ...runOrder(protocol).map((step, index) => `${index + 1}. ${step.title}${step.description && step.description !== step.title ? ` — ${step.description}` : ""}`),
      ]
        .filter(Boolean)
        .join("\n");
    if (inventory.length) return inventory.map((item) => `- ${item.name}: ${item.amount} ${item.unit}${item.location ? ` · ${item.location}` : ""}`).join("\n");
    return "";
  }, [report, note, protocol, inventory, l]);

  const runProtocol = () => {
    if (!protocol) return;
    onClose();
    router.push(`/dashboard/protocols/?protocol=${encodeURIComponent(protocol.id)}&run=1`);
  };

  const askAbout = () => {
    const excerpt = text.slice(0, 1500);
    const question = l(
      `"${doc.title}" (${KIND_LABEL[doc.kind][0].toLocaleLowerCase("tr")}) hakkında konuşalım. İçeriği:\n${excerpt}`,
      `Let's talk about "${doc.title}" (${KIND_LABEL[doc.kind][1].toLowerCase()}). Its content:\n${excerpt}`
    );
    onClose();
    router.push(`/dashboard/?q=${encodeURIComponent(question)}`);
  };

  const menu = [
    ...(report
      ? [
          {
            label: l("PDF olarak indir", "Save as PDF"),
            icon: <DownloadIcon size={20} />,
            onSelect: async () => {
              setPdf("busy");
              try {
                setPdf((await saveReportPdf(report.id)) ? "saved" : "failed");
              } catch {
                setPdf("failed");
              }
            },
          },
        ]
      : []),
    ...(protocol ? [{ label: l("Protokolü çalıştır", "Run the protocol"), icon: <PlayIcon size={20} />, onSelect: () => runProtocol() }] : []),
    {
      label: copied ? l("Kopyalandı", "Copied") : l("Metni kopyala", "Copy the text"),
      icon: <CopyIcon size={20} />,
      onSelect: async () => {
        try {
          await navigator.clipboard.writeText(`${doc.title}\n\n${text}`);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          // clipboard refused
        }
      },
    },
    { label: l("İris'e sor", "Ask Iris about it"), icon: <NewChatIcon size={20} />, onSelect: askAbout },
    { label: l("Sil", "Delete"), icon: <TrashIcon size={20} />, danger: true, onSelect: () => setConfirm(true) },
  ];

  const conflicts = doc.kind === "inventory" ? findConflicts(inventory) : [];

  return (
    <>
      <OverlayPage
        title={doc.title}
        onClose={onClose}
        menu={menu}
        footer={
          protocol ? (
            <button type="button" onClick={() => runProtocol()} className="flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[#1F1F1F] text-[17px] font-medium text-white active:scale-[0.99]">
              <PlayIcon size={20} />
              {l("Protokolü çalıştır", "Run the protocol")}
            </button>
          ) : report ? (
            <button
              type="button"
              disabled={pdf === "busy"}
              onClick={async () => {
                setPdf("busy");
                try {
                  setPdf((await saveReportPdf(report.id)) ? "saved" : "failed");
                } catch {
                  setPdf("failed");
                }
              }}
              className="flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[#1F1F1F] text-[17px] font-medium text-white active:scale-[0.99] disabled:opacity-70"
            >
              {pdf === "busy" ? <Loader2 className="size-5 animate-spin" /> : <DownloadIcon size={20} />}
              {pdf === "saved" ? l("PDF indirildi · tekrar indir", "PDF saved · save again") : pdf === "failed" ? l("PDF oluşturulamadı, tekrar dene", "Couldn't make the PDF, retry") : l("PDF olarak indir", "Save as PDF")}
            </button>
          ) : undefined
        }
      >
        <div className="pb-6 pt-2">
          <p className="mb-3 px-5 text-[14px]" style={{ color: IRIS.sub }}>
            {l(...KIND_LABEL[doc.kind])} · {shortDate(doc.date, language)}
          </p>

          {confirm && (
            <div className="mx-4 mb-3 flex items-center gap-3 rounded-[20px] bg-[#FFF1EF] px-4 py-3">
              <p className="min-w-0 flex-1 text-[15px] text-[#5E1F16]">{l("Bu belge silinsin mi? Geri alınamaz.", "Delete this document? This can't be undone.")}</p>
              <button type="button" onClick={() => setConfirm(false)} className="rounded-full bg-white px-3 py-1.5 text-[14px] font-medium">
                {l("Vazgeç", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteDocument(doc, language);
                  onClose();
                }}
                className="rounded-full bg-[#D7263D] px-3 py-1.5 text-[14px] font-medium text-white"
              >
                {l("Sil", "Delete")}
              </button>
            </div>
          )}

          {report && (
            <Paper>
              <div className="space-y-4">
                {reportSections(report).map(([heading, body]) => (
                  <section key={heading}>
                    <h3 className="text-[13px] font-medium uppercase tracking-[0.06em]" style={{ color: IRIS.sub }}>
                      {heading}
                    </h3>
                    <p className="mt-1 whitespace-pre-line text-[16px] leading-[24px] text-[#1F1F22]">{body}</p>
                  </section>
                ))}
              </div>
            </Paper>
          )}

          {note && (
            <Paper>
              <Lines text={noteText(note)} />
            </Paper>
          )}

          {protocol && (
            <Paper>
              {protocol.description && <p className="mb-3 text-[16px] leading-[24px] text-[#1F1F22]">{protocol.description}</p>}
              {protocol.materials.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {protocol.materials.map((item) => (
                    <span key={item} className="rounded-full px-3 py-1 text-[14px]" style={{ background: IRIS.row }}>
                      {item}
                    </span>
                  ))}
                </div>
              )}
              <ol className="space-y-3">
                {runOrder(protocol).map((step, index) => (
                  <li key={step.id} className="flex gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-medium" style={{ background: IRIS.row }}>
                      {index + 1}
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <span className="block text-[16px] font-medium leading-[22px] text-[#0B0B0C]">{step.title}</span>
                      {step.description && step.description !== step.title && (
                        <span className="mt-0.5 block whitespace-pre-line text-[15px] leading-[22px]" style={{ color: IRIS.sub }}>
                          {step.description}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </Paper>
          )}

          {doc.kind === "inventory" && (
            <>
              {conflicts.length > 0 && (
                <div className="mx-4 mb-3 rounded-[20px] bg-[#FFF4E5] px-4 py-3">
                  {conflicts.map((conflict) => (
                    <p key={`${conflict.a.id}-${conflict.b.id}`} className="flex gap-2 text-[14.5px] leading-5 text-[#6B3A00]">
                      <WarningIcon size={18} className="mt-px shrink-0" />
                      <span>
                        {l(
                          `${conflict.a.name} ile ${conflict.b.name} aynı yerde (${conflict.location}): ${conflict.tags.map((tag) => INCOMPATIBILITY_LABELS[tag].tr).join(", ")}.`,
                          `${conflict.a.name} and ${conflict.b.name} share ${conflict.location}: ${conflict.tags.map((tag) => INCOMPATIBILITY_LABELS[tag].en).join(", ")}.`
                        )}
                      </span>
                    </p>
                  ))}
                </div>
              )}
              <div className="mx-4 overflow-hidden rounded-[24px] bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.05)]">
                {inventory.map((item, index) => {
                  const card = item.chemicalId ? chemicalById(item.chemicalId) : undefined;
                  const expiry = expiryState(item);
                  return (
                    <div key={item.id} className={`px-5 py-3 ${index ? "border-t" : ""}`} style={{ borderColor: IRIS.separator }}>
                      <p className="text-[16px] font-medium text-[#0B0B0C]">{item.name}</p>
                      <p className="text-[14px] leading-5" style={{ color: IRIS.sub }}>
                        {[`${item.amount || "—"} ${item.unit}`, item.location, item.expiry && `${l("SKT", "Exp.")} ${item.expiry}`, card && (language === "tr" ? card.nameTr : card.name)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {expiry === "expired" && <p className="mt-0.5 text-[13px] font-medium text-[#D7263D]">{l("Son kullanma tarihi geçmiş", "Expired")}</p>}
                      {expiry === "soon" && <p className="mt-0.5 text-[13px] font-medium text-[#A15C00]">{l("Son kullanma tarihi yaklaşıyor", "Expires soon")}</p>}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!report && !note && !protocol && doc.kind !== "inventory" && (
            <p className="px-5 text-[15px]" style={{ color: IRIS.sub }}>
              {l("Bu belge artık yok.", "This document no longer exists.")}
            </p>
          )}
        </div>
      </OverlayPage>
    </>
  );
}
