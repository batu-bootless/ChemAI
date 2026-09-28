import type { ReactNode } from "react";

// Minimal markdown-ish renderer for AI replies — headings, bold, inline code,
// bullet/numbered lists, horizontal rules and GitHub-style tables (AI data
// analysis and report drafts frequently return tables) without a markdown lib.
// Chemical formulas come through as plain unicode (H₂SO₄) and render as-is.

function renderInline(text: string, keyBase: string, ink = false): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) nodes.push(<strong key={`${keyBase}-b${i}`} className={ink ? "font-bold text-[#111]" : undefined}>{token.slice(2, -2)}</strong>);
    else
      nodes.push(
        <code key={`${keyBase}-c${i}`} className={ink ? "rounded-md bg-[#EEEDF5] px-1.5 py-0.5 font-mono text-[0.86em] font-semibold text-[#3B2F7A]" : "rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em]"}>
          {token.slice(1, -1)}
        </code>
      );
    last = m.index + token.length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const rowCells = (l: string): string[] => l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((s) => s.trim());
const isTableRow = (l: string): boolean => l.includes("|");
const isSeparator = (l: string): boolean => isTableRow(l) && rowCells(l).every((c) => /^:?-{2,}:?$/.test(c));

/** `ink`: the AI screen's type (Iris's answers, like ChatGPT's) - calm text, soft rounded tables. */
export default function RichText({ text, ink = false }: { text: string; ink?: boolean }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{renderInline(it, `li${blocks.length}-${i}`, ink)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={`ol${blocks.length}`} className={ink ? "my-1.5 list-decimal space-y-1 pl-5 marker:font-semibold marker:text-[#8F6CF6]" : "my-1 list-decimal space-y-0.5 pl-5"}>{items}</ol>
      ) : (
        <ul key={`ul${blocks.length}`} className={ink ? "my-1.5 list-disc space-y-1 pl-5 marker:text-[#8F6CF6]" : "my-1 list-disc space-y-0.5 pl-5"}>{items}</ul>
      )
    );
    list = null;
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Table: header row + separator + body rows.
    if (isTableRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1].trim())) {
      flush();
      const header = rowCells(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && lines[i].trim() && isTableRow(lines[i].trim()) && !isSeparator(lines[i].trim())) {
        body.push(rowCells(lines[i].trim()));
        i++;
      }
      blocks.push(
        <div key={`tbl${blocks.length}`} className={ink ? "my-2.5 overflow-x-auto rounded-2xl border border-[#E4E3EC] bg-white/70" : "my-2 overflow-x-auto"}>
          <table className={ink ? "w-full border-collapse text-[12.5px]" : "w-full border-collapse text-xs"}>
            <thead>
              <tr>
                {header.map((h, hi) => (
                  <th
                    key={hi}
                    className={ink ? "border-b border-[#E4E3EC] bg-[#F4F3F9] px-3 py-2 text-left font-semibold text-[#2A2A33]" : "border border-gray-200 bg-gray-50 px-2 py-1 text-left font-semibold text-gray-700"}
                  >
                    {renderInline(h, `th${blocks.length}-${hi}`, ink)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {header.map((_, ci) => (
                    <td key={ci} className={ink ? "border-b border-[#EFEEF4] px-3 py-2 text-[#2A2A33]" : "border border-gray-100 px-2 py-1 text-gray-700"}>
                      {renderInline(r[ci] ?? "", `td${blocks.length}-${ri}-${ci}`, ink)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const hr = /^\s*([-*_]){3,}\s*$/.test(line);

    if (hr) {
      flush();
      blocks.push(<hr key={`hr${i}`} className={ink ? "my-3.5 border-t border-[#E6E5EE]" : "my-2 border-gray-100"} />);
    } else if (bullet) {
      if (!list || list.ordered) flush();
      if (!list) list = { ordered: false, items: [] };
      list.items.push(bullet[1]);
    } else if (numbered) {
      if (!list || !list.ordered) flush();
      if (!list) list = { ordered: true, items: [] };
      list.items.push(numbered[1]);
    } else if (heading) {
      flush();
      blocks.push(
        <p key={`h${i}`} className={ink ? "mt-4 text-[16px] font-bold tracking-tight text-[#111] first:mt-0" : "mt-2 font-semibold text-gray-800"}>
          {renderInline(heading[1], `h${i}`, ink)}
        </p>
      );
    } else if (line.trim() === "") {
      flush();
    } else {
      flush();
      blocks.push(<p key={`p${i}`} className={ink ? "my-1.5" : "my-1 leading-relaxed"}>{renderInline(line, `p${i}`, ink)}</p>);
    }
    i++;
  }
  flush();

  return <div className={ink ? "text-[15px] leading-[1.62] text-[#1C1C22]" : "text-sm text-gray-700"}>{blocks}</div>;
}
