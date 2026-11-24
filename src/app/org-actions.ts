'use server';

import { groups, logo } from '@/lib/i18n/pt-BR/organization';
import { revalidatePath } from 'next/cache';
import { lockPostingForEdit, mayEditPostingDetails } from '@/server/posting-policy';
import { storeFile } from '@/server/storage';
import { redirect } from 'next/navigation';
import { AccessRole, Prisma, type OrgKind, type StageType } from '@prisma/client';
import { isDefaultBrand, readBrand } from '@/lib/brand';
import { db } from '@/lib/db';
import { EEOEnabled, talentNetworkAllowed } from '@/server/privacy-options';
import { requireRecruitingAccess, requireSession, revalidateOrgNav } from '@/lib/session';
import { writeOrgNavCookie } from '@/lib/org-nav-cookie';
import {
  addGroups,
  completeOnboarding,
  removeClientCompany,
  removeDepartment,
  removeGroups,
  setOrgKind,
  type GroupKind,
} from '@/server/org';
import { cleanNames, namesFromRows } from '@/lib/names';
import { providerMeta } from '@/lib/import-providers';
import { readSpreadsheet } from '@/server/spreadsheet';
import { createStage, deleteStage, reconcileRgaStages, renameStage, setStageOrder } from '@/server/stages';
import {
  createTemplate,
  deleteTemplate,
  updateEmailAutomation,
  updateTemplate,
} from '@/server/email';
import { createApiKey, revokeApiKey } from '@/server/api-keys';
import { inviteUser, setUserActive, setUserRole, TeamError } from '@/server/team';
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  setWebhookActive,
} from '@/server/webhooks';

const PATHS = ['/clients', '/onboarding', '/settings', '/pipeline', '/postings'];
const STAGE_TYPES = ['LEAD', 'APPLICANT', 'SCREEN', 'ONSITE', 'OFFER', 'HIRED'] as const;

function refresh() {
  for (const p of PATHS) revalidatePath(p);
}

// Org configuration (pipeline shape, groups, templates, automation, org
// settings) is admin-only — team members and interviewers work candidates,
// they don't reshape the org.
async function requireAdmin() {
  const ctx = await requireSession();
  if (ctx.accessRole !== 'SUPER_ADMIN' && ctx.accessRole !== 'ADMIN')
    throw new Error('Admins only');
  return ctx;
}

export async function setOrgKindAction(kind: OrgKind) {
  const ctx = await requireAdmin();
  if (kind !== 'COMPANY' && kind !== 'AGENCY') return;
  await setOrgKind(ctx, kind);
  refresh();
}

/**
 * Finish (or skip) onboarding. A workspace coming from another ATS lands on
 * that provider's import form, where its stages come across next.
 */
export async function completeOnboardingAction(formData?: FormData) {
  const ctx = await requireAdmin();
  const org = await completeOnboarding(ctx);
  revalidateOrgNav(ctx.orgId);
  await writeOrgNavCookie({
    name: org.name,
    logoFileId: org.logoFileId,
    onboardedAt: org.onboardedAt,
  });
  const provider = providerMeta(String(formData?.get('provider') ?? ''));
  redirect(provider ? `/settings/import?provider=${provider.id}` : '/pipeline');
}

export type GroupsResult = { created: { id: string; name: string }[]; existing: number } | { error: string };

const MAX_SHEET_BYTES = 5 * 1024 * 1024;

function groupKind(kind: unknown): GroupKind {
  if (kind !== 'client' && kind !== 'department') throw new Error('Unknown group kind');
  return kind;
}

/** Departments or client companies typed or pasted into the form: one or many. */
export async function addGroupsAction(kind: GroupKind, names: string[]): Promise<GroupsResult> {
  const ctx = await requireAdmin();
  const clean = cleanNames(Array.isArray(names) ? names.map(String) : []);
  if (!clean.length) return { error: groups.missingName };
  const result = await addGroups(ctx, groupKind(kind), clean);
  refresh();
  return result;
}

