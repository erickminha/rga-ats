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
