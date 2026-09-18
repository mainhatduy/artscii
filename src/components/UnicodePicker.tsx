import { useState } from 'react';
import { Sparkles, Trash2, Plus, RefreshCw } from 'lucide-react';

export interface UnicodeCategory {
  id: string;
  name: string;
  chars: string[];
}

export const UNICODE_CATEGORIES: UnicodeCategory[] = [
  {
    id: 'blocks',
    name: 'Blocks',
    chars: ['█', '▓', '▒', '░', '▀', '▄', '▌', '▐', '▖', '▗', '▘', '▙', '▚', '▛', '▜', '▝', '▞', '▟', '▪', '▫', '▬', '▮'],
  },
  {
    id: 'box',
    name: 'Box & Lines',
    chars: ['─', '│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼', '═', '║', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬', '╭', '╮', '╯', '╰', '╱', '╲', '╳'],
  },
  {
    id: 'shapes',
    name: 'Shapes',
    chars: ['▲', '▼', '◄', '►', '◆', '◇', '◈', '◉', '◊', '○', '●', '◐', '◑', '◒', '◓', '■', '□', '⬡', '⬢', '⬣', '◯'],
  },
  {
    id: 'stars',
    name: 'Stars & Flora',
    chars: ['★', '☆', '✦', '✧', '✪', '✫', '✬', '✭', '✮', '✯', '✰', '✱', '✲', '✳', '✴', '✵', '✶', '✷', '✸', '✹', '✺', '✻', '✼', '✽', '✿', '❀', '❂', '❃', '❖'],
  },
  {
    id: 'arrows',
    name: 'Arrows',
    chars: ['←', '↑', '→', '↓', '↔', '↕', '↖', '↗', '↘', '↙', '↺', '↻', '⇄', '⇆', '➔', '➜', '➤', '⇦', '⇧', '⇨', '⇩', '➶', '➳'],
  },
  {
    id: 'braille',
    name: 'Braille',
    chars: ['⠁', '⠃', '⠇', '⡇', '⣇', '⣧', '⣷', '⣿', '⠛', '⠋', '⠙', '⠚', '⠒', '⠔', '⠢', '⠖', '⠲', '⠦', '⠿', '⠾', '⠽'],
  },
  {
    id: 'math',
    name: 'Math',
    chars: ['∑', '∏', 'π', '∞', '√', '∫', '≈', '≠', '≤', '≥', '±', '×', '÷', '⊕', '⊗', '⊥', '∇', '∂', '∈', '∉', '∩', '∪', '⊂', '⊃', '≡', '‰'],
  },
  {
    id: 'symbols',
    name: 'Symbols',
    chars: ['♠', '♣', '♥', '♦', '♪', '♫', '♭', '♯', '☀', '☁', '☂', '⚡', '☯', '☮', '☘', '☠', '♨', '✈', '✉', '✎', '✂', '©', '®', '™'],
  },
];

interface UnicodePickerProps {
  characters: string;
  onChange: (characters: string) => void;
  maxChars?: number;
}

export function UnicodePicker({ characters, onChange, maxChars = 150 }: UnicodePickerProps) {
  const [activeCategory, setActiveCategory] = useState<string>(UNICODE_CATEGORIES[0].id);

  const currentCategory = UNICODE_CATEGORIES.find(c => c.id === activeCategory) || UNICODE_CATEGORIES[0];
  const charArray = Array.from(characters);

  const toggleChar = (char: string) => {
    if (charArray.includes(char)) {
      const next = charArray.filter(c => c !== char).join('');
      onChange(next);
    } else {
      if (charArray.length >= maxChars) return;
      onChange(characters + char);
    }
  };

  const addAllFromCategory = () => {
    const existing = new Set(charArray);
    const toAdd = currentCategory.chars.filter(c => !existing.has(c));
    const combined = [...charArray, ...toAdd].slice(0, maxChars).join('');
    onChange(combined);
  };

  const replaceWithCategory = () => {
    onChange(currentCategory.chars.slice(0, maxChars).join(''));
  };

  const clearAll = () => {
    onChange('');
  };

  return (
    <div className="unicode-picker">
      <div className="unicode-picker-header">
        <span className="unicode-picker-title">
          <Sparkles size={11} /> UNICODE PALETTE
        </span>
        <span className="unicode-count">
          {charArray.length}/{maxChars}
        </span>
      </div>

      <div className="unicode-tabs" role="tablist" aria-label="Unicode Categories">
        {UNICODE_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            role="tab"
            aria-selected={activeCategory === cat.id}
            className={`unicode-tab ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
            type="button"
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="unicode-grid" role="group" aria-label={`${currentCategory.name} characters`}>
        {currentCategory.chars.map(c => {
          const isSelected = charArray.includes(c);
          return (
            <button
              key={c}
              type="button"
              className={`unicode-char-btn ${isSelected ? 'active' : ''}`}
              title={isSelected ? `Remove '${c}'` : `Add '${c}'`}
              aria-pressed={isSelected}
              onClick={() => toggleChar(c)}
            >
              {c}
            </button>
          );
        })}
      </div>

      <div className="unicode-actions">
        <button
          type="button"
          className="unicode-action-btn"
          onClick={addAllFromCategory}
          title="Add all characters in this category"
        >
          <Plus size={11} /> Add all
        </button>
        <button
          type="button"
          className="unicode-action-btn"
          onClick={replaceWithCategory}
          title="Use only this category"
        >
          <RefreshCw size={11} /> Use set
        </button>
        <button
          type="button"
          className="unicode-action-btn danger"
          onClick={clearAll}
          title="Clear all characters"
        >
          <Trash2 size={11} /> Clear
        </button>
      </div>
    </div>
  );
}