/** A spreadsheet of them: the first sheet's names column (see namesFromRows). */
export async function importGroupsAction(kind: GroupKind, formData: FormData): Promise<GroupsResult> {
  const ctx = await requireAdmin();
  const file = formData.get('file');
  if (!(file instanceof File) || !file.size) return { error: groups.missingFile };
  if (file.size > MAX_SHEET_BYTES) return { error: groups.fileTooLarge };
  let rows: string[][] | null = null;
  try {
    rows = readSpreadsheet(new Uint8Array(await file.arrayBuffer()));
  } catch {
    // A damaged or password-protected workbook reads as unreadable.
  }
  if (!rows) return { error: groups.unreadableFile };
  const names = namesFromRows(rows);
  if (!names.length) return { error: groups.missingNames };
  const result = await addGroups(ctx, groupKind(kind), names);
  refresh();
  return result;
}

/** Undo for a bulk add. */
export async function removeGroupsAction(kind: GroupKind, ids: string[]) {
  const ctx = await requireAdmin();
  await removeGroups(ctx, groupKind(kind), Array.isArray(ids) ? ids.map(String) : []);
  refresh();
}

export async function removeGroupAction(kind: 'department' | 'client', id: string) {
  const ctx = await requireAdmin();
  if (kind === 'client') await removeClientCompany(ctx, id);
  else await removeDepartment(ctx, id);
  refresh();
}

export async function reconcileRgaStagesAction() {
  const ctx = await requireAdmin();
  try {
    const result = await reconcileRgaStages(ctx);
    if (result.changed) refresh();
    return result;
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Não foi possível configurar o funil RGA.' };
  }
}

export async function createStageAction(name: string, type: string): Promise<{ error?: string }> {
  const ctx = await requireAdmin();
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return { error: 'Digite um nome para a etapa.' };
  if (!STAGE_TYPES.includes(type as never)) return { error: 'Escolha o tipo de etapa.' };
  try {
    await createStage(ctx, trimmed, type as StageType);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Não foi possível adicionar a etapa.' };
  }
  refresh();
  return {};
}

export async function renameStageAction(stageId: string, name: string): Promise<{ error?: string }> {
  const ctx = await requireAdmin();
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return { error: 'Informe o nome da etapa.' };
  try {
    await renameStage(ctx, stageId, trimmed);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Não foi possível renomear a etapa.' };
  }
  refresh();
  return {};
}

/** The whole pipeline in its new order, after a drag in the stage editor. */
export async function reorderStagesAction(ids: string[]): Promise<{ error?: string }> {
  const ctx = await requireAdmin();
  try {
    await setStageOrder(ctx, Array.isArray(ids) ? ids.map(String) : []);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Não foi possível reordenar as etapas.' };
  }
  refresh();
  return {};
}

const FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'SELECT'] as const;

export async function createCustomFieldAction(
  label: string,
  type: string,
  optionsRaw: string,
): Promise<{ error?: string }> {
  const ctx = await requireSession();
  if (ctx.accessRole !== 'SUPER_ADMIN' && ctx.accessRole !== 'ADMIN')
    return { error: 'Admins only.' };
  const clean = label.trim();
  if (!clean) return { error: 'Informe o nome do campo.' };
  if (!FIELD_TYPES.includes(type as never)) return { error: 'Tipo inválido.' };
  const key = clean.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (!key) return { error: 'Inclua letras ou números no nome do campo.' };
  const options =
    type === 'SELECT'
      ? optionsRaw.split(',').map((o) => o.trim()).filter(Boolean).slice(0, 20)
      : [];
  if (type === 'SELECT' && options.length < 2)
    return { error: 'A lista precisa de pelo menos duas opções.' };
  try {
    await db.customFieldDef.create({
      data: {
        orgId: ctx.orgId,
        key,
        label: clean,
        type: type as (typeof FIELD_TYPES)[number],
        options,
      },
    });
  } catch {
    return { error: 'Já existe um campo com esse nome.' };
  }
  revalidatePath('/settings');
  return {};
}

export async function deleteCustomFieldAction(defId: string) {
  const ctx = await requireSession();
  if (ctx.accessRole !== 'SUPER_ADMIN' && ctx.accessRole !== 'ADMIN') return;
  await db.customFieldDef.deleteMany({ where: { id: defId, orgId: ctx.orgId } });
  revalidatePath('/settings');
}

