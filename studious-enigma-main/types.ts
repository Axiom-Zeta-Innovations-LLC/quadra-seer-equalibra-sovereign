
export enum Role {
  USER = 'user',
  BOT = 'bot',
  SYSTEM = 'system',
}

export enum ThinkingMode {
  STANDARD = 'standard',
  FOCUS = 'focus',
  CREATIVITY = 'creativity',
  LOGIC = 'logic'
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  isStreaming?: boolean;
  sources?: { uri: string; title: string }[];
  chartData?: ChartConfig;
  mermaidData?: string; // New field for structural diagrams
  attachments?: string[]; 
  imageGenerated?: string; // Explicitly support generated images
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'radar' | 'scatter' | 'doughnut';
  title: string;
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }[];
}

export interface UserProfile {
  username: string;
  avatar: string;
  bio: string;
}

export interface FileData {
  name: string;
  type: string;
  size: number;
  content: string; // base64 encoded content
  extractedText?: string;
}

export interface Conversation {
  id: string;
  messages: Message[];
  summary: string;
  simulationHistory: any[];
  createdAt: number;
  isPublic: boolean;
}
