import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import LinkPage from '../[token]/page';

export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function ViewPage() {
  const token = (await cookies()).get('rga-share-access')?.value;
  if (!token) notFound();
  return <LinkPage params={Promise.resolve({ token })} />;
}