export async function setCollectEeoAction(enabled: boolean) {
  const ctx = await requireSession();
  if (ctx.accessRole !== 'SUPER_ADMIN' && ctx.accessRole !== 'ADMIN') return;
  if (enabled && !EEOEnabled()) return;
  await db.organization.update({ where: { id: ctx.orgId }, data: { collectEeo: enabled } });
  // No revalidatePath here: callers router.refresh() after the action
  // resolves. revalidatePath inside the action trips a Next 15 regression
  // (vercel/next.js#82289) that aborts the response stream and leaves
  // useTransition pending forever.
}

export async function inviteUserAction(
  name: string,
  email: string,
  role: string,
): Promise<{ tempPassword?: string; error?: string }> {
  const ctx = await requireSession();
  if (!Object.hasOwn(AccessRole, role)) return { error: 'Perfil de acesso inválido.' };
  try {
    const { tempPassword } = await inviteUser(ctx, {
      name,
      email,
      accessRole: role as AccessRole,
    });
    revalidatePath('/settings');
    return { tempPassword };
  } catch (error) {
    return { error: error instanceof TeamError ? error.message : 'Não foi possível convidar a pessoa.' };
  }
}

export async function setUserRoleAction(userId: string, role: string): Promise<{ error?: string }> {
  const ctx = await requireSession();
  if (!Object.hasOwn(AccessRole, role)) return { error: 'Perfil de acesso inválido.' };
  try {
    await setUserRole(ctx, userId, role as AccessRole);
    revalidatePath('/settings');
    return {};
  } catch (error) {
    return { error: error instanceof TeamError ? error.message : 'Não foi possível alterar o perfil.' };
  }
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<{ error?: string }> {
  const ctx = await requireSession();
  if (typeof active !== 'boolean') return { error: 'Situação inválida.' };
  try {
    await setUserActive(ctx, userId, active);
    revalidatePath('/settings');
    return {};
  } catch (error) {
    return { error: error instanceof TeamError ? error.message : 'Não foi possível alterar a situação da conta.' };
  }
}

export async function saveRetentionAction(formData: FormData) {
  const ctx = await requireSession();
  if (ctx.accessRole !== 'SUPER_ADMIN' && ctx.accessRole !== 'ADMIN') return;
  const raw = String(formData.get('retentionMonths') ?? '').trim();
  const months = raw ? Number.parseInt(raw, 10) : null;
  await db.organization.update({
    where: { id: ctx.orgId },
    data: { retentionMonths: months && Number.isFinite(months) && months > 0 ? months : null },
  });
  revalidatePath('/settings');
}

export async function setFeedbackVisibilityAction(enabled: boolean) {
  const ctx = await requireAdmin();
  await db.organization.update({
    where: { id: ctx.orgId },
    data: { hideFeedbackUntilSubmitted: enabled },
  });
  // Callers router.refresh() — see setCollectEeoAction for why.
}

export async function setTalentNetworkAction(enabled: boolean) {
  const ctx = await requireAdmin();
  if (enabled && !talentNetworkAllowed()) return;
  await db.organization.update({
    where: { id: ctx.orgId },
    data: { talentNetworkEnabled: enabled },
  });
  // Callers router.refresh() — see setCollectEeoAction for why.
}

export async function saveTemplateAction(formData: FormData) {
  const ctx = await requireAdmin();
  const templateId = String(formData.get('templateId') ?? '');
  const input = {
    name: String(formData.get('name') ?? '').trim(),
    subject: String(formData.get('subject') ?? '').trim(),
    body: String(formData.get('body') ?? '').trim(),
  };
  if (!input.name || !input.subject || !input.body) return;
  if (templateId) await updateTemplate(ctx, templateId, input);
  else await createTemplate(ctx, input);
  revalidatePath('/settings');
}

export async function deleteTemplateAction(templateId: string) {
  const ctx = await requireAdmin();
  await deleteTemplate(ctx, templateId);
  revalidatePath('/settings');
}

export async function saveAutomationAction(formData: FormData) {
  const ctx = await requireAdmin();
  const delay = Number.parseInt(String(formData.get('autoRejectDelayHours') ?? '48'), 10);
  await updateEmailAutomation(ctx, {
    autoConfirmTemplateId: String(formData.get('autoConfirmTemplateId') ?? '') || null,
    autoRejectTemplateId: String(formData.get('autoRejectTemplateId') ?? '') || null,
    autoInterviewTemplateId: String(formData.get('autoInterviewTemplateId') ?? '') || null,
    autoRejectDelayHours: Number.isFinite(delay) ? delay : 48,
  });
  revalidatePath('/settings');
}

export async function createApiKeyAction(name: string): Promise<{ plaintext?: string; error?: string }> {
  const ctx = await requireSession();
  if (ctx.accessRole !== 'SUPER_ADMIN' && ctx.accessRole !== 'ADMIN')
    return { error: 'Admins only.' };
  const { plaintext } = await createApiKey(ctx, name);
  revalidatePath('/settings');
  return { plaintext };
}

export async function revokeApiKeyAction(keyId: string) {
  const ctx = await requireSession();
  if (ctx.accessRole !== 'SUPER_ADMIN' && ctx.accessRole !== 'ADMIN') return;
  await revokeApiKey(ctx, keyId);
  revalidatePath('/settings');
}

export async function createWebhookAction(
  url: string,
  typesRaw: string,
): Promise<{ secret?: string; error?: string }> {
  const ctx = await requireSession();
  if (ctx.accessRole !== 'SUPER_ADMIN' && ctx.accessRole !== 'ADMIN')
    return { error: 'Admins only.' };
  const eventTypes = typesRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  try {
    const { secret } = await createWebhookEndpoint(ctx, url, eventTypes);
    revalidatePath('/settings');
    return { secret };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed' };
  }
}

export async function setWebhookActiveAction(endpointId: string, active: boolean) {
  const ctx = await requireSession();
  if (ctx.accessRole !== 'SUPER_ADMIN' && ctx.accessRole !== 'ADMIN') return;
  await setWebhookActive(ctx, endpointId, active);
  revalidatePath('/settings');
}

export async function deleteWebhookAction(endpointId: string) {
  const ctx = await requireSession();
  if (ctx.accessRole !== 'SUPER_ADMIN' && ctx.accessRole !== 'ADMIN') return;
  await deleteWebhookEndpoint(ctx, endpointId);
  revalidatePath('/settings');
}

export async function deleteStageAction(stageId: string): Promise<{ error?: string }> {
  const ctx = await requireAdmin();
  try {
    await deleteStage(ctx, stageId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Não foi possível excluir a etapa.' };
  }
  refresh();
  return {};
}

const LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);
const LOGO_MAX_BYTES = 1_000_000;

async function storeLogo(orgId: string, file: File) {
  if (!LOGO_MIMES.has(file.type)) throw new Error(logo.invalidType);
  if (file.size > LOGO_MAX_BYTES) throw new Error(logo.fileTooLarge);
  return storeFile({
    orgId,
    filename: file.name || 'logo',
    mime: file.type,
    data: Buffer.from(await file.arrayBuffer()),
  });
}

export async function uploadOrgLogoAction(formData: FormData) {
  const ctx = await requireAdmin();
  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) return;
  const stored = await storeLogo(ctx.orgId, file);
  const org = await db.organization.update({
    where: { id: ctx.orgId },
    data: { logoFileId: stored.id },
    select: { name: true, logoFileId: true, onboardedAt: true },
  });
  revalidateOrgNav(ctx.orgId);
  await writeOrgNavCookie(org);
  revalidatePath('/settings');
}

