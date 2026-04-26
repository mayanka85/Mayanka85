import React from 'react';
import { SearchResult } from '../types';
import { format } from 'date-fns';
import { Clock, Search } from 'lucide-react';

interface SearchHistoryProps {
  history: SearchResult[];
  onSelect: (result: SearchResult) => void;
}

export const SearchHistory: React.FC<SearchHistoryProps> = ({ history, onSelect }) => {
  return (
    <div className="space-y-3">
      <h3 className="font-heading italic text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary" /> Recent Lookups
      </h3>
      {history.length === 0 ? (
        <div className="text-xs text-muted-foreground italic p-6 border-2 border-dashed border-border rounded-2xl bg-muted/30">
          No recent searches found.
        </div>
      ) : (
        history.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="w-full text-left p-4 border-2 border-border rounded-2xl hover:border-primary hover:bg-card hover:shadow-md transition-all group relative overflow-hidden bg-card/50"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-mono font-bold text-foreground truncate pr-2">{item.query}</span>
              <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                {item.timestamp?.toDate ? format(item.timestamp.toDate(), 'HH:mm') : 'Just now'}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground truncate opacity-70 group-hover:opacity-100 transition-opacity leading-relaxed">
              {item.result.summary[0]}
            </div>
          </button>
        ))
      )}
    </div>
  );
};
