import { describe, expect, it } from 'vitest';
import { discDate, externalDiscLink, externalDiscResult, reusableDisc } from '@/lib/talent-disc';

function form() {
  const f=new FormData();
  f.set('date','2026-01-01'); f.set('validUntil','2026-12-31'); f.set('profile','D/I');
  return f;
}
describe('registro externo DISC',()=>{
  it('preserva perfil e escala sem inferir pontuação',()=>{
    const f=form(); f.set('scaleMin','0'); f.set('scaleMax','100');
    for(const a of ['D','I','S','C'])f.set(a,'55');
    expect(externalDiscResult(f,'Fornecedor','2026-11-26').result).toMatchObject({instrument:'Fornecedor',profile:'D/I',D:'55',complete:true});
    f.set('D','101'); expect(()=>externalDiscResult(f,'Fornecedor','2026-11-26')).toThrow();
    f.set('D',''); expect(()=>externalDiscResult(f,'Fornecedor','2026-11-26')).toThrow();
  });
  it('aceita resultado qualitativo e valida data',()=>{
    expect(externalDiscResult(form(),'Fornecedor','2026-11-26').result.D).toBe('');
    expect(()=>discDate('2026-02-30')).toThrow();
    expect(()=>externalDiscResult(form(),'Fornecedor','2025-01-01')).toThrow();
  });
  it('rejeita links não HTTPS e credenciais',()=>{
    expect(externalDiscLink('https://example.invalid/test')).toBe('https://example.invalid/test');
    expect(()=>externalDiscLink('javascript:alert(1)')).toThrow();
    expect(()=>externalDiscLink('https://user:pass@example.invalid')).toThrow();
  });
  it('exige validade comprovada e respeita limite configurado',()=>{
    expect(reusableDisc(null,'2026-01-01','2026-11-26')).toBe(false);
    expect(reusableDisc(discDate('2026-12-31'),'2026-01-01','2026-11-26')).toBe(true);
    expect(reusableDisc(discDate('2026-12-31'),'2026-01-01','2026-11-26',30)).toBe(false);
    expect(reusableDisc(discDate('2026-10-01'),'2026-01-01','2026-11-26')).toBe(false);
  });
});

import { hasDb } from './setup';
import { createOrg } from './fixtures';
import { db } from '@/lib/db';
import { createTalentDisc, changeTalentDisc, reuseTalentDisc } from '@/server/talent-disc';

describe.skipIf(!hasDb)('Central DISC independente de vagas',()=>{
  it('registra sem participação, valida autorização, conclui e reutiliza apenas na seleção do titular',async()=>{
    const {org,admin,stages}=await createOrg();
    const {org:other}=await createOrg();
    const ctx={orgId:org.id,userId:admin.id,accessRole:'ADMIN'};
    const contact=await db.contact.create({data:{orgId:org.id,name:'Pessoa fictícia'}});
    const f=new FormData();
    f.set('instrument','Instrumento externo autorizado');f.set('authorization','Registro fictício');f.set('confirmed','on');
    f.set('externalUrl','https://example.invalid/avaliacao');
    await expect(createTalentDisc(ctx,contact.id,f,false)).rejects.toThrow();
    await db.consentRecord.create({data:{orgId:org.id,contactId:contact.id,purpose:'PROFILE_STORAGE'}});
    await expect(createTalentDisc({...ctx,orgId:other.id},contact.id,f,false)).rejects.toThrow();
    const id=await createTalentDisc(ctx,contact.id,f,false);
    expect(await db.opportunity.count({where:{contactId:contact.id}})).toBe(0);
    await expect(changeTalentDisc(ctx,contact.id,id,'sent',new FormData())).rejects.toThrow();
    const sent=new FormData();sent.set('sentConfirmed','on');
    await changeTalentDisc(ctx,contact.id,id,'sent',sent);
    const result=new FormData();result.set('date','2025-01-01');result.set('validUntil','2099-01-01');result.set('profile','D/I');result.set('reviewed','on');
    await changeTalentDisc(ctx,contact.id,id,'complete',result);
    expect(await db.talentDisc.findUnique({where:{id}})).toMatchObject({status:'COMPLETED',externalUrl:null,result:{profile:'D/I'}});
    const posting=await db.posting.create({data:{orgId:org.id,title:'Vaga fictícia',slug:'disc-externo'}});
    const opp=await db.opportunity.create({data:{orgId:org.id,contactId:contact.id,stageId:stages[0].id,postingId:posting.id}});
    const otherContact=await db.contact.create({data:{orgId:org.id,name:'Outra pessoa fictícia'}});
    const wrong=await db.opportunity.create({data:{orgId:org.id,contactId:otherContact.id,stageId:stages[0].id,postingId:posting.id}});
    const reuse=new FormData();reuse.set('opportunityId',wrong.id);reuse.set('purpose','Seleção fictícia');reuse.set('reuseConfirmed','on');
    await expect(reuseTalentDisc(ctx,contact.id,id,reuse)).rejects.toThrow();
    reuse.set('opportunityId',opp.id);
    await reuseTalentDisc(ctx,contact.id,id,reuse);
    expect(await db.recruitingAssessment.findUnique({where:{opportunityId:opp.id}})).toMatchObject({disc:{profile:'D/I',sourceTalentDiscId:id,complete:true}});
    await expect(reuseTalentDisc(ctx,contact.id,id,reuse)).rejects.toThrow();
  });
});
