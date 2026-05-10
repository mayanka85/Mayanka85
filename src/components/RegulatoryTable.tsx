import React from 'react';
import { ComparisonRow } from '../types';
import { Badge } from './ui/badge';

interface RegulatoryTableProps {
  rows: ComparisonRow[];
}

const getBadgeVariant = (type: string) => {
  switch (type) {
    case 'NO CHANGE': return 'outline';
    case 'MODIFIED': return 'secondary';
    case 'DELETED': return 'destructive';
    case 'NEW': return 'default';
    case 'DIVERGENCE': return 'destructive';
    case 'TRANSITIONAL': return 'secondary';
    default: return 'outline';
  }
};

export const RegulatoryTable: React.FC<RegulatoryTableProps> = ({ rows }) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  
  return (
    <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
      <div className="grid grid-cols-4 bg-muted/50 border-b border-border p-4">
        <div className="font-heading italic text-[11px] uppercase tracking-wider text-muted-foreground">Dimension</div>
        <div className="font-heading italic text-[11px] uppercase tracking-wider text-muted-foreground">CRR 575/2013</div>
        <div className="font-heading italic text-[11px] uppercase tracking-wider text-muted-foreground">PS01/2026</div>
        <div className="font-heading italic text-[11px] uppercase tracking-wider text-muted-foreground">Change Type</div>
      </div>
      <div className="divide-y divide-border">
        {safeRows.map((row, idx) => (
          <div key={idx} className="grid grid-cols-4 p-4 hover:bg-muted/30 transition-colors group">
            <div className="text-sm font-semibold text-foreground">{row.dimension}</div>
            <div className="text-xs font-mono text-foreground/70 pr-4 whitespace-pre-wrap">{row.crrValue}</div>
            <div className="text-xs font-mono text-foreground/70 pr-4 whitespace-pre-wrap">{row.psValue}</div>
            <div className="flex items-center">
              <Badge variant={getBadgeVariant(row.changeType) as any} className="text-[10px] px-2 py-0.5 rounded-full font-bold">
                {row.changeType}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
