import React, { useState } from 'react';
import { Scene } from '../types';

interface SceneCardProps {
  scene: Scene;
  onAnalyze: (id: number) => void;
  isSelected?: boolean;
  selectionIndex?: number;
  onToggleSelect?: (id: number) => void;
}

const SceneCard: React.FC<SceneCardProps> = ({ scene, onAnalyze, isSelected, selectionIndex, onToggleSelect }) => {
  const { id, startTime, endTime, thumbnailDataUrl, analysis, isAnalyzing, error } = scene;
  const [showJson, setShowJson] = useState(false);
  const [copiedStates, setCopiedStates] = useState<{[key: string]: boolean}>({});

  const copyToClipboard = async (text: string, key: string) => {
    if (navigator?.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedStates(prev => ({ ...prev, [key]: true }));
        setTimeout(() => setCopiedStates(prev => ({ ...prev, [key]: false })), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  const handleCopyJson = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (analysis) {
       copyToClipboard(JSON.stringify(analysis, null, 2), 'fullJson');
    }
  };

  const handleCopyImageJson = () => {
    if (analysis) {
       const payload = {
         imagePrompt: analysis.imagePrompt,
         mood: analysis.mood,
         visualStyle: analysis.visualStyle,
         objects: analysis.objects,
         subjects: analysis.subjects,
         originalCard: analysis.originalCard
       };
       copyToClipboard(JSON.stringify(payload, null, 2), 'imgJson');
    }
  };

  const handleCopyVideoJson = () => {
    if (analysis) {
       const payload = {
         videoPrompt: analysis.videoPrompt,
         originalCard: analysis.originalCard,
         visualStyle: analysis.visualStyle
       };
       copyToClipboard(JSON.stringify(payload, null, 2), 'vidJson');
    }
  };

  return (
    <div className={`bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col lg:flex-row gap-0 group relative ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/10' : 'border-gray-200'}`}>
      
      {/* Selection Button */}
      <div className="absolute top-3 left-3 z-10">
        <button
          onClick={() => onToggleSelect && onToggleSelect(id)}
          className={`w-8 h-8 lg:w-6 lg:h-6 rounded border flex items-center justify-center transition-colors shadow-sm ${
            isSelected 
              ? 'bg-indigo-600 border-indigo-600 text-white font-bold text-sm lg:text-xs' 
              : 'bg-white/90 border-gray-300 hover:border-indigo-400 text-transparent hover:text-gray-400'
          }`}
          title="Select for Timelapse"
        >
          {isSelected ? selectionIndex : '✓'}
        </button>
      </div>

      {/* Thumbnail */}
      <div className="relative w-full lg:w-72 h-48 lg:h-auto flex-shrink-0 bg-gray-100 flex flex-col border-b lg:border-b-0 lg:border-r border-gray-100">
        <img 
          src={thumbnailDataUrl} 
          alt={`Scene ${id}`} 
          className="w-full h-full object-cover flex-1"
        />
        <div className="bg-gray-900 text-white text-[10px] px-3 py-1.5 flex justify-between items-center font-mono">
           <span>{startTime.toFixed(1)}s - {endTime.toFixed(1)}s</span>
           <span>Scene {id}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col min-w-0">
        <div className="flex flex-col sm:flex-row justify-between items-start mb-3 gap-2">
          <div className="w-full sm:w-auto">
            <h3 className="text-lg font-bold text-gray-800 leading-tight">
              Scene {id}
            </h3>
            {analysis && (
              <div className="flex flex-col gap-1.5 mt-2">
                 <div className="flex flex-wrap gap-1.5">
                   {analysis.keywords?.slice(0, 3).map((k, i) => (
                     <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">{k}</span>
                   ))}
                 </div>
                 {/* Show shot type from original card if available */}
                 <div className="text-[10px] text-gray-500 font-mono flex gap-2">
                   <span>{analysis.originalCard?.shotType}</span>
                   <span className="text-gray-300">•</span>
                   <span>{analysis.originalCard?.lighting}</span>
                 </div>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
             {!analysis && !isAnalyzing && (
               <button onClick={() => onAnalyze(id)} className="flex-1 sm:flex-none text-center text-xs bg-indigo-600 text-white px-4 py-2 rounded-full hover:bg-indigo-700 transition-all shadow-sm font-medium">
                 Analyze
               </button>
             )}
             {isAnalyzing && (
                <span className="text-xs text-indigo-500 font-medium animate-pulse bg-indigo-50 px-3 py-1 rounded-full">Analyzing...</span>
             )}
             {error && (
                <button onClick={() => onAnalyze(id)} className="text-xs text-red-600 hover:text-red-700 bg-red-50 px-3 py-1 rounded-full font-medium">Retry Analysis</button>
             )}
             {analysis && (
               <button
                 onClick={() => setShowJson(!showJson)}
                 className="flex-1 sm:flex-none text-xs text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 bg-white px-3 py-1.5 rounded font-medium transition-all"
               >
                 {showJson ? "View Visual" : "View JSON"}
               </button>
             )}
          </div>
        </div>

        {analysis ? (
           showJson ? (
             <div className="mt-2 relative">
               <pre className="bg-gray-50 text-[10px] p-3 rounded border border-gray-200 overflow-x-auto h-64 font-mono leading-3">
                 {JSON.stringify(analysis, null, 2)}
               </pre>
               <button 
                  onClick={handleCopyJson} 
                  className="absolute top-2 right-2 text-[10px] bg-white border px-2 py-1 rounded shadow-sm hover:bg-gray-50"
               >
                 {copiedStates['fullJson'] ? "Copied!" : "Copy All"}
               </button>
             </div>
           ) : (
             <div className="space-y-4 mt-1">
               
               {/* Image & Video Prompts */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Image Prompt */}
                  <div className="bg-indigo-50/50 rounded-lg p-3 border border-indigo-100 flex flex-col h-full">
                     <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">Image Reconstruction</span>
                       <div className="flex gap-1.5">
                          <button 
                            onClick={() => copyToClipboard(analysis.imagePrompt, 'imgP')}
                            className="text-[10px] text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded border border-transparent hover:border-indigo-200 transition-all"
                          >
                            {copiedStates['imgP'] ? "Copied" : "Copy Text"}
                          </button>
                          <button 
                            onClick={handleCopyImageJson}
                            className="text-[10px] bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 px-2 py-1 rounded shadow-sm transition-all"
                          >
                            {copiedStates['imgJson'] ? "Copied" : "Copy JSON"}
                          </button>
                       </div>
                     </div>
                     <p className="text-xs text-gray-700 leading-relaxed line-clamp-4 hover:line-clamp-none transition-all cursor-text max-h-32 overflow-y-auto pr-1">{analysis.imagePrompt}</p>
                     
                     {/* Object/Subject Metadata Preview */}
                     <div className="mt-3 pt-2 border-t border-indigo-100 flex gap-1.5 flex-wrap">
                        {analysis.objects?.slice(0, 3).map((o, i) => (
                           <span key={i} className="text-[9px] text-indigo-600 bg-white border border-indigo-100 px-1.5 py-0.5 rounded shadow-sm">{o.label}</span>
                        ))}
                     </div>
                  </div>
                  
                  {/* Video Prompt */}
                  <div className="bg-purple-50/50 rounded-lg p-3 border border-purple-100 flex flex-col h-full">
                     <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-bold text-purple-800 uppercase tracking-wider">Video Cinemagraph</span>
                       <div className="flex gap-1.5">
                          <button 
                            onClick={() => copyToClipboard(analysis.videoPrompt, 'vidP')}
                            className="text-[10px] text-purple-600 hover:bg-purple-100 px-2 py-1 rounded border border-transparent hover:border-purple-200 transition-all"
                          >
                            {copiedStates['vidP'] ? "Copied" : "Copy Text"}
                          </button>
                          <button 
                            onClick={handleCopyVideoJson}
                            className="text-[10px] bg-white text-purple-700 border border-purple-200 hover:bg-purple-50 px-2 py-1 rounded shadow-sm transition-all"
                          >
                            {copiedStates['vidJson'] ? "Copied" : "Copy JSON"}
                          </button>
                       </div>
                     </div>
                     <p className="text-xs text-gray-700 leading-relaxed line-clamp-4 hover:line-clamp-none transition-all cursor-text max-h-32 overflow-y-auto pr-1">{analysis.videoPrompt}</p>
                     
                     <div className="mt-3 pt-2 border-t border-purple-100">
                        <span className="text-[9px] text-purple-600 bg-white px-1.5 py-0.5 rounded border border-purple-100 inline-block">Mood: {analysis.mood}</span>
                     </div>
                  </div>
               </div>

             </div>
           )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-xs text-gray-400 bg-gray-50/50 rounded-lg border border-dashed border-gray-200 m-2">
            <svg className="w-8 h-8 mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <span className="font-medium">Analysis Pending</span>
            <span className="text-[10px] mt-1">Click the button above to generate prompts</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SceneCard;