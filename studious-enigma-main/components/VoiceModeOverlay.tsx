
import React, { useEffect, useRef } from 'react';
import Icon from './Icon';

interface VoiceModeOverlayProps {
  isActive: boolean;
  isModelSpeaking: boolean;
  volume: number;
  onClose: () => void;
}

const VoiceModeOverlay: React.FC<VoiceModeOverlayProps> = ({ isActive, isModelSpeaking, volume, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !isActive) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const styles = getComputedStyle(document.documentElement);
    const primaryColor = styles.getPropertyValue('--color-primary').trim();
    const accentColor = styles.getPropertyValue('--color-accent').trim();

    let animationFrame: number;
    const particles: { x: number; y: number; size: number; speed: number; angle: number }[] = [];
    
    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 0.5 + 0.2,
        angle: Math.random() * Math.PI * 2,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = 100 + (volume * 0.5);
      const activeColor = isModelSpeaking ? primaryColor : accentColor;
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.3;
      ctx.stroke();

      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const r = baseRadius + (Math.sin(Date.now() * 0.002 + i) * 20);
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.1;
        ctx.stroke();
      }

      particles.forEach(p => {
        p.angle += 0.01;
        p.x += Math.cos(p.angle) * p.speed;
        p.y += Math.sin(p.angle) * p.speed;
        
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.fillStyle = activeColor;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrame = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive, isModelSpeaking, volume]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center animate-in fade-in duration-500">
      <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} className="absolute inset-0 w-full h-full opacity-40 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col items-center gap-8">
        <div className="w-48 h-48 rounded-full border-4 flex items-center justify-center relative shadow-[0_0_50px_rgba(74,222,128,0.2)]" 
             style={{ borderColor: isModelSpeaking ? 'var(--color-primary)' : 'var(--color-accent)' }}>
          <div className={`absolute inset-0 rounded-full bg-current opacity-10 ${isModelSpeaking ? 'animate-ping' : ''}`} style={{ color: isModelSpeaking ? 'var(--color-primary)' : 'var(--color-accent)' }} />
          <Icon name="brain" className="w-24 h-24" style={{ color: isModelSpeaking ? 'var(--color-primary)' : 'var(--color-accent)' }} />
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold tracking-widest uppercase" style={{ color: 'var(--color-text-primary)' }}>
            {isModelSpeaking ? 'Seer Transmission' : 'Intelligence Monitoring...'}
          </h2>
          <p className="text-[var(--color-text-secondary)] font-mono text-sm uppercase tracking-tighter">
            Full-Duplex Predictive Intelligence Link Active
          </p>
        </div>

        <div className="flex gap-4 mt-8">
          <button 
            onClick={onClose}
            className="flex items-center gap-2 px-6 py-3 rounded-full font-bold border-2 transition-all hover:scale-105 active:scale-95 bg-black/50"
            style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
          >
            <Icon name="x-circle" className="w-5 h-5" />
            DISCONNECT
          </button>
        </div>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[9px] font-mono text-gray-600 flex gap-10">
        <span className="flex items-center gap-1"><div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div> LATENCY: ~120MS</span>
        <span>SAMPLE_RATE: 24KHZ</span>
        <span>ENTITY: QUADRA SEER</span>
      </div>
    </div>
  );
};

export default VoiceModeOverlay;