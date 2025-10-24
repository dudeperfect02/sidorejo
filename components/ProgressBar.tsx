
import React from 'react';

interface ProgressBarProps {
    progress: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
    const cappedProgress = Math.min(100, Math.max(0, progress));

    return (
        <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
            <div
                className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${cappedProgress}%` }}
            ></div>
        </div>
    );
};
