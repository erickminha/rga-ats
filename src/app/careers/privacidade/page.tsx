import { PoweredBySource } from '@/components/powered-by';
import { noIndex } from '@/lib/public-careers';

export const metadata = { title: 'Aviso de privacidade | RGA ATS', robots: noIndex };
export const dynamic = "force-dynamic";

export default function PrivacyNotice() {
  const configured = process.env.RGA_PRIVACY_CONTACT?.trim();
  const contact = configured && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(configured) ? configured : null;

  return (
    <main className="mx-auto grid max-w-2xl gap-5 px-6 py-12 text-sm text-ink">
      <h1 className="text-3xl font-semibold">Aviso de privacidade para candidaturas</h1>
      <p>A RGA Consultoria de RH trata os dados enviados para receber sua candidatura, avaliar seu perfil para a vaga e entrar em contato sobre a seleção.</p>
      <p>A equipe autorizada pode consultar os dados. Quando necessário para a seleção, a RGA poderá compartilhar as informações pertinentes com a empresa responsável pela vaga. Serviços de hospedagem, armazenamento e e-mail dão suporte ao portal.</p>
      <p>Guardar seu perfil para futuras vagas é opcional. Você pode rever essa preferência pelo acompanhamento enviado ao seu e-mail. A RGA conserva os dados necessários durante a seleção e pelo período exigido por obrigações aplicáveis, conforme cada caso.</p>
      <p>Você pode solicitar acesso, correção ou exclusão dos seus dados. A RGA poderá verificar sua identidade antes de responder ao pedido.</p>
      {contact
        ? <p>Canal de privacidade da RGA: <a className="underline" href={`mailto:${contact}`}>{contact}</a>.</p>
        : <p>Para exercer seus direitos, entre em contato com a RGA pelo canal institucional por onde recebeu a vaga.</p>}
      <PoweredBySource />
    </main>
  );
}
