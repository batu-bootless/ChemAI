"use client";

// ChemAI: "Protokoller" - the protocols Iris wrote and the ready-made ones, in Iris's (Gemini)
// style. ?protocol=<id> opens one; &run=1 (a chat card's "Protokolü çalıştır") starts its run.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { newProtocol, readProtocols, readRunState, removeProtocol, runOrder, saveProtocol, type Protocol } from "@/lib/protocols/model";
import { PROTOCOLS as TEMPLATES } from "@/lib/protocols/data";
import { useL, useLocale } from "@/mobile/i18n";
import CircleButton from "../CircleButton";
import { PlusIcon, ProtocolIcon } from "../icons";
import { PromptDialog } from "../NotebookDialogs";
import PageHeader, { shortDate } from "../PageHeader";
import { IRIS } from "../theme";
import ProtocolView from "./ProtocolView";

const TEMPLATE_IDS = new Set(TEMPLATES.map((template) => template.id));

function progressOf(protocol: Protocol) {
  const run = readRunState(protocol.id);
  const order = runOrder(protocol);
  const done = order.filter((step) => run.done.includes(step.id)).length;
  return { done, total: order.length, running: run.activeSince !== null, started: run.startedAt !== null || done > 0 };
}

function ProtocolRow({ protocol, onOpen }: { protocol: Protocol; onOpen: () => void }) {
  const l = useL();
  const language = useLocale().startsWith("en") ? "en" : "tr";
  const progress = progressOf(protocol);
  const finished = progress.total > 0 && progress.done === progress.total;
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3.5 rounded-[20px] px-4 py-3.5 text-left transition active:brightness-95" style={{ background: IRIS.row }}>
      <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-white text-[22px]">{protocol.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[17px] leading-[21px] text-[#0B0B0C]">{protocol.title}</span>
        <span className="mt-1 block text-[14px] leading-5" style={{ color: IRIS.sub }}>
          {finished
            ? l("Tamamlandı", "Complete")
            : progress.started
              ? l(`${progress.done} / ${progress.total} adım${progress.running ? " · çalışıyor" : ""}`, `${progress.done} of ${progress.total} steps${progress.running ? " · running" : ""}`)
              : l(`${progress.total} adım`, `${progress.total} steps`)}
          {" · "}
          {shortDate(protocol.updatedAt, language)}
        </span>
        {progress.started && !finished && progress.total > 0 && (
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white">
            <span className="block h-full rounded-full" style={{ width: `${(progress.done / progress.total) * 100}%`, background: IRIS.blue }} />
          </span>
        )}
      </span>
    </button>
  );
}

export default function ProtocolsScreen() {
  const l = useL();
  const language = useLocale().startsWith("en") ? "en" : "tr";
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("protocol");
  const autoRun = params.get("run") === "1";
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setProtocols(readProtocols(language));
    setLoaded(true);
  }, [language, openId]);

  if (!loaded) return <main className="min-h-[var(--app-content-h)]" style={{ background: IRIS.bg }} />;

  const open = openId ? protocols.find((protocol) => protocol.id === openId) ?? null : null;

  if (openId && open) {
    return (
      <ProtocolView
        key={open.id}
        protocol={open}
        autoRun={autoRun}
        onChange={(next) => setProtocols(saveProtocol(next, language))}
        onBack={() => (window.history.length > 1 ? router.back() : router.replace("/dashboard/protocols/"))}
        onDelete={() => {
          setProtocols(removeProtocol(open.id, language));
          router.replace("/dashboard/protocols/");
        }}
      />
    );
  }

  const mine = protocols.filter((protocol) => !TEMPLATE_IDS.has(protocol.id));
  const ready = protocols.filter((protocol) => TEMPLATE_IDS.has(protocol.id));
  const inProgress = protocols.filter((protocol) => {
    const progress = progressOf(protocol);
    return progress.started && progress.done < progress.total;
  });
  const openProtocol = (id: string) => router.push(`/dashboard/protocols/?protocol=${encodeURIComponent(id)}`);

  return (
    <main className="iris-ui flex min-h-[var(--app-content-h)] flex-col pb-[calc(var(--app-safe-bottom)+24px)]" style={{ background: IRIS.bg }}>
      <PageHeader
        title={l("Protokoller", "Protocols")}
        right={
          <CircleButton label={l("Yeni protokol", "New protocol")} onClick={() => setCreating(true)}>
            <PlusIcon size={24} />
          </CircleButton>
        }
      />

      {openId && !open && protocols.length > 0 && (
        <p className="mx-4 mt-4 rounded-[20px] px-5 py-4 text-[15px]" style={{ background: IRIS.row, color: IRIS.sub }}>
          {l("Bu protokol bu cihazda yok.", "This protocol isn't on this device.")}
        </p>
      )}

      {inProgress.length > 0 && (
        <section className="mt-[29px]">
          <h2 className="pl-4 text-[18px] font-medium leading-6 text-[#0B0B0C]">{l("Devam edenler", "In progress")}</h2>
          <div className="mt-3 space-y-2 px-4">
            {inProgress.map((protocol) => (
              <ProtocolRow key={protocol.id} protocol={protocol} onOpen={() => router.push(`/dashboard/protocols/?protocol=${encodeURIComponent(protocol.id)}&run=1`)} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-[29px]">
        <h2 className="pl-4 text-[18px] font-medium leading-6 text-[#0B0B0C]">{l("İris'in hazırladıkları", "Made with Iris")}</h2>
        <div className="mt-3 space-y-2 px-4">
          {mine.map((protocol) => (
            <ProtocolRow key={protocol.id} protocol={protocol} onOpen={() => openProtocol(protocol.id)} />
          ))}
          {mine.length === 0 && (
            <div className="rounded-[20px] px-5 py-4" style={{ background: IRIS.row }}>
              <ProtocolIcon size={24} />
              <p className="mt-2 text-[15px] leading-5" style={{ color: IRIS.sub }}>
                {l(
                  "İris'e \"0,1 M NaCl hazırlama protokolü oluştur\" de; protokol burada durur ve adım adım çalıştırılır.",
                  "Tell Iris \"make a protocol for 0.1 M NaCl\"; it lands here and runs step by step."
                )}
              </p>
            </div>
          )}
        </div>
      </section>

      {ready.length > 0 && (
        <section className="mt-[29px]">
          <h2 className="pl-4 text-[18px] font-medium leading-6 text-[#0B0B0C]">{l("Hazır protokoller", "Ready-made")}</h2>
          <div className="mt-3 space-y-2 px-4">
            {ready.map((protocol) => (
              <ProtocolRow key={protocol.id} protocol={protocol} onOpen={() => openProtocol(protocol.id)} />
            ))}
          </div>
        </section>
      )}

      {creating && (
        <PromptDialog
          title={l("Yeni protokol", "New protocol")}
          initial=""
          placeholder={l("Protokol adı", "Protocol name")}
          max={90}
          confirmLabel={l("Oluştur", "Create")}
          onSave={(title) => {
            const protocol = newProtocol(title.trim() || l("Yeni protokol", "New protocol"));
            setProtocols(saveProtocol(protocol, language));
            openProtocol(protocol.id);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </main>
  );
}
