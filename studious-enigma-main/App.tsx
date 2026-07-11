
import React from 'react';
import BinaryStreamBackground from './components/BinaryStreamBackground';
import ChatInterface from './components/ChatInterface';
import { ThemeProvider } from './context/ThemeContext';

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <main className="relative h-[100dvh] w-screen overflow-hidden bg-black font-mono">
        <BinaryStreamBackground />
        <div className="relative z-10 flex h-full w-full flex-col">
          <ChatInterface />
        </div>
      </main>
    </ThemeProvider>
  );
};

export default App;
