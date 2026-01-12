import React, { useState, useCallback, useRef } from "react";
import VideoUploader from "./components/VideoUploader";
import AnalysisChart from "./components/AnalysisChart";
import SceneCard from "./components/SceneCard";
import Sidebar from "./components/Sidebar";
import { processVideoScenes } from "./services/videoUtils";
import { analyzeSceneFrame } from "./services/geminiService";
import { Scene, FrameDiff, AnalysisProgress } from "./types";

const ProcessingStep = ({ label, status }: { label: string, status: 'waiting' | 'active' | 'completed' }) => (
  <div className="flex items-center gap-3 transition-all duration-300">
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] border transition-colors duration-300 flex-shrink-0 ${
      status === 'completed' ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' :
      status === 'active' ? 'border-indigo-600 text-indigo-600 bg-indigo-50 animate-pulse' :
      'border-gray-200 text-gray-300 bg-white'
    }`}>
      {status === 'completed' ? (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      ) : status === 'active' ? (
        <div className="w-2 h-2 rounded-full bg-indigo-600" />
      ) : (
        <div className="w-2 h-2 rounded-full bg-gray-200" />
      )}
    </div>
    <span className={`text-sm transition-colors duration-300 ${
      status === 'completed' ? 'text-gray-700 font-medium' :
      status === 'active' ? 'text-indigo-700 font-semibold' :
      'text-gray-400'
    }`}>{label}</span>
  </div>
);

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [frameDiffs, setFrameDiffs] = useState<FrameDiff[]>([]);
  const [progress, setProgress] = useState<AnalysisProgress>({ status: 'idle', progress: 0 });
  const [selectedSceneIds, setSelectedSceneIds] = useState<number[]>([]);
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isHoveringBatch, setIsHoveringBatch] = useState(false);
  const [showDurationSelection, setShowDurationSelection] = useState(false);
  const [processingMode, setProcessingMode] = useState<'fixed' | 'ai'>('fixed');
  
  // Ref to control stopping the batch loop
  const stopBatchRef = useRef(false);

  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    const url = URL.createObjectURL(selectedFile);
    setVideoUrl(url);
    
    // Reset states and show duration selection
    setScenes([]);
    setFrameDiffs([]);
    setSelectedSceneIds([]);
    setProgress({ status: 'idle', progress: 0 });
    setIsBatchAnalyzing(false);
    setIsStopping(false);
    stopBatchRef.current = false;
    setShowDurationSelection(true);
  }, []);

  const handleDurationSelect = async (duration: number) => {
    if (!file) return;
    setShowDurationSelection(false);
    setProcessingMode(duration === 0 ? 'ai' : 'fixed');
    setProgress({ status: 'processing_video', progress: 0 });

    try {
      const { scenes: detectedScenes, diffs } = await processVideoScenes(file, {
        onProgress: (p) => setProgress({ status: 'processing_video', progress: p }),
        fixedSegmentDuration: duration
      });
      setScenes(detectedScenes);
      setFrameDiffs(diffs);
      setProgress({ status: 'complete', progress: 100 });
    } catch (error) {
      console.error(error);
      setProgress({ status: 'error', progress: 0, message: 'Failed to process video. The file might be corrupted or in an unsupported format.' });
    }
  };

  const handleAnalyzeScene = async (sceneId: number) => {
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isAnalyzing: true, error: undefined } : s));
    
    try {
      const scene = scenes.find(s => s.id === sceneId);
      if (!scene) return;

      const analysis = await analyzeSceneFrame(scene.thumbnailDataUrl);
      
      setScenes(prev => prev.map(s => 
        s.id === sceneId ? { ...s, analysis, isAnalyzing: false } : s
      ));
    } catch (error) {
      console.error("Failed to analyze scene", error);
      setScenes(prev => prev.map(s => s.id === sceneId ? { 
        ...s, 
        isAnalyzing: false, 
        error: "Failed to analyze." 
      } : s));
    }
  };

  const handleAnalyzeAll = async () => {
    if (isBatchAnalyzing || isStopping || scenes.length === 0) return;
    setIsBatchAnalyzing(true);
    stopBatchRef.current = false;

    try {
      // Filter to only analyze scenes that haven't been analyzed yet
      const idsToProcess = scenes.filter(s => !s.analysis).map(s => s.id);

      if (idsToProcess.length === 0) {
        return;
      }

      for (let i = 0; i < idsToProcess.length; i++) {
        if (stopBatchRef.current) break;

        const id = idsToProcess[i];
        
        // Trigger analysis
        await handleAnalyzeScene(id);

        if (stopBatchRef.current) break;

        // If not the last item, wait 5-7 seconds
        if (i < idsToProcess.length - 1) {
          const delay = Math.floor(Math.random() * 2000) + 5000; // 5000ms to 7000ms
          
          const checkInterval = 200;
          let elapsed = 0;
          while (elapsed < delay) {
             if (stopBatchRef.current) break;
             await new Promise(resolve => setTimeout(resolve, checkInterval));
             elapsed += checkInterval;
          }
        }
      }
    } finally {
      setIsBatchAnalyzing(false);
      setIsStopping(false);
      stopBatchRef.current = false;
    }
  };

  const handleStopBatch = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    stopBatchRef.current = true;
    setIsStopping(true);
  };

  const handleToggleSelect = (id: number) => {
    setSelectedSceneIds(prev => {
      if (prev.includes(id)) return prev.filter(sid => sid !== id);
      if (prev.length >= 2) return [id];
      return [...prev, id].sort((a, b) => a - b);
    });
  };

  const reset = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFile(null);
    setVideoUrl(null);
    setScenes([]);
    setFrameDiffs([]);
    setSelectedSceneIds([]);
    setProgress({ status: 'idle', progress: 0 });
    setIsBatchAnalyzing(false);
    setIsStopping(false);
    stopBatchRef.current = false;
    setShowDurationSelection(false);
  };

  const copyToClipboard = (text: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text).catch(err => console.error("Failed to copy:", err));
    } else {
      console.warn("Clipboard API not available");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 h-16 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm flex-shrink-0">S</div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">SceneScout</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
             {file && <button onClick={reset} className="text-sm font-medium text-gray-500 hover:text-red-600 transition-colors whitespace-nowrap">New Video</button>}
             <span className="hidden sm:inline-block text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1.5 rounded-full font-medium">Gemini 2.5 Flash</span>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 relative">
        <main className="w-full pb-32 md:pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            
            {!file && (
              <div className="animate-fade-in-up mt-8 md:mt-16 max-w-3xl mx-auto text-center px-4">
                <div className="mb-12">
                  <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-4 md:mb-6">
                    Video to <span className="text-indigo-600">Scene Intelligence</span>
                  </h2>
                  <p className="text-base md:text-lg text-slate-500 font-normal max-w-2xl mx-auto leading-relaxed">
                    Instantly detect scenes in your videos and generate detailed AI descriptions, keywords, and prompts using Gemini 2.5.
                  </p>
                </div>
                <VideoUploader onFileSelect={handleFileSelect} />
              </div>
            )}

            {file && showDurationSelection && (
              <div className="animate-fade-in flex flex-col items-center justify-center min-h-[50vh] py-12">
                 <div className="text-center mb-10">
                   <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">Choose split scene duration</h2>
                   <p className="text-gray-500 max-w-md mx-auto">Analyze the video by splitting it into fixed segments starting from 0s, or use AI detection.</p>
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-5xl px-4">
                    {/* AI Button */}
                    <button 
                         onClick={() => handleDurationSelect(0)}
                         className="flex flex-col items-center justify-center p-8 bg-white border-2 border-indigo-100 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden"
                       >
                          <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] px-2 py-1 rounded-bl-lg font-bold shadow-sm">SMART</div>
                          <div className="w-16 h-16 rounded-full bg-indigo-600 text-white flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                            </svg>
                          </div>
                          <span className="text-lg font-bold text-gray-800 mb-1">Frame by AI</span>
                          <span className="text-xs text-gray-400 group-hover:text-indigo-600">Visual Scene Detection</span>
                       </button>

                    {[5, 8, 10].map(duration => (
                       <button 
                         key={duration}
                         onClick={() => handleDurationSelect(duration)}
                         className="flex flex-col items-center justify-center p-8 bg-white border-2 border-gray-100 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
                       >
                          <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl font-bold mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            {duration}s
                          </div>
                          <span className="text-lg font-bold text-gray-800 mb-1">{duration} Seconds</span>
                          <span className="text-xs text-gray-400 group-hover:text-indigo-600">Fixed Interval Split</span>
                       </button>
                    ))}
                 </div>
                 
                 <button onClick={reset} className="mt-12 text-gray-400 hover:text-gray-600 text-sm font-medium">Cancel and choose different video</button>
              </div>
            )}

            {file && !showDurationSelection && (
              <div className="animate-fade-in space-y-8">
                {/* Video & Stats */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-1 space-y-4">
                    <div className="bg-black rounded-xl overflow-hidden shadow-lg aspect-video relative ring-1 ring-gray-900/5">
                      <video src={videoUrl || ""} controls className="w-full h-full object-contain"/>
                    </div>
                  </div>
                  <div className="lg:col-span-2 flex flex-col gap-6">
                    {progress.status === 'processing_video' ? (
                      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6 md:p-8 shadow-sm flex flex-col justify-center h-full min-h-[350px]">
                        <div className="max-w-md mx-auto w-full">
                          <div className="text-center mb-8">
                            <div className="inline-flex relative mb-4">
                               <div className="w-16 h-16 rounded-full border-4 border-indigo-50 border-t-indigo-600 animate-spin"></div>
                               <div className="absolute inset-0 flex items-center justify-center font-bold text-gray-700">
                                 {Math.round(progress.progress)}%
                               </div>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-1">Analyzing Video Content</h3>
                            <p className="text-sm text-gray-500">
                              {processingMode === 'ai' ? 'Detecting visual changes & scenes...' : 'Segmenting video into fixed intervals...'}
                            </p>
                          </div>

                          <div className="space-y-4 bg-gray-50 p-6 rounded-xl border border-gray-100">
                            <ProcessingStep 
                              label="Loading video stream" 
                              status={progress.progress > 2 ? 'completed' : 'active'} 
                            />
                            <ProcessingStep 
                              label={processingMode === 'ai' ? "Sampling frames" : "Segmenting timeline"} 
                              status={progress.progress > 5 ? (progress.progress > 75 ? 'completed' : 'active') : 'waiting'} 
                            />
                            <ProcessingStep 
                              label={processingMode === 'ai' ? "Calculating visual differences" : "Extracting thumbnails"} 
                              status={progress.progress > 75 ? (progress.progress > 90 ? 'completed' : 'active') : 'waiting'} 
                            />
                            <ProcessingStep 
                              label="Finalizing scenes" 
                              status={progress.progress > 90 ? 'active' : 'waiting'} 
                            />
                          </div>
                        </div>
                      </div>
                    ) : progress.status === 'error' ? (
                      <div className="flex-1 bg-white rounded-xl border border-red-200 p-8 shadow-sm flex flex-col justify-center items-center h-full min-h-[350px]">
                         <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                           <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                           </svg>
                         </div>
                         <h3 className="text-xl font-bold text-gray-900 mb-2">Processing Failed</h3>
                         <p className="text-gray-500 text-center max-w-md mb-6">{progress.message}</p>
                         <button onClick={reset} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium">
                           Upload Another Video
                         </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-5 rounded-xl border border-gray-200 shadow-sm gap-4 h-full">
                          <div className="w-full sm:w-auto">
                            <h3 className="text-lg font-bold text-gray-900">Detected Scenes ({scenes.length})</h3>
                            <p className="text-sm text-gray-500 mt-1">Select start and end scenes to create a Timelapse transition.</p>
                          </div>
                          <button
                            onClick={isBatchAnalyzing ? handleStopBatch : handleAnalyzeAll}
                            onMouseEnter={() => setIsHoveringBatch(true)}
                            onMouseLeave={() => setIsHoveringBatch(false)}
                            disabled={scenes.length === 0 || isStopping}
                            className={`w-full sm:w-auto flex items-center justify-center gap-2 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm active:scale-95 ${
                              isStopping 
                                ? 'bg-gray-400 cursor-wait'
                                : isBatchAnalyzing 
                                  ? 'bg-indigo-600 hover:bg-red-600'
                                  : 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed'
                            }`}
                          >
                            {isStopping ? (
                               <>
                                 <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                 </svg>
                                 <span>Stopping...</span>
                               </>
                            ) : isBatchAnalyzing ? (
                               isHoveringBatch ? (
                                 <>
                                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                   </svg>
                                   <span>Stop Batch</span>
                                 </>
                               ) : (
                                 <>
                                   <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                   </svg>
                                   <span>Processing Batch...</span>
                                 </>
                               )
                            ) : (
                               <span>Analyze All ({scenes.filter(s => !s.analysis).length > 0 ? scenes.filter(s => !s.analysis).length : scenes.length} Scenes)</span>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Scene Cards */}
                {progress.status === 'complete' && (
                  <div className="grid grid-cols-1 xl:grid-cols-1 gap-6">
                    {scenes.map((scene) => (
                      <SceneCard 
                        key={scene.id} 
                        scene={scene} 
                        onAnalyze={handleAnalyzeScene}
                        isSelected={selectedSceneIds.includes(scene.id)}
                        selectionIndex={selectedSceneIds.indexOf(scene.id) + 1}
                        onToggleSelect={handleToggleSelect}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Floating Sidebar */}
        {file && !showDurationSelection && progress.status === 'complete' && selectedSceneIds.length > 0 && (
          <Sidebar 
            scenes={scenes} 
            selectedSceneIds={selectedSceneIds}
            onCopy={copyToClipboard}
          />
        )}
      </div>
    </div>
  );
};

export default App;