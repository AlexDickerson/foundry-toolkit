import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  onAdd: (pc: { name: string; initiativeMod: number; maxHp: number }) => void;
  onClose: () => void;
}

export function AddPcPanel({ onAdd, onClose }: Props) {
  const [name, setName] = useState('');
  const [initMod, setInitMod] = useState('0');
  const [maxHp, setMaxHp] = useState('');

  const canSave = name.trim() !== '' && maxHp.trim() !== '';

  const handleSave = () => {
    if (!canSave) return;
    onAdd({
      name: name.trim(),
      initiativeMod: parseInt(initMod, 10) || 0,
      maxHp: Math.max(1, parseInt(maxHp, 10) || 1),
    });
    setName('');
    setInitMod('0');
    setMaxHp('');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
      <div style={{ flex: 1 }}>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</label>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="h-7 text-xs"
        />
      </div>
      <div style={{ width: 70 }}>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Init mod</label>
        <Input
          type="number"
          value={initMod}
          onChange={(e) => setInitMod(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="h-7 text-xs"
        />
      </div>
      <div style={{ width: 70 }}>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Max HP</label>
        <Input
          type="number"
          value={maxHp}
          onChange={(e) => setMaxHp(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="h-7 text-xs"
        />
      </div>
      <Button size="sm" onClick={handleSave} disabled={!canSave}>
        Add
      </Button>
      <Button size="sm" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
    </div>
  );
}
