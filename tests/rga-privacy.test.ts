import { createServer } from 'node:net';
import { mkdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import type { SessionContext } from '@/lib/session';
import { reserveRequest } from '@/server/request-limit';
import { processRetention, eraseCandidateData, setRetentionHold } from '@/server/retention';
import { fileStorageAvailable, storeFile } from '@/server/storage';
import { addTranscript } from '@/server/transcripts';
import { scanUpload } from '@/server/file-scan';
import { createRecruitingShare, resolveShare, revokeRecruitingShares } from '@/server/share-links';
import { GET as emails } from '@/app/api/cron/emails/route';
import { GET as imports } from '@/app/api/cron/imports/route';
import { GET as newsletters } from '@/app/api/cron/newsletters/route';
import { GET as ocr } from '@/app/api/cron/ocr/route';
import { GET as resumeParse } from '@/app/api/cron/resume-parse/route';
import { GET as resumeText } from '@/app/api/cron/resume-text/route';
import { GET as retention } from '@/app/api/cron/retention/route';
import { GET as transcripts } from '@/app/api/cron/transcripts/route';
import { GET as webhooks } from '@/app/api/cron/webhooks/route';
import { candidate, createOrg } from './fixtures';
import { hasDb } from './setup';

afterEach(() => vi.unstubAllEnvs());

describe('environment controls', () => {
  it('rejects every hosted cron without a secret and rejects a wrong bearer', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_SECRET', undefined);
    const routes = [emails, imports, newsletters, ocr, resumeParse, resumeText, retention, transcripts, webhooks];
    for (const route of routes) {
      expect((await route(new Request('https://ats.example.invalid/api/cron/test'))).status).toBe(401);
    }
    vi.stubEnv('CRON_SECRET', 'synthetic-cron');
    for (const route of routes) {
      expect((await route(new Request('https://ats.example.invalid/api/cron/test', {
        headers: { authorization: 'Bearer invalid' },
      }))).status).toBe(401);
    }
  });

  it('fails closed in production even if a legacy Blob token is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('S3_BUCKET', undefined);
    vi.stubEnv('FILE_SCAN_HOST', undefined);
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test');
    expect(fileStorageAvailable()).toBe(false);
    await expect(scanUpload(Buffer.from('fixture'))).rejects.toThrow('FILE_SCAN_NOT_CONFIGURED');
  });

  it.each([['stream: OK\0', true], ['stream: Synthetic FOUND\0', false]])(
    'requires an explicit clean verdict from the private scanner', async (reply, clean) => {
      const server = createServer((socket) => socket.once('data', () => socket.end(reply)));
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Local test listener unavailable');
      vi.stubEnv('FILE_SCAN_HOST', address.address);
      vi.stubEnv('FILE_SCAN_PORT', String(address.port));
      try {
        const scanned = scanUpload(Buffer.from('Currículo fictício'));
        if (clean) await expect(scanned).resolves.toBeUndefined();
        else await expect(scanned).rejects.toThrow('FILE_SCAN_REJECTED');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );
});

describe.skipIf(!hasDb)('data integrity controls', () => {
  it('enforces limits atomically without letting one email exhaust another identity', async () => {
    const scope = randomUUID();
    const identity = ['local-org', 'test@example.invalid'];
    const results = await Promise.all(Array.from({ length: 12 }, () => reserveRequest(scope, identity, 3, 60_000)));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await reserveRequest(scope, ['local-org', 'new@example.invalid'], 3, 60_000)).toBe(true);
    expect(await reserveRequest(scope, ['other-org', identity[1]], 3, 60_000)).toBe(true);
  });

  it('stores share fingerprints, enforces privileges and applies expiry and revocation', async () => {
    const { org, admin, stages } = await createOrg();
    const { opportunity } = await candidate(org.id, stages, [[0, 1]]);
    const ctx: SessionContext = { orgId: org.id, userId: admin.id, accessRole: 'TEAM_MEMBER' };
    expect(await createRecruitingShare({ ...ctx, accessRole: 'INTERVIEWER' }, 'candidate', opportunity.id)).toHaveProperty('error');
    const share = await createRecruitingShare(ctx, 'candidate', opportunity.id);
    expect(share).toHaveProperty('code');
    if (!share.code) throw new Error('Share not created');
    const row = await db.shareLink.findFirstOrThrow({ where: { orgId: org.id, targetId: opportunity.id } });
    expect(row.code).toMatch(/^[a-f0-9]{64}$/);
    expect(row.code).not.toBe(share.code);
    expect(await resolveShare(share.code)).toMatchObject({ id: opportunity.id });
    await expect(revokeRecruitingShares({ ...ctx, accessRole: 'LIMITED_TEAM_MEMBER' }, 'candidate', opportunity.id)).rejects.toThrow();
    expect(await revokeRecruitingShares(ctx, 'candidate', opportunity.id)).toBe(1);
    expect(await resolveShare(share.code)).toBeNull();
    const expiring = await createRecruitingShare(ctx, 'candidate', opportunity.id);
    await db.shareLink.updateMany({ where: { orgId: org.id, revokedAt: null }, data: { expiresAt: new Date(0) } });
    expect(await resolveShare(expiring.code!)).toBeNull();
    await db.opportunity.update({ where: { id: opportunity.id }, data: { confidential: true } });
    expect(await createRecruitingShare(ctx, 'candidate', opportunity.id)).toHaveProperty('error');
    const events = await db.event.findMany({ where: { orgId: org.id, subjectId: opportunity.id } });
    expect(events.map((event) => event.verb)).toContain('share.revoked');
    expect(JSON.stringify(events)).not.toContain(share.code);
  });

  it('redacts related data and retries failed physical deletion without restoring access', async () => {
    const { org, admin, stages } = await createOrg();
    const marker = 'marcador fictício';
    const { contact, opportunity } = await candidate(org.id, stages, [[0, 1]], { status: 'ARCHIVED', emails: ['fixture@example.invalid'] });
    const ctx: SessionContext = { orgId: org.id, userId: admin.id, accessRole: 'SUPER_ADMIN' };
    const file = await storeFile({ orgId: org.id, filename: 'fixture.txt', mime: 'text/plain', data: Buffer.from(marker) });
    await db.contact.update({ where: { id: contact.id }, data: { resumeFileId: file.id, resumeText: marker } });
    await db.opportunity.update({ where: { id: opportunity.id }, data: { applicationResumeId: file.id, customFields: { note: marker } } });
    await db.note.create({ data: { orgId: org.id, authorId: admin.id, opportunityId: opportunity.id, body: marker } });
    await db.emailMessage.create({
      data: { orgId: org.id, opportunityId: opportunity.id, toEmail: contact.emails[0], subject: marker, body: marker },
    });
    const share = await createRecruitingShare(ctx, 'candidate', opportunity.id);
    const event = await db.event.create({
      data: { orgId: org.id, verb: 'candidate.test', actorType: 'system', subjectType: 'contact', subjectId: contact.id, payload: { note: marker } },
    });
    const blockedPath = path.join(process.cwd(), '.data', 'uploads', file.key);
    await unlink(blockedPath);
    await mkdir(blockedPath); // unlink refuses directories
    await db.storedFile.update({ where: { id: file.id }, data: { contactId: contact.id } });
    try {
      await setRetentionHold(ctx, contact.id, true);
      expect(await eraseCandidateData(ctx, contact.id)).toBe(false);
      await setRetentionHold(ctx, contact.id, false);
      expect(await eraseCandidateData(ctx, contact.id)).toBe(true);
      expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({
        isAnonymized: true, resumeFileId: null, resumeText: null, emails: [],
      });
      expect(await db.opportunity.findUnique({ where: { id: opportunity.id } })).toMatchObject({
        applicationResumeId: null, customFields: null, status: 'ARCHIVED',
      });
      expect(await db.note.count({ where: { opportunityId: opportunity.id } })).toBe(0);
      expect(await db.emailMessage.count({ where: { opportunityId: opportunity.id } })).toBe(0);
      expect(await db.event.findUnique({ where: { id: event.id } })).toMatchObject({ payload: null });
      expect(await resolveShare(share.code!)).toBeNull();
      await expect(db.opportunity.update({ where: { id: opportunity.id }, data: { status: 'ACTIVE' } })).rejects.toThrow();
      await expect(addTranscript(ctx, { opportunityId: opportunity.id, title: 'Fixture', content: marker })).rejects.toThrow();
      const pending = await db.storedFile.findUniqueOrThrow({ where: { id: file.id } });
      expect(pending.deletePendingAt).toBeInstanceOf(Date);
      expect(await db.storedFile.findFirst({ where: { id: file.id, deletePendingAt: null } })).toBeNull();

      await rmdir(blockedPath);
      await writeFile(blockedPath, marker);
      await db.storedFile.update({ where: { id: file.id }, data: { deletePendingAt: new Date(0) } });
      await processRetention();
      expect(await db.storedFile.findUnique({ where: { id: file.id } })).toBeNull();
    } finally {
      await rmdir(blockedPath).catch(() => undefined);
    }
  });

  it('never erases a candidate whose selection has reactivated', async () => {
    const { org, admin, stages } = await createOrg();
    const { contact, opportunity } = await candidate(org.id, stages, [[0, 1]], { status: 'ARCHIVED' });
    const ctx: SessionContext = { orgId: org.id, userId: admin.id, accessRole: 'SUPER_ADMIN' };
    let signalLocked!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const proceed = new Promise<void>((resolve) => { release = resolve; });
    const activating = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${contact.id} FOR NO KEY UPDATE`;
      signalLocked();
      await proceed;
      await tx.opportunity.update({ where: { id: opportunity.id }, data: { status: 'ACTIVE' } });
    });
    await locked;
    const erasing = eraseCandidateData(ctx, contact.id);
    release();
    await activating;
    expect(await erasing).toBe(false);
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({ isAnonymized: false });
  });
});
