'use client';
import { useState, useTransition } from 'react';
import { buttonClass } from '@/components/ui/button';
import { inputClass, textareaClass, surface } from '@/components/form-controls';
import { messageFor, messageKinds, whatsappPhone, whatsappVariables, type MessageKind, type WhatsappTemplates } from '@/lib/rga-productivity';
import { confirmWhatsappAction, saveWhatsappTemplatesAction } from '@/app/(app)/productivity-actions';

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return 'Texto copiado.'; }
  catch { return 'Selecione e copie o texto manualmente.'; }
}
function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export function AdComposer({ published, initial, title }: { published: boolean; initial: string; title: string }) {
  const [draft, setDraft] = useState(initial);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState('');
  const enabled = published && confirmed && !!draft.trim();
  function downloadArtwork() {
    // Vector-like text rendered at 1080px; refuse very long copy rather than silently truncate.
    if (draft.length > 4500) { setNotice('Reduza o anúncio para até 4.500 caracteres para gerar a arte, ou use o PDF.'); return; }
    const canvas = document.createElement('canvas'); canvas.width = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setNotice('O navegador não conseguiu gerar a arte.'); return; }
    ctx.font = '30px Arial';
    const lines: string[] = [];
    for (const paragraph of draft.split('\n')) {
      if (!paragraph.trim()) { lines.push(''); continue; }
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (ctx.measureText(word).width > 928) {
          if (line) { lines.push(line); line = ''; }
          for (const ch of word) {
            if (ctx.measureText(line + ch).width > 928) { lines.push(line); line = ''; }
            line += ch;
          }
        } else if (line && ctx.measureText(line + ' ' + word).width > 928) {
          lines.push(line); line = word;
        } else line += (line ? ' ' : '') + word;
      }
      if (line) lines.push(line);
    }
    const height = Math.max(1350, 280 + lines.length * 42);
    if (height > 4400) { setNotice('O texto ocupa muitas linhas. Reduza o anúncio para a arte ou use o PDF.'); return; }
    canvas.height = height;
    ctx.fillStyle = '#F5F5F5'; ctx.fillRect(0,0,1080,height);
    ctx.fillStyle = '#1581C9'; ctx.fillRect(0,0,1080,170);
    ctx.fillStyle = '#F9C82B'; ctx.fillRect(0,170,1080,10);
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 44px Arial'; ctx.fillText('RGA | Oportunidade de emprego',76,104);
    ctx.font = '30px Arial'; ctx.fillStyle = '#161D27';
    lines.forEach((line,i) => ctx.fillText(line,76,246+i*42));
    ctx.fillStyle = '#6C336E'; ctx.fillRect(0,height-30,1080,30);
    canvas.toBlob(blob => {
      if (!blob) { setNotice('Não foi possível gerar a arte.'); return; }
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='anuncio-rga.png'; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url),1000);
      setNotice('Arte gerada. Confira a legibilidade antes de compartilhar.');
    },'image/png');
  }
  function printAd() {
    const popup = window.open('', '_blank');
    if (!popup) { setNotice('Permita a abertura de uma nova janela para imprimir.'); return; }
    popup.opener = null;
    const doc = popup.document;
    doc.title = 'Divulgação — ' + title;
    const style = doc.createElement('style');
    style.textContent = 'body{font:16px/1.55 Arial,sans-serif;color:#161D27;margin:48px;max-width:800px}h1{color:#1581C9;border-bottom:5px solid #6C336E;padding-bottom:16px}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{margin:20mm}}';
    doc.head.append(style);
    const h = doc.createElement('h1'); h.textContent = 'RGA • Divulgação de vaga';
    const pre = doc.createElement('pre'); pre.textContent = draft;
    doc.body.append(h, pre); popup.focus(); popup.print();
  }
  return <section className={surface + ' mt-5 grid gap-3 p-5'} id="divulgacao">
    <h2 className="font-semibold">Gerar anúncio da vaga</h2>
    <p className="text-sm text-ink-2">Texto preenchido com os dados da vaga. Confira as informações antes de divulgar. A identificação da empresa só é preenchida quando autorizada na vaga.</p>
    <textarea aria-label="Prévia do anúncio" className={textareaClass} rows={12} value={draft} onChange={e => { setDraft(e.target.value); setConfirmed(false); }} />
    <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={() => { setDraft(initial); setConfirmed(false); }}>Regerar a partir do cadastro</button>
    {!published ? <p className="text-sm">Prévia interna. Publique a vaga para liberar o compartilhamento.</p> : <label className="text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> Revisei e autorizo a divulgação deste texto.</label>}
    <div className="flex flex-wrap gap-2">
      <button disabled={!enabled} className={buttonClass({ variant: 'primary' })} onClick={async () => setNotice(await copyText(draft))}>Copiar anúncio</button>
      <button disabled={!enabled} className={buttonClass({ variant: 'secondary' })} onClick={() => download(draft, 'anuncio-rga.txt')}>Baixar texto</button>
      <button disabled={!enabled} className={buttonClass({ variant: 'secondary' })} onClick={printAd}>Imprimir / salvar PDF</button>
      <button disabled={!enabled} className={buttonClass({ variant: 'secondary' })} onClick={downloadArtwork}>Baixar arte PNG</button>
      {enabled && <a className={buttonClass({ variant: 'secondary' })} href={'https://wa.me/?text=' + encodeURIComponent(draft)} target="_blank" rel="noreferrer">Compartilhar no WhatsApp</a>}
    </div>
    <p role="status" className="text-sm">{notice}</p>
  </section>;
}

