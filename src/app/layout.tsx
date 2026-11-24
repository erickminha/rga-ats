import { appLocale, appName } from '@/lib/i18n';
import type { Metadata, Viewport } from 'next';
import { fragmentMono, geist } from './fonts';
import { Lato, Poppins } from 'next/font/google';

const lato = Lato({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-rga-lato', display: 'swap' });
const poppins = Poppins({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-rga-poppins', display: 'swap' });
import { FieldValidation } from '@/components/field-validation';
import './globals.css';

export const metadata: Metadata = {
  title: { default: appName, template: `%s — ${appName}` },
  description:
    'Sistema de recrutamento e seleção com gestão de vagas, candidaturas, entrevistas, propostas e indicadores.',
};

// Mobile browser chrome matches the canvas token (docs/09 §2).
export const viewport: Viewport = { themeColor: '#f5f5f5' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang={appLocale}
      className={`${geist.variable} ${fragmentMono.variable} ${lato.variable} ${poppins.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>
        {children}
        {/* our own "fill this in" note instead of the browser's bubble */}
        <FieldValidation />
      </body>
    </html>
  );
}
