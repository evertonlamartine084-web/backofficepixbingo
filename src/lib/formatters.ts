/** Formata número como moeda BRL (R$ 1.234,56) */
export function formatBRL(val: number | null | undefined): string {
  if (val === null || val === undefined || typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Converte string de moeda BRL ou número para number */
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

/** Parse lista de CPFs separados por vírgula, newline, ponto-e-vírgula ou espaço */
export function parseCPFList(text: string): string[] {
  return text
    .split(/[\n,;\s]+/)
    .map(s => s.replace(/\D/g, ''))
    .filter(s => s.length >= 11)
    .map(s => s.slice(0, 11));
}
