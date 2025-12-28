
export enum VoiceStyle {
  Kore = 'Kore',
  Puck = 'Puck',
  Charon = 'Charon',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr'
}

export interface PodcastState {
  transcript: string;
  extractedTranscript: string | null;
  voiceSample: string | null; // Base64
  referenceAudioUrl: string | null; // Blob URL for playback
  voiceAnalysis: string | null;
  selectedVoice: VoiceStyle;
  useReferenceVoice: boolean;
  isGenerating: boolean;
  generationProgress: number; // 0 to 100
  isExtracting: boolean;
  isAnalyzingVoice: boolean;
  generatedAudioUrl: string | null;
}

export interface AnalysisResult {
  suggestedVoice: VoiceStyle;
  toneDescription: string;
}
