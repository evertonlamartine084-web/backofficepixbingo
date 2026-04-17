import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SkinColorFieldProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

export function SkinColorField({ label, value, onChange }: SkinColorFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground min-w-[100px]">{label}</Label>
      <div
        className="w-7 h-7 rounded border border-border flex-shrink-0"
        style={{ backgroundColor: value }}
      />
      <Input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-8 p-0.5 cursor-pointer bg-secondary border-border"
      />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 h-8 text-xs font-mono bg-secondary border-border"
        maxLength={7}
      />
    </div>
  );
}