export async function removeOrgLogoAction() {
  const ctx = await requireAdmin();
  const org = await db.organization.update({
    where: { id: ctx.orgId },
    data: { logoFileId: null },
    select: { name: true, logoFileId: true, onboardedAt: true },
  });
  revalidateOrgNav(ctx.orgId);
  await writeOrgNavCookie(org);
  revalidatePath('/settings');
}

/** The brand kit (lib/brand.ts): saved as given, less anything it doesn't recognize. */
export async function saveBrandKitAction(input: unknown) {
  const ctx = await requireAdmin();
  const brand = readBrand(input);
  const org = await db.organization.update({
    where: { id: ctx.orgId },
    data: { brand: isDefaultBrand(brand) ? Prisma.DbNull : brand },
    select: { slug: true },
  });
  revalidatePath('/settings');
  revalidatePath(`/careers/${org.slug}`, 'layout');
}

export async function uploadPostingLogoAction(postingId: string, formData: FormData) {
  const ctx = await requireSession();
  requireRecruitingAccess(ctx);
  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) return;
  await savePostingLogo(ctx, postingId, file);
}

export async function removePostingLogoAction(postingId: string) {
  const ctx = await requireSession();
  requireRecruitingAccess(ctx);
  await savePostingLogo(ctx, postingId, null);
}

