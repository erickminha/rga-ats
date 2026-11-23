import { describe, expect, it } from 'vitest';
import { cnpjKey, companyNameKey, maskCnpj, maskPhone, maskPostalCode, parseCompany, validCnpj } from '@/lib/client-company';

function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

describe('client company fields', () => {
  it('masks and validates numeric and alphanumeric CNPJs', () => {
    expect(maskCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(maskCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');
    expect(validCnpj(cnpjKey('12.ABC.345/01DE-35'))).toBe(true);
    expect(validCnpj(cnpjKey('11.222.333/0001-81'))).toBe(true);
    expect(validCnpj('00000000000000')).toBe(false);
    expect(validCnpj('11222333000180')).toBe(false);
  });

  it('normalizes Brazilian phones and CEP, accepting an optional +55 prefix', () => {
    expect(maskPhone('+55 (11) 91234-5678')).toBe('(11) 91234-5678');
    expect(maskPhone('1134567890')).toBe('(11) 3456-7890');
    expect(maskPhone('08001234567')).toBe('0800 123 4567');
    expect(maskPostalCode('01234567')).toBe('01234-567');
    expect(parseCompany(form({ name: 'Empresa fictícia', phone: '+55 (11) 91234-5678', postalCode: '01234-567' })))
      .toMatchObject({ phone: '11912345678', postalCode: '01234567' });
  });

  it('requires only an identifying name and rejects invalid optional data', () => {
    expect(parseCompany(form({ legalName: 'Empresa fictícia Ltda.' })))
      .toMatchObject({ name: 'Empresa fictícia Ltda.', cnpj: null, active: true });
    expect(() => parseCompany(form({}))).toThrow(/nome fantasia/);
    for (const [key, value] of [['cnpj', '123'], ['postalCode', '1234'], ['phone', '999'], ['state', 'ZZ'], ['website', 'javascript:alert(1)'], ['email', 'invalido']]) {
      expect(() => parseCompany(form({ name: 'Empresa fictícia', [key]: value }))).toThrow();
    }
    expect(parseCompany(form({ name: 'Empresa fictícia', website: 'empresa.example' })).website).toBe('https://empresa.example/');
    expect(companyNameKey('  Fíctícia    Ltda  ')).toBe('ficticia ltda');
  });
});
