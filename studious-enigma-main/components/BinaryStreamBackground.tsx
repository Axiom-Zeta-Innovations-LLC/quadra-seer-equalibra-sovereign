
import React, { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

const BinaryStreamBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  
  // Use a ref to track the color so we don't call getComputedStyle in the loop
  const colorRef = useRef<string>('#4ade80');

  useEffect(() => {
    // Update color whenever the theme changes
    colorRef.current = theme.colors['--color-primary'] || '#4ade80';
  }, [theme]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const fontSize = 14;
    let columns = Math.floor(width / fontSize);
    let drops: number[] = new Array(columns).fill(1).map(() => Math.random() * -100);
    
    const charList = "0101011100";
    let animationFrameId: number;
    let lastTime = 0;
    const frameInterval = 50; // Optimized for 20fps matrix feel

    const draw = (timestamp: number) => {
      if (!lastTime) lastTime = timestamp;
      const elapsed = timestamp - lastTime;

      if (elapsed < frameInterval) {
        animationFrameId = requestAnimationFrame(draw);
        return;
      }
      lastTime = timestamp;

      // Draw semi-transparent black overlay to create trail effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, width, height);

      // Use the cached color from the ref
      ctx.fillStyle = colorRef.current;
      ctx.font = `${fontSize}px monospace`;
      ctx.globalAlpha = 0.2; // Keep background subtle

      for (let i = 0; i < drops.length; i++) {
        const text = charList.charAt(Math.floor(Math.random() * charList.length));
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > height && Math.random() > 0.985) {
          drops[i] = 0;
        }
        drops[i]++;
      }
      
      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      const newColumns = Math.floor(width / fontSize);
      if (newColumns !== columns) {
        columns = newColumns;
        drops = new Array(columns).fill(1).map(() => Math.random() * -100);
      }
    };

    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 z-0 pointer-events-none bg-black"
      style={{ filter: 'blur(0.4px)', transform: 'translateZ(0)' }}
    />
  );
};

export default React.memo(BinaryStreamBackground);