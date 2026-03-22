/** Formata número como moeda BRL (R$ 1.234,56) */
export function formatBRL(val: number | null | undefined): string {
  if (val === null || val === undefined || typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Converte string de moeda BRL ou número para number */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseBRL(val: any): number {
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return 0;
  const cleaned = val.replace(/[R$\s]/g, '').trim();
  // "1.000,50" → 1000.50
  if (cleaned.includes('.') && cleaned.includes(',')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // "1000,50" → 1000.50
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.')) || 0;
  }
  // "10.00" or "130.00"
  return parseFloat(cleaned) || 0;
}

/** Mascara CPF: 123.456.789-00 → 123.***.***-00 */
export function maskCPF(cpf: string): string {
  if (!cpf) return '—';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}.***.***-${clean.slice(9)}`;
  }
  return cpf;
}

/** Formata CPF completo: 12345678900 → 123.456.789-00 */
export function formatCPF(cpf: string): string {
  if (!cpf) return '—';
  const s = cpf.replace(/\D/g, '');
  if (s.length === 11) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
  return cpf;
}

/** Formata data para exibição (dd/mm/yyyy HH:mm) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatDateTime(val: any): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(val);
  }
}

/** Formata data para envio à API (dd/mm/yyyy) */
export function formatDateAPI(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Valida CPF com checksum (algoritmo padrão brasileiro) */
export function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += parseInt(digits[i]) * (t + 1 - i);
    const remainder = (sum * 10) % 11;
    if ((remainder === 10 ? 0 : remainder) !== parseInt(digits[t])) return false;
  }
  return true;
}

/** Parse lista de CPFs separados por vírgula, newline, ponto-e-vírgula ou espaço */
export function parseCPFList(text: string): string[] {
  return text
    .split(/[\n,;\s]+/)
    .map(s => s.replace(/\D/g, ''))
    .filter(s => s.length >= 11)
    .map(s => s.slice(0, 11));
}
