'use client';

import { useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { createCustomFieldAction, deleteCustomFieldAction } from '@/app/org-actions';
import { btnTonal, inputClass, badge, noAutofill } from '@/components/form-controls';
import { FormSelect } from '@/components/form-select';

const fieldTypes = [
  { value: 'TEXT', label: 'Texto' },
  { value: 'NUMBER', label: 'Número' },
  { value: 'DATE', label: 'Data' },
  { value: 'SELECT', label: 'Lista de opções' },
];

export type FieldDef = { id: string; label: string; type: string; options: string[] };

export function CustomFieldsManager({ defs }: { defs: FieldDef[] }) {
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState('');
  const [type, setType] = useState('TEXT');
  const [options, setOptions] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {defs.length ? (
        <div className="flex flex-wrap gap-2">
          {defs.map((d) => (
            <span key={d.id} className={`${badge} pr-1.5`}>
              {d.label} · {fieldTypes.find((type) => type.value === d.type)?.label ?? d.type}
              <button
                title={`Remover ${d.label}`}
                aria-label={`Remover ${d.label}`}
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remover o campo “${d.label}”? Os valores ficam armazenados e deixam de aparecer nos perfis.`)) return;
                  startTransition(() => deleteCustomFieldAction(d.id));
                }}
                className="flex size-4 cursor-pointer items-center justify-center rounded-full text-ink-3 transition-colors duration-[120ms] hover:text-critical disabled:opacity-40"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await createCustomFieldAction(label, type, options);
            if (result.error) setError(result.error);
            else {
              setLabel('');
              setOptions('');
              setError(null);
            }
          });
        }}
      >
        <input {...noAutofill}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          placeholder="Nome do campo (ex.: aviso prévio)"
          className={inputClass}
        />
        <FormSelect
          value={type}
          onChange={setType}
          className="sm:w-32"
          options={fieldTypes}
        />
        {type === 'SELECT' ? (
          <input {...noAutofill}
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            placeholder="Opções separadas por vírgulas"
            className={inputClass}
          />
        ) : null}
        <button type="submit" disabled={pending || !label.trim()} className={btnTonal}>
          <Plus /> Adicionar campo
        </button>
      </form>
      {error ? <p className="text-sm text-critical">{error}</p> : null}
    </div>
  );
}
