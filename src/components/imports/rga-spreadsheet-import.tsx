'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { runSpreadsheetAction } from '@/app/(app)/settings/import/planilha/actions';
import { columnsByKind, importKinds, mappingSuggestion, type RgaImportKind, type RgaImportReport as Report } from '@/lib/rga-import';
import { inputClass, selectClass } from '@/components/form-controls';
import { Card } from '@/components/ui/primitives';
import { buttonClass } from '@/components/ui/button';
import { RgaImportReport } from './rga-import-report';

export function RgaSpreadsheetImport() {
  const [kind, setKind] = useState<RgaImportKind>('company');
  const [attestation, setAttestation] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [headerRow, setHeaderRow] = useState('1');
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ report: Report; ticket: string } | null>(null);
  const [result, setResult] = useState<{ report: Report; id: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function clearPreview() {
    setPreview(null);
    setResult(null);
    setConfirmed(false);
    setError('');
  }

  function run(step: 'inspect' | 'preview' | 'confirm') {
    if (!file || pending) return;
    const form = new FormData();
    form.set('file', file);
    form.set('kind', kind);
    if (kind === 'consent') form.set('attestation', attestation);
    form.set('headerRow', headerRow);
    for (const [key, value] of Object.entries(mapping)) form.set('map:' + key, value);
    if (step === 'confirm' && preview && confirmed) {
      form.set('ticket', preview.ticket);
      form.set('confirmed', 'yes');
    }
    setError('');
    startTransition(async () => {
      try {
        const response = await runSpreadsheetAction(step, form);
        if (!response.ok) { setError(response.error); return; }
        if (response.step === 'inspect') {
          setHeaders(response.headers);
          setMapping(mappingSuggestion(kind, response.headers));
        } else if (response.step === 'preview') {
          setPreview(response);
          setConfirmed(false);
          setResult(null);
        } else {
          setPreview(null);
          setConfirmed(false);
          setResult(response);
        }
      } catch {
        setError('Não foi possível ler a resposta. Tente novamente ou veja o histórico de importações.');
      }
    });
  }

  return (
    <div className="grid gap-4">
      <Card className="grid gap-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Tipo de dados
            <select className={`${selectClass} min-w-0 w-full`} value={kind} disabled={pending} onChange={(event) => {
              const value = event.target.value as RgaImportKind;
              setKind(value);
              setAttestation('');
              setHeaderRow(value === 'candidate' ? '5' : '1');
              setHeaders(null);
              clearPreview();
            }}>{Object.entries(importKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label className="grid gap-1 text-sm">
            Linha do cabeçalho
            <input type="number" min="1" max="100" value={headerRow} className={inputClass} disabled={pending} onChange={(event) => {
              setHeaderRow(event.target.value);
              setHeaders(null);
              clearPreview();
            }} />
          </label>
          <label className="grid min-w-0 gap-1 text-sm sm:col-span-2">
            Arquivo CSV ou XLSX
            <input type="file" accept=".csv,.xlsx" className="max-w-full text-sm" disabled={pending} onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setHeaders(null);
              clearPreview();
            }} />
          </label>
        </div>
        <p className="text-xs text-ink-2">Use um CSV por aba. O XLSX lê a primeira aba. Limite de 4 MB, 5.000 linhas e 50 colunas.</p>
        <button type="button" className={buttonClass({ variant: 'secondary', className: 'justify-self-start' })} disabled={pending || !file} onClick={() => run('inspect')}>Identificar colunas</button>
      </Card>

      {headers ? <Card className="grid gap-4 p-5">
        <h2 className="text-md font-medium">Mapeamento de colunas</h2>
        <p className="text-sm text-ink-2">Revise as sugestões. Use IDs de origem para relacionar empresas, vagas e candidatos.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {columnsByKind[kind].map(([key, label]) => (
            <div key={key} className="grid min-w-0 gap-1 break-words text-xs font-medium">
              <label htmlFor={`coluna-${key}`}>{label}</label>
              <select id={`coluna-${key}`} className={`${selectClass} min-w-0 w-full`} disabled={pending} value={mapping[key] ?? ''} onChange={(event) => {
                setMapping((before) => ({ ...before, [key]: event.target.value }));
                clearPreview();
              }}>
                <option value="">Ignorar coluna</option>
                {headers.map((header, index) => header ? <option key={index} value={String(index)}>{index + 1}. {header}</option> : null)}
              </select>
            </div>
          ))}
        </div>
        {kind === 'consent' && <label className="grid gap-1 text-sm">
          Referência da atestação da RGA para aceites históricos em branco (opcional)
          <input className={inputClass} value={attestation} disabled={pending} maxLength={80} onChange={(event) => {
            setAttestation(event.target.value); clearPreview();
          }} />
          <span className="text-xs text-ink-2">Informe o código do documento aprovado que abrange este lote. Deixe vazio para conciliar apenas respostas explícitas. Revogações são preservadas.</span>
        </label>}
        <button type="button" className={buttonClass({ variant: 'primary', className: 'justify-self-start' })} disabled={pending} onClick={() => run('preview')}>Gerar prévia</button>
      </Card> : null}

      {preview ? <Card className="grid gap-4 p-5">
        <h2 className="text-md font-medium">Prévia da importação</h2>
        <RgaImportReport report={preview.report} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmed} disabled={pending} className="mt-0.5" onChange={(event) => setConfirmed(event.target.checked)} />
          Confirmo a importação das linhas válidas revisadas nesta prévia.
        </label>
        <button type="button" className={buttonClass({ variant: 'primary', className: 'justify-self-start' })} disabled={pending || !confirmed} onClick={() => run('confirm')}>Confirmar importação</button>
      </Card> : null}

      {result ? <Card className="grid gap-4 p-5">
        <h2 className="text-md font-medium">Importação concluída</h2>
        <RgaImportReport report={result.report} />
        <Link href={`/settings/import/${result.id}`} className="justify-self-start text-sm underline">Abrir relatório no histórico</Link>
      </Card> : null}
      {pending ? <p role="status" className="text-sm text-ink-2">Processando a planilha…</p> : null}
      {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
    </div>
  );
}
