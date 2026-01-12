export interface FrameDiff {
  timestamp: number;
  diffScore: number;
  frameIndex: number;
}

export interface Scene {
  id: number;
  startTime: number;
  endTime: number;
  thumbnailDataUrl: string;
  analysis?: SceneAnalysis;
  isAnalyzing?: boolean;
  error?: string;
}

export interface DetailedObject {
  color: string;
  label: string;
}

export interface DetailedSubject {
  name: string;
  description: string;
  action: string;
}

export interface OriginalCard {
  title: string;
  shotType: string;
  cameraAngle: string;
  lighting: string;
}

export interface SceneAnalysis {
  imagePrompt: string;
  videoPrompt: string;
  keywords: string[];
  mood: string;
  visualStyle: string;
  objects: DetailedObject[];
  subjects: DetailedSubject[];
  originalCard: OriginalCard;
}

export interface AnalysisProgress {
  status: 'idle' | 'processing_video' | 'analyzing_scenes' | 'complete' | 'error';
  progress: number; // 0 to 100
  message?: string;
}