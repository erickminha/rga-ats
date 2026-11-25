import { describe, expect, it } from 'vitest';
import { approvedForMessage, makeAd, messageFor, whatsappPhone } from '@/lib/rga-productivity';
describe('Divulgação e comunicação RGA', () => {
  it('gera anúncio com informações registradas e não inventa empresa ou link', () => {
    const text = makeAd({ title: 'Auxiliar', brand: 'RGA', location: null, workplaceType: 'ONSITE', commitment: 'FULL_TIME', salaryMin: null, salaryMax: null, salaryCurrency: null, content: { description: 'Atendimento', advertisement: { benefits: 'Vale-transporte' }, requirements: ['Excel'] }, publicCompany: null, publicUrl: null });
    expect(text).toContain('Benefícios: Vale-transporte'); expect(text).toContain('Excel'); expect(text).not.toContain('Remuneração:'); expect(text).not.toContain('Empresa:'); expect(text).toContain('Prévia interna');
  });
  it('permite mensagem de aprovação somente com contratação ou retorno vigente do cliente', () => {
    expect(approvedForMessage('ACTIVE','a',[{status:'APPROVED',clientId:'a'}])).toBe(true);
    expect(approvedForMessage('ACTIVE','b',[{status:'APPROVED',clientId:'a'}])).toBe(false);
    expect(approvedForMessage('ACTIVE','a',[{status:'APPROVED',clientId:'a'},{status:'WAIT',clientId:'a'}])).toBe(false);
    expect(approvedForMessage('HIRED',null,null)).toBe(true);
  });
  it('formata telefone e não inventa data de entrevista', () => {
    expect(whatsappPhone('(92) 99999-0000')).toBe('5592999990000');
    expect(whatsappPhone('123')).toBeNull();
    expect(messageFor('interview', {name:'Pessoa',job:'Auxiliar',brand:'RGA'})).toContain('Vamos combinar');
    expect(messageFor('documents', {name:'Pessoa',job:'Auxiliar',brand:'RGA'})).toContain('canal seguro');
  });
});
