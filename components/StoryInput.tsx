import React from 'react';

interface StoryInputProps {
    prompt: string;
    setPrompt: (value: string) => void;
    onGenerate: () => void;
    onStop: () => void;
    isLoading: boolean;
}

const QuillIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
    </svg>
);

const StopIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
    </svg>
);


export const StoryInput: React.FC<StoryInputProps> = ({ prompt, setPrompt, onGenerate, onStop, isLoading }) => {
    return (
        <div className="bg-gray-800 rounded-lg shadow-lg p-6">
            <label htmlFor="story-prompt" className="block text-lg font-medium text-gray-300 mb-2">
                Your Story Idea
            </label>
            <textarea
                id="story-prompt"
                rows={4}
                className="w-full bg-gray-900 border border-gray-700 rounded-md p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 placeholder-gray-500"
                placeholder="e.g., A detective in a cyberpunk city investigates a case that leads to a conspiracy involving rogue AI..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
            />
            <div className="mt-4 flex justify-end">
                <button
                    onClick={isLoading ? onStop : onGenerate}
                    disabled={!isLoading && !prompt.trim()}
                    className={`flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 transition-all duration-300 transform hover:scale-105 disabled:scale-100 ${
                        isLoading 
                        ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                        : 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 focus:ring-indigo-500'
                    }`}
                >
                    {isLoading ? (
                        <>
                           <StopIcon className="w-5 h-5 mr-2" />
                           Stop Generating
                        </>
                    ) : (
                        <>
                           <QuillIcon className="w-5 h-5 mr-2" />
                           Weave Story
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