export function WhatsappComposer({ opportunityId, name, job, brand, phones, status, approved, nextInterview, referenceId, templates }: { opportunityId: string; name: string; job: string; brand: string; phones: string[]; status: string; approved: boolean; nextInterview?: { at: string; location: string }; referenceId?: string; templates?: WhatsappTemplates }) {
  const thirdPartyKinds: MessageKind[] = ['referenceIntro', 'referenceReminder', 'referenceThanks'];
  const available = referenceId ? thirdPartyKinds : (Object.keys(messageKinds) as MessageKind[]).filter(key => {
    if (key === 'approved') return approved;
    if (key === 'closed') return status === 'ARCHIVED';
    return key !== 'disc' && !thirdPartyKinds.includes(key);
  });
  const [kind, setKind] = useState<MessageKind>(referenceId ? 'referenceIntro' : status === 'ARCHIVED' ? 'closed' : approved ? 'approved' : 'contact');
  const [appointment, setAppointment] = useState(nextInterview?.at ?? '');
  const [meeting, setMeeting] = useState(nextInterview?.location ?? '');
  const [edited, setEdited] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, start] = useTransition();
  const phone = phones.map(whatsappPhone).find(Boolean);
  const draft = edited ?? messageFor(kind, { name, job, brand, appointment, meeting }, templates?.[kind]);
  return <details className={surface + ' grid gap-3 p-4'}>
    <summary className="cursor-pointer font-medium">Mensagens para WhatsApp</summary>
    <div className="mt-3 grid gap-3">
      <label className="grid gap-1 text-sm">Modelo <select className={inputClass} value={kind} onChange={e => { setKind(e.target.value as MessageKind); setEdited(null); setConfirmed(false); setNotice(''); }}>
        {available.map(k => <option key={k} value={k}>{messageKinds[k]}</option>)}
      </select></label>
      {kind === 'interview' && <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid text-sm">Data e horário<input className={inputClass} value={appointment} onChange={e => { setAppointment(e.target.value); setEdited(null); setConfirmed(false); }} placeholder="Ex.: 28/11 às 14h" /></label>
        <label className="grid text-sm">Local ou link da entrevista<input className={inputClass} value={meeting} onChange={e => { setMeeting(e.target.value); setEdited(null); setConfirmed(false); }} /></label>
      </div>}
      <textarea aria-label="Prévia da mensagem" className={textareaClass} rows={8} maxLength={3000} value={draft} onChange={e => { setEdited(e.target.value); setConfirmed(false); }} />
      <p className="text-sm">Destinatário: {phone ? '+' + phone : 'Sem telefone válido'}</p>
      <label className="text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> Revisei o texto e o destinatário.</label>
      <div className="flex flex-wrap gap-2">
        <button disabled={!confirmed || !draft.trim()} className={buttonClass({ variant: 'secondary' })} onClick={async () => setNotice(await copyText(draft))}>Copiar mensagem</button>
        {confirmed && draft.trim() && phone && <a className={buttonClass({ variant: 'primary' })} target="_blank" rel="noreferrer" href={'https://wa.me/' + phone + '?text=' + encodeURIComponent(draft)}>Abrir WhatsApp</a>}
        {!referenceId && <button disabled={!confirmed || !draft.trim() || busy} className={buttonClass({ variant: 'secondary' })} onClick={() => {
          if (!window.confirm('Confirma que você efetivamente enviou a mensagem? Abrir o WhatsApp não confirma o envio.')) return;
          start(async () => { setNotice((await confirmWhatsappAction(opportunityId, kind)).message); setConfirmed(false); });
        }}>Registrar envio realizado</button>}
      </div>
      {!phone && <p className="text-sm">Telefone brasileiro não identificado. Use a cópia manual.</p>}
      <p className="text-xs text-ink-2">A plataforma não envia automaticamente nem confirma a entrega. O registro depende da sua confirmação. Para DISC, use a Central DISC e seu link individual.</p>
      <p role="status" className="text-sm">{notice}</p>
    </div>
  </details>;
}

export function WhatsappTemplateSettings({ templates }: { templates: WhatsappTemplates }) {
  const [notice, setNotice] = useState('');
  const [busy, start] = useTransition();
  return <form className="grid gap-3" onSubmit={event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start(async () => {
      const result = await saveWhatsappTemplatesAction(form);
      setNotice(result.error ?? result.message ?? '');
    });
  }}>
    <p className="text-sm">Deixe o campo vazio para usar o modelo padrão da organização. Use as variáveis conforme o tipo de mensagem.</p>
    <ul className="grid gap-1 text-sm sm:grid-cols-2">
      {Object.entries(whatsappVariables).map(([key, label]) => <li key={key}><code>{'{{' + key + '}}'}</code> · {label}</li>)}
    </ul>
    <fieldset className="grid min-w-0 gap-2" disabled={busy}>
      {(Object.keys(messageKinds) as MessageKind[]).map(kind => <details key={kind} className="rounded-lg border border-line p-3">
        <summary className="cursor-pointer">{messageKinds[kind]}</summary>
        <textarea aria-label={messageKinds[kind]} className={textareaClass + ' mt-2'} name={kind} rows={5} maxLength={2000} defaultValue={templates[kind]} />
      </details>)}
      <button className={buttonClass({ variant: 'primary' })}>Salvar modelos de WhatsApp</button>
    </fieldset>
    <p className="text-sm" role="status">{notice}</p>
  </form>;
}
