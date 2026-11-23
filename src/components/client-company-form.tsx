'use client';

import { useActionState, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  saveClientAction, saveCommercialContactAction, setPostingClientAction,
  type ClientFormState,
} from '@/app/(app)/clients/actions';
import { brazilianStates, companyFields, maskCnpj, maskPhone, maskPostalCode, type CompanyField } from '@/lib/client-company';
import { inputClass, selectClass, surface, textareaClass } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';

type ClientValues = Partial<Record<CompanyField, string | null>> & { id?: string; active?: boolean };
type ContactValues = { id: string; name: string; role: string | null; phone: string | null; whatsapp: string | null; email: string | null };

function Input({ label, name, value, mask, type = 'text', required = false }: {
  label: string; name: string; value?: string | null; mask?: (value: string) => string; type?: string; required?: boolean;
}) {
  const [text, setText] = useState(() => mask && value ? mask(value) : value ?? '');
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">
      <span>{label}</span>
      <input name={name} type={type} value={text}
        onChange={(event) => setText(mask ? mask(event.target.value) : event.target.value)}
        className={inputClass} inputMode={name === 'postalCode' ? 'numeric' : undefined} required={required} />
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className={`${surface} min-w-0 p-4 sm:p-5`}>
      <legend className="px-1 text-md font-medium">{title}</legend>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Feedback({ state }: { state: ClientFormState }) {
  return (
    <>
      {state.error ? <p role="alert" className="text-sm text-critical">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm text-ink">{state.success}</p> : null}
    </>
  );
}

export function ClientCompanyForm({ company }: { company?: ClientValues }) {
  const [state, action, pending] = useActionState(saveClientAction.bind(null, company?.id ?? null), {});
  const [status, setStatus] = useState(company?.active === false ? 'inactive' : 'active');
  const [uf, setUf] = useState(company?.state ?? '');
  const [notes, setNotes] = useState(company?.notes ?? '');
  const input = (name: CompanyField, mask?: (value: string) => string, type?: string) =>
    <Input label={companyFields[name]} name={name} value={company?.[name]} mask={mask} type={type} />;

  return (
    <form action={action} className="grid gap-5">
      <p className="text-sm text-ink-2">Informe o nome fantasia ou a razão social. Os demais dados são opcionais.</p>
      <Section title="Identificação">
        {input('name')}{input('legalName')}{input('cnpj', maskCnpj)}{input('stateRegistration')}
        {input('segment')}{input('size')}{input('source')}
        <div className="grid gap-1.5 text-sm font-medium">
          <label htmlFor="company-status">Situação</label>
          <select id="company-status" name="status" className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">Ativa</option>
            <option value="inactive">Inativa</option>
          </select>
        </div>
      </Section>
      <Section title="Responsável e canais de contato">
        {input('responsibleName')}{input('responsibleRole')}
        {input('phone', maskPhone, 'tel')}{input('whatsapp', maskPhone, 'tel')}
        {input('email', undefined, 'email')}{input('website')}
      </Section>
      <Section title="Endereço e observações">
        {input('postalCode', maskPostalCode)}{input('address')}{input('city')}
        <div className="grid gap-1.5 text-sm font-medium">
          <label htmlFor="company-state">Estado (UF)</label>
          <select id="company-state" name="state" className={selectClass} value={uf} onChange={(event) => setUf(event.target.value)}>
            <option value="">Selecione</option>
            {brazilianStates.map((state) => <option value={state} key={state}>{state}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5 text-sm font-medium sm:col-span-2">
          <label htmlFor="company-notes">Observações internas</label>
          <textarea id="company-notes" name="notes" className={textareaClass} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
      </Section>
      <Feedback state={state} />
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass({ variant: 'primary' })} disabled={pending} type="submit">
          {pending ? 'Salvando…' : 'Salvar empresa'}
        </button>
        <Link href={company?.id ? `/clients/${company.id}` : '/clients'} className={buttonClass({ variant: 'ghost' })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}

export function CommercialContactForm({ clientId, contact }: { clientId: string; contact?: ContactValues }) {
  const [state, action, pending] = useActionState(saveCommercialContactAction.bind(null, clientId, contact?.id ?? null), {});
  return (
    <form action={action} className="grid gap-3 pt-3">
      <div key={contact?.id ?? state.resetKey} className="grid gap-3 sm:grid-cols-2">
        <Input name="name" label="Nome do contato" value={contact?.name} required />
        <Input name="role" label="Cargo" value={contact?.role} />
        <Input name="phone" label="Telefone" value={contact?.phone} mask={maskPhone} type="tel" />
        <Input name="whatsapp" label="WhatsApp" value={contact?.whatsapp} mask={maskPhone} type="tel" />
        <Input name="email" label="E-mail" value={contact?.email} type="email" />
      </div>
      <Feedback state={state} />
      <button className={buttonClass({ variant: 'tonal', className: 'justify-self-start' })} type="submit" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar contato'}
      </button>
    </form>
  );
}

export function PostingClientForm({ postingId, clientId, choices }: {
  postingId: string; clientId: string | null; choices: { id: string; name: string; active: boolean }[];
}) {
  const [state, action, pending] = useActionState(setPostingClientAction.bind(null, postingId), {});
  const [selected, setSelected] = useState(clientId ?? '');
  return (
    <form action={action} className="grid gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
          <label htmlFor="posting-client">Empresa cliente</label>
          <select id="posting-client" name="clientCompanyId" className={selectClass} value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="">Sem cliente</option>
            {choices.map((client) => <option value={client.id} key={client.id}>{client.name}{client.active ? '' : ' (inativa)'}</option>)}
          </select>
        </div>
        <button type="submit" disabled={pending} className={buttonClass({ variant: 'tonal' })}>
          {pending ? 'Salvando…' : 'Salvar vínculo'}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
