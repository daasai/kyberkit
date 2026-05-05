import DOMPurify from "dompurify";
import { marked } from "marked";
import Papa from "papaparse";

export function RunContextPane({
  context,
}: {
  context?: { phase: string; nextStep: string; touchedFiles: string[]; toolSummary: string };
}) {
  return (
    <div className="space-y-3 rounded-md border border-border-default bg-bg-panel p-3">
      <div className="text-sm font-semibold">运行上下文</div>
      <div className="text-xs text-fg-secondary">阶段: {context?.phase ?? "tooling"}</div>
      <div className="text-xs text-fg-secondary">下一步: {context?.nextStep ?? "生成周报草稿并等待你审阅"}</div>
      <div className="text-xs text-fg-secondary">
        已触达文件: {context?.touchedFiles.length ? context.touchedFiles.join(", ") : "暂无"}
      </div>
      <div className="text-xs text-fg-secondary">工具摘要: {context?.toolSummary ?? "read_file x2, report.generate x1"}</div>
    </div>
  );
}

export function PreviewPane({
  artifact,
  context,
}: {
  artifact: { mimeType: string; name: string; content: string } | null;
  context?: { phase: string; nextStep: string; touchedFiles: string[]; toolSummary: string };
}) {
  if (!artifact) return <RunContextPane context={context} />;
  if (artifact.mimeType === "text/markdown") {
    const html = DOMPurify.sanitize(marked.parse(artifact.content) as string);
    return (
      <section className="rounded-md border border-border-default bg-bg-panel p-3">
        <h3 className="mb-2 text-sm font-semibold">{artifact.name}</h3>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: markdown preview is sanitized by DOMPurify before render */}
        <article className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    );
  }
  if (artifact.mimeType === "text/html") {
    return (
      <section className="rounded-md border border-border-default bg-bg-panel p-3">
        <h3 className="mb-2 text-sm font-semibold">{artifact.name}</h3>
        <iframe
          className="h-[420px] w-full rounded border border-border-default"
          title={artifact.name}
          sandbox="allow-same-origin"
          srcDoc={artifact.content}
        />
      </section>
    );
  }
  const parsed = Papa.parse<string[]>(artifact.content.trim(), { skipEmptyLines: true });
  return (
    <section className="rounded-md border border-border-default bg-bg-panel p-3">
      <h3 className="mb-2 text-sm font-semibold">{artifact.name}</h3>
      <div className="max-h-[420px] overflow-auto rounded border border-border-default">
        <table className="w-full text-left text-xs">
          <tbody>
            {parsed.data.slice(0, 200).map((row, index) => (
              <tr key={`${index}-${row[0] ?? "row"}`} className="border-b border-border-default">
                {row.map((cell) => (
                  <td key={cell} className="px-2 py-1">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {parsed.data.length > 200 ? <p className="mt-2 text-xs text-warning">文件过大，仅预览前 200 行。</p> : null}
    </section>
  );
}
