import Link from 'next/link';

export default function ClientNotFound() {
  return (
    <div className="mx-6 mt-8 grid justify-items-start gap-3">
      <h1 className="text-xl font-medium">Empresa indisponível</h1>
      <p className="text-sm text-ink-2">Verifique o endereço ou seu acesso ao espaço de trabalho.</p>
      <Link href="/postings" className="text-sm underline underline-offset-2">Voltar para vagas</Link>
    </div>
  );
}
