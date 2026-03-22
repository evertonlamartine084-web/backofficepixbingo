import { describe, it, expect } from 'vitest';
import {
  formatBRL, parseBRL, maskCPF, formatCPF,
  formatDateTime, formatDateAPI, parseCPFList,
} from './formatters';

describe('formatBRL', () => {
  it('formata número positivo', () => {
    expect(formatBRL(1234.5)).toBe('R$\u00a01.234,50');
  });

  it('formata zero', () => {
    expect(formatBRL(0)).toBe('R$\u00a00,00');
  });

  it('formata número negativo', () => {
    expect(formatBRL(-50)).toContain('50,00');
  });

  it('retorna R$ 0,00 para null', () => {
    expect(formatBRL(null)).toBe('R$ 0,00');
  });

  it('retorna R$ 0,00 para undefined', () => {
    expect(formatBRL(undefined)).toBe('R$ 0,00');
  });

  it('retorna R$ 0,00 para NaN', () => {
    expect(formatBRL(NaN)).toBe('R$ 0,00');
  });

  it('formata número grande corretamente', () => {
    const result = formatBRL(1000000);
    expect(result).toContain('1.000.000');
  });

  it('formata centavos corretamente', () => {
    const result = formatBRL(0.01);
    expect(result).toContain('0,01');
  });

  it('formata número com muitas decimais', () => {
    const result = formatBRL(10.999);
    // toLocaleString rounds to 2 decimals
    expect(result).toContain('11,00');
  });
});

describe('parseBRL', () => {
  it('retorna número direto', () => {
    expect(parseBRL(42)).toBe(42);
  });

  it('converte formato brasileiro "1.000,50"', () => {
    expect(parseBRL('1.000,50')).toBe(1000.5);
  });

  it('converte formato com vírgula "1000,50"', () => {
    expect(parseBRL('1000,50')).toBe(1000.5);
  });

  it('converte formato decimal "10.00"', () => {
    expect(parseBRL('10.00')).toBe(10);
  });

  it('converte string com R$', () => {
    expect(parseBRL('R$ 3.380,71')).toBe(3380.71);
  });

  it('retorna 0 para null', () => {
    expect(parseBRL(null)).toBe(0);
  });

  it('retorna 0 para objeto', () => {
    expect(parseBRL({})).toBe(0);
  });

  it('retorna 0 para string vazia', () => {
    expect(parseBRL('')).toBe(0);
  });

  it('retorna 0 para undefined', () => {
    expect(parseBRL(undefined)).toBe(0);
  });

  it('retorna 0 para boolean', () => {
    expect(parseBRL(true)).toBe(0);
  });

  it('converte string simples "50"', () => {
    expect(parseBRL('50')).toBe(50);
  });
});

describe('maskCPF', () => {
  it('mascara CPF válido', () => {
    expect(maskCPF('12345678900')).toBe('123.***.***-00');
  });

  it('mascara CPF com formatação', () => {
    expect(maskCPF('123.456.789-00')).toBe('123.***.***-00');
  });

  it('retorna — para string vazia', () => {
    expect(maskCPF('')).toBe('—');
  });

  it('retorna original se não tem 11 dígitos', () => {
    expect(maskCPF('12345')).toBe('12345');
  });
});

describe('formatCPF', () => {
  it('formata CPF com pontos e traço', () => {
    expect(formatCPF('12345678900')).toBe('123.456.789-00');
  });

  it('formata CPF já com formatação', () => {
    expect(formatCPF('123.456.789-00')).toBe('123.456.789-00');
  });

  it('retorna — para string vazia', () => {
    expect(formatCPF('')).toBe('—');
  });

  it('retorna original se não tem 11 dígitos', () => {
    expect(formatCPF('1234')).toBe('1234');
  });
});

describe('formatDateTime', () => {
  it('formata data ISO', () => {
    const result = formatDateTime('2024-03-15T14:30:00Z');
    expect(result).toContain('15/03/2024');
    expect(result).toContain(':');
  });

  it('retorna — para null', () => {
    expect(formatDateTime(null)).toBe('—');
  });

  it('retorna — para undefined', () => {
    expect(formatDateTime(undefined)).toBe('—');
  });

  it('retorna — para string vazia', () => {
    expect(formatDateTime('')).toBe('—');
  });

  it('retorna string original para data inválida', () => {
    expect(formatDateTime('não é data')).toBe('não é data');
  });
});

describe('formatDateAPI', () => {
  it('formata data como dd/mm/yyyy', () => {
    const d = new Date(2024, 2, 15); // March 15, 2024
    expect(formatDateAPI(d)).toBe('15/03/2024');
  });

  it('pad com zeros', () => {
    const d = new Date(2024, 0, 5); // Jan 5, 2024
    expect(formatDateAPI(d)).toBe('05/01/2024');
  });
});

describe('parseCPFList', () => {
  it('separa por vírgula', () => {
    expect(parseCPFList('12345678900,98765432100')).toEqual(['12345678900', '98765432100']);
  });

  it('separa por newline', () => {
    expect(parseCPFList('12345678900\n98765432100')).toEqual(['12345678900', '98765432100']);
  });

  it('separa por ponto-e-vírgula', () => {
    expect(parseCPFList('12345678900;98765432100')).toEqual(['12345678900', '98765432100']);
  });

  it('separa por espaço', () => {
    expect(parseCPFList('12345678900 98765432100')).toEqual(['12345678900', '98765432100']);
  });

  it('remove CPFs com menos de 11 dígitos', () => {
    expect(parseCPFList('12345,12345678900')).toEqual(['12345678900']);
  });

  it('limpa formatação dos CPFs', () => {
    expect(parseCPFList('123.456.789-00')).toEqual(['12345678900']);
  });

  it('retorna array vazio para texto sem CPFs', () => {
    expect(parseCPFList('abc def')).toEqual([]);
  });

  it('trunca dígitos extras para 11', () => {
    expect(parseCPFList('123456789001234')).toEqual(['12345678900']);
  });

  it('lida com separadores mistos', () => {
    expect(parseCPFList('12345678900,98765432100\n11122233344')).toEqual([
      '12345678900', '98765432100', '11122233344',
    ]);
  });

  it('retorna array vazio para string vazia', () => {
    expect(parseCPFList('')).toEqual([]);
  });

  it('remove duplicatas não são tratadas (mantém duplicatas)', () => {
    expect(parseCPFList('12345678900,12345678900')).toEqual([
      '12345678900', '12345678900',
    ]);
  });
});
