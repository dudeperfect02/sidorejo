import React, { useState } from 'react';
import { ProgressBar } from './ProgressBar';
import { generateSpeech } from '../services/geminiService';
import type { StoryDetails } from '../services/geminiService';

interface StoryDisplayProps {
    storyChunks: string[];
    storyDetails: StoryDetails | null;
    isLoading: boolean;
    progress: number;
    statusMessage: string;
    error: string | null;
    onDownload: () => void;
}

// --- SVG Icons (No changes needed here) ---

const DownloadIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
    </svg>
);

const SpeakerIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.66 1.905H6.44l4.5 4.5c.944.945 2.56.276 2.56-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
        <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
    </svg>
);

const AudioDownloadIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M12 2.25a.75.75 0 01.75.75v6.94l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
    </svg>
);

const SpinnerIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

// --- WAV Header Helper ---
function addWavHeader(pcmData: Uint8Array, sampleRate: number, numChannels: number, bitsPerSample: number): Uint8Array {
    const dataSize = pcmData.length;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    new Uint8Array(buffer, 44).set(pcmData);
    return new Uint8Array(buffer);
}


export const StoryDisplay: React.FC<StoryDisplayProps> = ({
    storyChunks,
    storyDetails,
    isLoading,
    progress,
    statusMessage,
    error,
    onDownload,
}) => {
    const isFinished = progress === 100 && !isLoading && storyChunks.length > 0;
    const [generatingAudioIndices, setGeneratingAudioIndices] = useState<Set<number>>(new Set());
    const [audioData, setAudioData] = useState<Record<number, string>>({});

    const handleGenerateAudio = async (index: number, text: string) => {
        setGeneratingAudioIndices(prev => new Set(prev).add(index));
        try {
            const audioBase64 = await generateSpeech(text);
            if (audioBase64) {
                setAudioData(prev => ({ ...prev, [index]: audioBase64 }));
            } else {
                console.error(`Failed to generate audio for chunk ${index}: No data received.`);
            }
        } catch (err) {
            console.error(`Error generating audio for chunk ${index}:`, err);
        } finally {
            setGeneratingAudioIndices(prev => {
                const newSet = new Set(prev);
                newSet.delete(index);
                return newSet;
            });
        }
    };

    const handleDownloadAudio = (index: number, base64Data: string) => {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const pcmData = new Uint8Array(byteNumbers);
        const wavData = addWavHeader(pcmData, 24000, 1, 16);
        const blob = new Blob([wavData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `kolom-${index + 1}.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-200">Generated Story</h2>
                {isFinished && (
                    <button
                        onClick={onDownload}
                        className="flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 transition-all duration-200"
                    >
                        <DownloadIcon className="w-5 h-5 mr-2" />
                        Download Story Text
                    </button>
                )}
            </div>

            {(isLoading || (progress > 0 && !isFinished)) && (
                <div className="space-y-3 px-2">
                    <p className="text-indigo-300 animate-pulse text-sm sm:text-base">{statusMessage}</p>
                    <ProgressBar progress={progress} />
                </div>
            )}

            {error && (
                <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-md">
                    <p className="font-bold">An Error Occurred</p>
                    <p className="mt-1 text-sm">{error}</p>
                </div>
            )}

            {!isLoading && !error && storyChunks.length === 0 && (
                 <div className="text-center text-gray-500 py-12 border-2 border-dashed border-gray-700 rounded-lg">
                    <p className="text-lg">Your story will appear here.</p>
                </div>
            )}

            {storyChunks.length > 0 && (
                <div className="[transform:rotateX(180deg)]">
                    <div className="flex overflow-x-auto pb-4 space-x-6 [transform:rotateX(180deg)]">
                        {storyChunks.map((chunk, index) => {
                            const isGenerating = generatingAudioIndices.has(index);
                            const audioBase64 = audioData[index];
                            return (
                                <div key={index} className="flex-shrink-0 w-[90vw] max-w-xl h-[30rem] bg-gray-900/70 rounded-lg border border-gray-700 flex flex-col shadow-md">
                                    <div className="flex justify-between items-center p-3 border-b border-gray-700/50">
                                        <h4 className="font-bold text-indigo-400">Kolom {index + 1}</h4>
                                        <div className="flex items-center">
                                            {audioBase64 ? (
                                                <button 
                                                    onClick={() => handleDownloadAudio(index, audioBase64)}
                                                    className="flex items-center justify-center p-2 rounded-full text-green-400 bg-green-900/50 hover:bg-green-800/70 transition-colors"
                                                    title="Download Audio"
                                                >
                                                    <AudioDownloadIcon className="w-5 h-5" />
                                                </button>
                                            ) : isGenerating ? (
                                                <SpinnerIcon className="w-5 h-5 text-indigo-400" />
                                            ) : (
                                                <button 
                                                    onClick={() => handleGenerateAudio(index, chunk)}
                                                    className="flex items-center justify-center p-2 rounded-full text-indigo-300 bg-indigo-900/60 hover:bg-indigo-800/80 transition-colors disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                                                    title="Generate Audio"
                                                    disabled={isLoading}
                                                >
                                                    <SpeakerIcon className="w-5 h-5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-4 overflow-y-auto flex-grow">
                                        <p className="text-gray-300 whitespace-pre-wrap font-serif text-base leading-relaxed">
                                            {chunk}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