async function savePostingLogo(ctx: Awaited<ReturnType<typeof requireSession>>, postingId: string, file: File | null) {
  await db.$transaction(async (tx) => {
    const posting = await lockPostingForEdit(tx, ctx, postingId);
    if (!posting) throw new Error('Vaga não encontrada.');
    if (!mayEditPostingDetails(ctx, posting.state, posting.org.requirePostingApproval)) {
      throw new Error('Somente administradores podem editar vagas publicadas quando a aprovação está ativa.');
    }
    const logo = file ? await storeLogo(ctx.orgId, file) : null;
    await tx.posting.update({ where: { id: posting.id }, data: { logoFileId: logo?.id ?? null } });
  });
  revalidatePath(`/postings/${postingId}`);
}

export async function setRequirePostingApprovalAction(enabled: boolean) {
  const ctx = await requireAdmin();
  await db.organization.update({
    where: { id: ctx.orgId },
    data: { requirePostingApproval: enabled },
  });
}

export async function setRequireOfferApprovalAction(enabled: boolean) {
  const ctx = await requireAdmin();
  await db.organization.update({
    where: { id: ctx.orgId },
    data: { requireOfferApproval: enabled },
  });
}

export async function setAutoScheduleOnInterviewStagesAction(enabled: boolean) {
  const ctx = await requireAdmin();
  await db.organization.update({
    where: { id: ctx.orgId },
    data: { autoScheduleOnInterviewStages: enabled },
  });
}

export async function createReportScheduleAction(formData: FormData) {
  const ctx = await requireAdmin();
  const cadence = String(formData.get('cadence') ?? 'WEEKLY') === 'DAILY' ? 'DAILY' : 'WEEKLY';
  const recipients = String(formData.get('recipients') ?? '')
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
    .slice(0, 20);
  if (!recipients.length) return;
  await db.reportSchedule.create({
    data: { orgId: ctx.orgId, cadence, recipients, createdById: ctx.userId },
  });
  revalidatePath('/reports');
}

export async function deleteReportScheduleAction(scheduleId: string) {
  const ctx = await requireAdmin();
  await db.reportSchedule.deleteMany({ where: { id: scheduleId, orgId: ctx.orgId } });
  revalidatePath('/reports');
}

export async function addScorecardQuestionAction(formData: FormData) {
  const ctx = await requireAdmin();
  const label = String(formData.get('label') ?? '').trim().slice(0, 200);
  const kind = String(formData.get('kind') ?? 'RATING') === 'TEXT' ? 'TEXT' : 'RATING';
  if (!label) return;
  const last = await db.scorecardQuestion.findFirst({
    where: { orgId: ctx.orgId },
    orderBy: { order: 'desc' },
  });
  await db.scorecardQuestion.create({
    data: { orgId: ctx.orgId, label, kind, order: (last?.order ?? -1) + 1 },
  });
  revalidatePath('/settings');
}

export async function archiveScorecardQuestionAction(questionId: string) {
  const ctx = await requireAdmin();
  await db.scorecardQuestion.updateMany({
    where: { id: questionId, orgId: ctx.orgId, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  revalidatePath('/settings');
}
