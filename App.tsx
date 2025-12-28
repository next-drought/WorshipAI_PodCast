
import React, { useState, useRef, useEffect } from 'react';
import { PodcastState, VoiceStyle } from './types';
import { analyzeVoiceSample, generatePodcastAudio, extractEnglishFromBilingual, transcribeAudio } from './services/geminiService';
import { decode, decodeAudioData, blobToBase64 } from './utils/audioUtils';

const Header: React.FC = () => (
  <header className="py-6 px-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </div>
      <div>
        <h1 className="text-xl font-bold tracking-tight">Gemini Monologue Studio</h1>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Pro Podcast Engine</p>
      </div>
    </div>
    <div className="text-sm text-slate-400 font-medium hidden sm:block">
      Immersive Vocal Synthesis
    </div>
  </header>
);

const App: React.FC = () => {
  const [state, setState] = useState<PodcastState>({
    transcript: "",
    extractedTranscript: null,
    voiceSample: null,
    referenceAudioUrl: null,
    voiceAnalysis: null,
    selectedVoice: VoiceStyle.Zephyr,
    useReferenceVoice: true,
    isGenerating: false,
    generationProgress: 0,
    isExtracting: false,
    isAnalyzingVoice: false,
    generatedAudioUrl: null
  });

  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRefPlaying, setIsRefPlaying] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [refMimeType, setRefMimeType] = useState<string>('audio/wav');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const refAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (state.generatedAudioUrl) {
      const bytes = decode(state.generatedAudioUrl);
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [state.generatedAudioUrl]);

  useEffect(() => {
    return () => {
      if (state.referenceAudioUrl) URL.revokeObjectURL(state.referenceAudioUrl);
    };
  }, [state.referenceAudioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { 
        if (e.data.size > 0) chunksRef.current.push(e.data); 
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const refUrl = URL.createObjectURL(blob);
        const base64 = await blobToBase64(blob);
        setRefMimeType(mimeType);
        processVoiceData(base64, refUrl);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) { 
      console.error(err);
      alert("Microphone access denied."); 
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const processVoiceData = async (base64: string, refUrl: string) => {
    setState(prev => ({ 
      ...prev, 
      voiceSample: base64, 
      referenceAudioUrl: refUrl,
      isAnalyzingVoice: true, 
      voiceAnalysis: null 
    }));
    try {
      const analysisText = await analyzeVoiceSample(base64);
      setState(prev => ({ 
        ...prev, 
        voiceAnalysis: analysisText,
        isAnalyzingVoice: false 
      }));
    } catch (err) { 
      console.error("Voice analysis error:", err); 
      setState(prev => ({ ...prev, isAnalyzingVoice: false }));
    }
  };

  const handleTranscribeReference = async () => {
    if (!state.voiceSample) return;
    setIsTranscribing(true);
    try {
      const transcript = await transcribeAudio(state.voiceSample, refMimeType);
      setState(prev => ({ ...prev, transcript: prev.transcript + (prev.transcript ? "\n\n" : "") + transcript }));
      setIsTranscribing(false);
    } catch (err) {
      console.error("Transcription error:", err);
      setIsTranscribing(false);
      alert("Failed to transcribe audio.");
    }
  };

  const playVoicePreview = async (voice: VoiceStyle) => {
    setIsPreviewLoading(voice);
    try {
      const sampleText = `Hi there! I am ${voice}. I can narrate your monologue with professional clarity.`;
      const base64 = await generatePodcastAudio(sampleText, voice);
      const bytes = decode(base64);
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      
      if (previewAudioRef.current) {
        previewAudioRef.current.src = url;
        previewAudioRef.current.play();
      }
      setIsPreviewLoading(null);
    } catch (err) {
      console.error("Preview error:", err);
      setIsPreviewLoading(null);
      alert("Failed to load preview.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const refUrl = URL.createObjectURL(file);
      const base64 = await blobToBase64(file);
      setRefMimeType(file.type);
      processVoiceData(base64, refUrl);
    }
  };

  const handleExtractEnglish = async () => {
    if (!state.transcript.trim()) return;
    setState(prev => ({ ...prev, isExtracting: true }));
    try {
      const cleaned = await extractEnglishFromBilingual(state.transcript);
      setState(prev => ({ ...prev, extractedTranscript: cleaned, isExtracting: false }));
    } catch (err) {
      console.error("Extraction error:", err);
      setState(prev => ({ ...prev, isExtracting: false }));
      alert("Extraction failed.");
    }
  };

  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleRefPlayback = () => {
    if (refAudioRef.current) {
      if (isRefPlaying) {
        refAudioRef.current.pause();
      } else {
        refAudioRef.current.play();
      }
      setIsRefPlaying(!isRefPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const generatePodcast = async () => {
    const textToUse = state.extractedTranscript || state.transcript;
    if (!textToUse.trim()) { alert("Please provide a transcript."); return; }
    setState(prev => ({ ...prev, isGenerating: true, generationProgress: 0, generatedAudioUrl: null }));
    setIsPlaying(false);
    setCurrentTime(0);
    
    try {
      const audioBase64 = await generatePodcastAudio(
        textToUse, 
        state.selectedVoice, 
        (percent) => {
          setState(prev => ({ ...prev, generationProgress: percent }));
        },
        state.useReferenceVoice && state.voiceSample ? { data: state.voiceSample, mimeType: refMimeType } : null
      );
      setState(prev => ({ ...prev, isGenerating: false, generatedAudioUrl: audioBase64 }));
    } catch (err: any) {
      console.error("Generation error:", err);
      setState(prev => ({ ...prev, isGenerating: false }));
      alert(`Generation failed: ${err.message || "Unknown error"}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30 pb-20">
      <Header />
      <main className="max-w-6xl mx-auto p-4 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Input Voice Controls */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
            </div>
            
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">Reference Audio</h2>
            <p className="text-[10px] text-slate-500 mb-4 uppercase tracking-wider font-bold">Upload audio to guide the narrator's identity</p>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button 
                onClick={isRecording ? stopRecording : startRecording} 
                className={`p-4 rounded-xl border transition-all flex flex-col items-center justify-center gap-2 ${isRecording ? 'bg-red-500/10 border-red-500 text-red-500 shadow-lg shadow-red-500/10' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
              >
                <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`} />
                <span className="text-[10px] font-bold uppercase">{isRecording ? 'Stop' : 'Live Record'}</span>
              </button>
              <label className="p-4 rounded-xl border bg-slate-800 border-slate-700 hover:bg-slate-700 text-center cursor-pointer flex flex-col items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <span className="text-[10px] font-bold uppercase">Upload</span>
                <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            {state.referenceAudioUrl && (
              <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={toggleRefPlayback}
                      className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-full transition-all text-white shadow-lg shadow-indigo-500/20"
                    >
                      {isRefPlaying ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      )}
                    </button>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Sample Active</span>
                  </div>
                  <button 
                    disabled={isTranscribing}
                    onClick={handleTranscribeReference}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[9px] font-bold uppercase text-indigo-400 transition-colors disabled:opacity-50"
                  >
                    {isTranscribing ? 'Transcribing...' : 'To Script'}
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-800">
                   <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] uppercase font-bold text-indigo-400 tracking-widest">Voice Mode</span>
                      <div className="flex bg-slate-950 p-0.5 rounded-md border border-slate-800">
                        <button 
                          onClick={() => setState(prev => ({ ...prev, useReferenceVoice: true }))}
                          className={`px-2 py-1 text-[8px] font-bold rounded uppercase transition-all ${state.useReferenceVoice ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
                        >
                          Guided
                        </button>
                        <button 
                          onClick={() => setState(prev => ({ ...prev, useReferenceVoice: false }))}
                          className={`px-2 py-1 text-[8px] font-bold rounded uppercase transition-all ${!state.useReferenceVoice ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
                        >
                          Studio
                        </button>
                      </div>
                   </div>
                   <p className="text-[9px] text-slate-500 leading-tight">
                     {state.useReferenceVoice 
                       ? "The synthesis will now imitate the personality and tone of your uploaded sample." 
                       : "Standard high-fidelity synthesis using selected narrator profile."}
                   </p>
                </div>

                {state.voiceAnalysis && (
                  <p className="text-[10px] italic text-slate-400 leading-relaxed border-t border-slate-800 pt-2">
                    {state.voiceAnalysis}
                  </p>
                )}
                <audio ref={refAudioRef} src={state.referenceAudioUrl} onEnded={() => setIsRefPlaying(false)} className="hidden" />
              </div>
            )}
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-4 text-slate-400">Narrator Base</h2>
            <p className="text-[9px] text-slate-500 mb-4 uppercase tracking-widest font-bold">Select the architectural base for the voice</p>
            <div className="space-y-3">
              {Object.values(VoiceStyle).map(v => (
                <div key={v} className="flex gap-2">
                  <button 
                    onClick={() => setState(prev => ({ ...prev, selectedVoice: v }))} 
                    className={`flex-1 text-left p-4 rounded-xl text-sm border transition-all flex items-center justify-between ${state.selectedVoice === v ? 'bg-indigo-600 border-indigo-400 shadow-lg shadow-indigo-600/20' : 'bg-slate-800 border-slate-700 hover:bg-slate-750 text-slate-400'}`}
                  >
                    <span className="font-medium">{v}</span>
                    {state.selectedVoice === v && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </button>
                  <button 
                    disabled={isPreviewLoading !== null}
                    onClick={() => playVoicePreview(v)}
                    className="p-4 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 transition-colors flex items-center justify-center min-w-[50px] disabled:opacity-50"
                    title="Play Sample"
                  >
                    {isPreviewLoading === v ? (
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
            <audio ref={previewAudioRef} className="hidden" />
          </section>
        </div>

        {/* Right Column: Transcript & Production */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col min-h-[550px]">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
              <div className="bg-slate-950 p-1 rounded-xl flex gap-1 border border-slate-800">
                <button 
                  onClick={() => setState(prev => ({ ...prev, extractedTranscript: null }))} 
                  className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${!state.extractedTranscript ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Script Editor
                </button>
                {state.extractedTranscript && (
                  <button className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase bg-indigo-600 text-white">
                    Clean Monologue
                  </button>
                )}
              </div>
              
              <button 
                disabled={state.isExtracting || !state.transcript}
                onClick={handleExtractEnglish}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-[10px] font-bold uppercase transition-all active:scale-95"
              >
                {state.isExtracting ? 'Extracting English...' : 'Smart Extract'}
              </button>
            </div>

            <textarea
              className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-6 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 font-mono text-sm leading-relaxed scrollbar-hide"
              placeholder="Your transcript goes here. You can paste bilingual text and use 'Smart Extract', or use 'To Script' to transcribe your reference audio."
              value={state.extractedTranscript || state.transcript}
              onChange={(e) => {
                if (state.extractedTranscript) {
                   setState(prev => ({ ...prev, extractedTranscript: e.target.value }));
                } else {
                   setState(prev => ({ ...prev, transcript: e.target.value }));
                }
              }}
            />

            <div className="mt-6 flex flex-col gap-4">
              {state.isGenerating && (
                <div className="space-y-2 animate-in fade-in duration-300">
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                       {state.useReferenceVoice && state.voiceSample ? "Guided Native Synthesis..." : "Standard Synthesis..."}
                    </p>
                    <p className="text-[10px] font-mono text-indigo-300">{state.generationProgress}%</p>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]" 
                      style={{ width: `${state.generationProgress}%` }} 
                    />
                  </div>
                </div>
              )}

              <button
                disabled={state.isGenerating || (!state.transcript && !state.extractedTranscript)}
                onClick={generatePodcast}
                className={`py-5 rounded-xl font-bold uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-3 ${state.isGenerating ? 'bg-slate-800 text-slate-500 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/20 active:scale-[0.98]'}`}
              >
                {state.isGenerating ? 'Deep Modeling Chunks...' : 'Generate Monologue Podcast'}
              </button>
            </div>
          </section>

          {state.generatedAudioUrl && blobUrl && (
            <section className="bg-gradient-to-r from-indigo-900/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-white tracking-wide text-lg">Master Produced</h3>
                    <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-tighter">Broadcast Quality .WAV</p>
                  </div>
                  <a 
                    href={blobUrl} 
                    download="monologue_podcast.wav" 
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-bold uppercase transition-all tracking-widest text-white"
                  >
                    Export Master
                  </a>
                </div>

                <div className="bg-slate-950/50 p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
                  <div className="flex items-center gap-6">
                    <button 
                      onClick={togglePlayback}
                      className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-xl shadow-indigo-600/40 active:scale-95 group"
                    >
                      {isPlaying ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white ml-1" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 flex flex-col gap-2">
                      <input 
                        type="range"
                        min="0"
                        max={duration || 0}
                        step="0.01"
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                      <div className="flex justify-between text-[10px] font-mono text-slate-500 font-bold uppercase tracking-widest">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <audio 
                  ref={audioRef}
                  src={blobUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                  className="hidden"
                />
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
