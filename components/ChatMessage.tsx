
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Message, Role } from '../types';
import Icon from './Icon';
import Chart from 'chart.js/auto';

// Global mermaid variable from script tag
declare const mermaid: any;

const MarkdownRenderer = React.lazy(() => import('./MarkdownRenderer'));

const MermaidDiagram: React.FC<{ chart: string }> = ({ chart }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<boolean>(false);

    useEffect(() => {
        if (!chart) return;
        const render = async () => {
            try {
                mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
                const { svg } = await mermaid.render(id, chart);
                setSvg(svg);
                setError(false);
            } catch (err) {
                console.error("Mermaid Render Error:", err);
                setError(true);
            }
        };
        render();
    }, [chart]);

    if (error) return (
        <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-xl text-[10px] text-red-400 font-mono italic">
            [DIAGRAM_RENDER_FAILURE]: Structure corrupted.
        </div>
    );

    return (
        <div 
            ref={containerRef} 
            className="w-full flex justify-center bg-black/40 rounded-xl p-6 border border-white/5 overflow-x-auto" 
            dangerouslySetInnerHTML={{ __html: svg }} 
        />
    );
};

interface ChatMessageProps {
  message: Message;
  userAvatar: string;
  onSpeak?: (text: string) => void;
  isCurrentSpeaking?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, userAvatar, onSpeak, isCurrentSpeaking }) => {
    const chartCanvasRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);
    const [imgLoading, setImgLoading] = useState(true);

    const safeContent = typeof message.content === 'string' 
        ? message.content
            .replace(/```chart-data\s*[\s\S]*?```/g, '')
            .replace(/```mermaid\s*[\s\S]*?```/g, '')
            .trim()
        : '';

    useEffect(() => {
      if (message.chartData && chartCanvasRef.current) {
        if (chartInstance.current) { chartInstance.current.destroy(); }
        const styles = getComputedStyle(document.documentElement);
        const accentColor = styles.getPropertyValue('--color-accent').trim() || '#facc15';
        const primaryColor = styles.getPropertyValue('--color-primary').trim() || '#4ade80';

        try {
          chartInstance.current = new Chart(chartCanvasRef.current, {
            type: message.chartData.type || 'bar',
            data: {
              labels: message.chartData.labels || [],
              datasets: (message.chartData.datasets || []).map((ds, i) => ({
                ...ds,
                backgroundColor: ds.backgroundColor || (i === 0 ? `${accentColor}88` : `${primaryColor}88`),
                borderColor: ds.borderColor || (i === 0 ? accentColor : primaryColor),
                borderWidth: 2
              }))
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                title: { display: !!message.chartData.title, text: message.chartData.title || '', color: '#fff' },
                legend: { labels: { color: '#aaa', font: { size: 10 } } }
              },
              scales: {
                x: { ticks: { color: '#666', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#666', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
              }
            }
          });
        } catch (err) { console.error("Chart Error:", err); }
      }
      return () => { if (chartInstance.current) chartInstance.current.destroy(); };
    }, [message.chartData]);

    const isUser = message.role === Role.USER;
    const containerClasses = `group flex items-start gap-4 p-4 rounded-xl my-4 max-w-4xl w-full mx-auto transition-all ${isUser ? 'bg-white/5' : 'bg-black/30 border border-white/5 shadow-2xl shadow-black/50'}`;

    return (
        <div className={containerClasses} style={{ contain: 'layout' }}>
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xl shadow-sm overflow-hidden" 
                 style={{ backgroundColor: isUser ? 'var(--color-accent)' : 'var(--color-primary)', color: '#000' }}>
                 {isUser ? <span>{userAvatar}</span> : <Icon name="brain" className="w-5 h-5" />}
            </div>
            
            <div className="flex-grow prose prose-invert prose-sm max-w-none">
                <div className="flex items-start justify-between min-h-[1.5rem]">
                    <div className="flex-1">
                      {safeContent ? (
                        <Suspense fallback={<div className="whitespace-pre-wrap">{safeContent}</div>}>
                          <MarkdownRenderer content={safeContent} />
                        </Suspense>
                      ) : (
                        !message.imageGenerated && !message.chartData && !message.mermaidData && !message.isStreaming && (
                          <span className="text-gray-600 italic text-[10px] uppercase tracking-widest">[Processing_Complete]</span>
                        )
                      )}
                    </div>
                    {!isUser && onSpeak && safeContent && (
                        <button 
                            onClick={() => onSpeak(safeContent)}
                            className={`p-2 rounded-lg transition-all flex-shrink-0 ${isCurrentSpeaking ? 'text-[var(--color-primary)] opacity-100' : 'text-gray-500 hover:text-white opacity-0 group-hover:opacity-100'}`}
                        >
                            <Icon name="speaker-wave" className="w-4 h-4" />
                        </button>
                    )}
                </div>
                
                {message.mermaidData && (
                  <div className="mt-4">
                    <div className="text-[8px] font-mono text-gray-700 uppercase mb-2">Structural_Logic_Map</div>
                    <MermaidDiagram chart={message.mermaidData} />
                  </div>
                )}

                {message.imageGenerated && (
                  <div className="mt-4 rounded-xl overflow-hidden border border-white/10 shadow-2xl relative bg-black/40 min-h-[200px]">
                    {imgLoading && <div className="absolute inset-0 flex items-center justify-center"><Icon name="sparkles" className="w-8 h-8 text-gray-700 animate-pulse" /></div>}
                    <img src={message.imageGenerated} onLoad={() => setImgLoading(false)} alt="Visualization" className="w-full h-auto block" />
                  </div>
                )}

                {message.chartData && (
                  <div className="mt-4 p-4 bg-black/40 rounded-xl border border-white/10 h-[320px] relative">
                    <div className="absolute top-2 left-2 text-[8px] font-mono text-gray-700 uppercase">Telemetry_Buffer</div>
                    <canvas ref={chartCanvasRef}></canvas>
                  </div>
                )}

            </div>
        </div>
    );
};

export default React.memo(ChatMessage);
