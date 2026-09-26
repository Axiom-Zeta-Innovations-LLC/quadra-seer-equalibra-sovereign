
import React from 'react';

const TypingIndicator: React.FC = () => {
    return (
        <div className="flex items-center gap-3 px-4 py-2 bg-black/40 border border-white/5 rounded-full animate-in fade-in">
            <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-bounce"></div>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--color-primary)] opacity-70">Reasoning...</span>
        </div>
    );
};

export default TypingIndicator;
