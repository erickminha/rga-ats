import { saveAutomationAction } from '@/app/org-actions';
import { Field, btnPrimary, inputClass, noAutofill } from '@/components/form-controls';
import { FormSelect } from '@/components/form-select';

/** Server component — plain form posting to a server action. */
export function AutomationSettings({
  templates,
  settings,
}: {
  templates: { id: string; name: string }[];
  settings: {
    autoConfirmTemplateId: string | null;
    autoRejectTemplateId: string | null;
    autoInterviewTemplateId: string | null;
    autoRejectDelayHours: number;
  };
}) {
  const templateSelect = (name: string, current: string | null) => (
    <FormSelect
      name={name}
      defaultValue={current ?? ''}
      options={[
        { value: '', label: 'Desativado' },
        ...templates.map((t) => ({ value: t.id, label: `Enviar “${t.name}”` })),
      ]}
    />
  );

  return (
    <form action={saveAutomationAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ao receber uma candidatura">
          {templateSelect('autoConfirmTemplateId', settings.autoConfirmTemplateId)}
        </Field>
        <Field label="Ao agendar uma entrevista">
          {templateSelect('autoInterviewTemplateId', settings.autoInterviewTemplateId)}
        </Field>
        <Field label="Ao arquivar uma candidatura por reprovação">
          {templateSelect('autoRejectTemplateId', settings.autoRejectTemplateId)}
        </Field>
        <Field label="Prazo para enviar a devolutiva (horas)">
          <input {...noAutofill}
            name="autoRejectDelayHours"
            type="number"
            min={0}
            defaultValue={settings.autoRejectDelayHours}
            className={inputClass}
          />
        </Field>
      </div>
      <p className="text-xs text-ink-2">
        Durante esse prazo, você pode desarquivar a candidatura antes do envio. Os e-mails agendados aparecem no perfil do candidato e podem ser cancelados.
      </p>
      <div className="flex justify-end">
        <button type="submit" className={btnPrimary}>
          Salvar automação
        </button>
      </div>
    </form>
  );
}
