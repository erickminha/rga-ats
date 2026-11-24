import type { RgaImportReport as Report } from '@/lib/rga-import';

export function RgaImportReport({ report }: { report: Report }) {
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([
          ['total', 'Linhas lidas'], ['created', 'Novos'], ['updated', 'Atualizados ou vinculados'],
          ['duplicates', 'Duplicados ou sem alteração'], ['errors', 'Erros'],
        ] as const).map(([key, label]) => <div key={key} className="min-w-0 rounded-field bg-muted p-3">
          <dt className="break-words text-xs text-ink-2">{label}</dt>
          <dd className="mt-1 text-xl font-medium tabular-nums">{report[key].toLocaleString('pt-BR')}</dd>
        </div>)}
      </dl>
      {report.errors > 0 ? (
        <section aria-label="Linhas que precisam de revisão" className="grid gap-2">
          <p className="text-sm">Corrija as linhas com erro e envie uma nova prévia.</p>
          {report.issues.length < report.errors ? <p className="text-xs text-ink-2">Mostrando os primeiros {report.issues.length} erros.</p> : null}
          <ul className="max-h-64 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-ink-2">
            {report.issues.map((issue) => <li key={issue.row}>Linha lida {issue.row} — {issue.message}</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
