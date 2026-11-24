import { SourceCodeLinks, SourceLockup } from '@/components/powered-by';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rga-auth grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(460px,0.85fr)]">
      <aside className="rga-hero m-4 hidden min-h-[calc(100dvh-2rem)] flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-3"><span className="rga-display rounded-xl bg-[#1581c9] px-3 py-3 font-bold text-white">RGA</span><div><p className="rga-display text-xl font-semibold">RGA ATS</p><p className="text-xs tracking-widest text-[#d4e7f6]">RECURSOS HUMANOS</p></div></div>
        <div className="max-w-lg"><span className="mb-5 block h-1 w-14 rounded-full bg-[#f9c82b]" /><h1 className="rga-display text-4xl font-semibold leading-tight xl:text-5xl">Conectando talentos.<br />Transformando oportunidades.</h1><p className="mt-5 max-w-sm text-md leading-relaxed text-[#d4e7f6]">Recrutamento, seleção e gestão de talentos em um único espaço de trabalho.</p></div>
        <p className="text-sm text-[#d4e7f6]">RGA Recursos Humanos · Plataforma de recrutamento e seleção</p>
      </aside>
      <main className="flex min-w-0 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <SourceLockup href="/" className="mb-6" />
        <div className="rga-card w-full max-w-[430px] p-6 sm:p-8">{children}</div>
        <SourceCodeLinks className="mt-5 justify-center" />
      </main>
    </div>
  );
}
