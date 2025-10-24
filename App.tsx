
import React, { useState, useCallback, useRef } from 'react';
import { StoryInput } from './components/StoryInput';
import { StoryDisplay } from './components/StoryDisplay';
import { generateStory, StoryDetails } from './services/geminiService';

const App: React.FC = () => {
    const [prompt, setPrompt] = useState<string>('');
    const [storyChunks, setStoryChunks] = useState<string[]>([]);
    const [storyDetails, setStoryDetails] = useState<StoryDetails | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [progress, setProgress] = useState<number>(0);
    const [statusMessage, setStatusMessage] = useState<string>('Provide a story idea to begin.');
    const [error, setError] = useState<string | null>(null);
    const isCancelledRef = useRef<boolean>(false);

    const handleGenerate = useCallback(async () => {
        if (!prompt.trim() || isLoading) return;
        
        isCancelledRef.current = false;
        setIsLoading(true);
        setStoryChunks([]);
        setStoryDetails(null);
        setProgress(0);
        setStatusMessage('Initializing story generation...');
        setError(null);

        try {
            await generateStory(prompt, (update) => {
                if (isCancelledRef.current && !update.details) return;

                if (update.chunk) {
                    setStoryChunks(prevChunks => [...prevChunks, update.chunk]);
                }
                if (update.details) {
                    setStoryDetails(update.details);
                }
                setProgress(update.percentage);
                setStatusMessage(update.status);

                if (update.status.startsWith('Error:')) {
                    setError(update.status);
                    setIsLoading(false);
                }
            }, isCancelledRef);
        } catch (e) {
            const errMessage = e instanceof Error ? e.message : 'An unexpected error occurred.';
            setError(`Generation failed: ${errMessage}`);
        } finally {
            setIsLoading(false);
        }
    }, [prompt, isLoading]);

    const handleStop = useCallback(() => {
        isCancelledRef.current = true;
        setStatusMessage("Stopping generation...");
    }, []);
    
    const handleDownload = useCallback(() => {
        if (storyChunks.length === 0) return;

        // FIX: Join without separators for a continuous story text file.
        const fullStory = storyChunks.join('');
        const blob = new Blob([fullStory], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'cerita-ai.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [storyChunks]);

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans flex flex-col items-center p-4 sm:p-6 md:p-8">
            <div className="w-full max-w-4xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">
                        AI Story Weaver
                    </h1>
                    <p className="text-gray-400 mt-2">
                        Craft vast, detailed narratives from a single idea.
                    </p>
                </header>

                <main className="space-y-8">
                    <StoryInput
                        prompt={prompt}
                        setPrompt={setPrompt}
                        onGenerate={handleGenerate}
                        onStop={handleStop}
                        isLoading={isLoading}
                    />
                    <StoryDisplay
                        storyChunks={storyChunks}
                        storyDetails={storyDetails}
                        isLoading={isLoading}
                        progress={progress}
                        statusMessage={statusMessage}
                        error={error}
                        onDownload={handleDownload}
                    />
                </main>
                
                <footer className="text-center mt-12 text-gray-500 text-sm">
                    <p>Powered by Google Gemini. Character target: up to 200,000.</p>
                </footer>
            </div>
        </div>
    );
};

export default App;
