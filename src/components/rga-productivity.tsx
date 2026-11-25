'use client';
import { useState, useTransition } from 'react';
import { buttonClass } from '@/components/ui/button';
import { inputClass, textareaClass, surface } from '@/components/form-controls';
import { messageFor, messageKinds, whatsappPhone, type MessageKind } from '@/lib/rga-productivity';
import { confirmWhatsappAction } from '@/app/(app)/productivity-actions';

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
      {enabled && <a className={buttonClass({ variant: 'secondary' })} href={'https://wa.me/?text=' + encodeURIComponent(draft)} target="_blank" rel="noreferrer">Compartilhar no WhatsApp</a>}
    </div>
    <p role="status" className="text-sm">{notice}</p>
  </section>;
}

export function WhatsappComposer({ opportunityId, name, job, brand, phones, status }: { opportunityId: string; name: string; job: string; brand: string; phones: string[]; status: string }) {
  const available = (Object.keys(messageKinds) as MessageKind[]).filter(k => k !== 'approved' && k !== 'closed' || k === 'approved' && status === 'HIRED' || k === 'closed' && status === 'ARCHIVED');
  const [kind, setKind] = useState<MessageKind>(status === 'ARCHIVED' ? 'closed' : 'contact');
  const [appointment, setAppointment] = useState('');
  const [meeting, setMeeting] = useState('');
  const [edited, setEdited] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, start] = useTransition();
  const phone = phones.map(whatsappPhone).find(Boolean);
  const draft = edited ?? messageFor(kind, { name, job, brand, appointment, meeting });
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
        <button disabled={!confirmed || !draft.trim() || busy} className={buttonClass({ variant: 'secondary' })} onClick={() => {
          if (!window.confirm('Confirma que você efetivamente enviou a mensagem? Abrir o WhatsApp não confirma o envio.')) return;
          start(async () => { setNotice((await confirmWhatsappAction(opportunityId, kind)).message); setConfirmed(false); });
        }}>Registrar envio realizado</button>
      </div>
      {!phone && <p className="text-sm">Telefone brasileiro não identificado. Use a cópia manual.</p>}
      <p className="text-xs text-ink-2">A plataforma não envia automaticamente nem confirma a entrega. O registro depende da sua confirmação. Para DISC, use a Central DISC e seu link individual.</p>
      <p role="status" className="text-sm">{notice}</p>
    </div>
  </details>;
}
