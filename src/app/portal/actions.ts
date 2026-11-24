'use server';

import { revalidatePath } from 'next/cache';
import { setPortalPreference } from '@/server/portal';

export async function setPortalPreferenceAction(token: string, granted: boolean, profileStorage: boolean) {
  await setPortalPreference(token, granted === true, profileStorage === true);
  revalidatePath('/portal/view');
}
