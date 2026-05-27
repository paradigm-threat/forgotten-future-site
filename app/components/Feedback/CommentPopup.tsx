'use client';

import React from 'react';
import { X, ExternalLink, Mail } from 'lucide-react';

const FF_STORY_ISSUES_URL = 'https://gitlab.com/clevertree/ff-story/-/issues/new';
const CONTACT_EMAIL = 'ari@asu.edu';

interface CommentPopupProps {
    path: string;
    anchorId: string;
    onClose: () => void;
    onSuccess?: (prUrl: string) => void;
}

/** Feedback via GitLab / email — no serverless /api/comments (zero FOT). */
export const CommentPopup: React.FC<CommentPopupProps> = ({
    path,
    anchorId,
    onClose,
}) => {
    const issueTitle = encodeURIComponent(`Feedback: ${path}#${anchorId}`);
    const issueUrl = `${FF_STORY_ISSUES_URL}?issue[title]=${issueTitle}`;
    const mailSubject = encodeURIComponent(`Forgotten Future feedback: ${path}#${anchorId}`);
    const mailUrl = `mailto:${CONTACT_EMAIL}?subject=${mailSubject}`;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-background/50">
                    <h3 className="text-lg font-bold text-cyan-400">Add Feedback</h3>
                    <button onClick={onClose} className="text-muted hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="text-xs text-muted uppercase tracking-widest font-mono">
                        Section: <span className="text-primary">{path}#{anchorId}</span>
                    </div>

                    <p className="text-sm text-secondary leading-relaxed">
                        In-page PR submission is disabled on this deployment. Open a GitLab issue on{' '}
                        <strong className="text-foreground">ff-story</strong> or email the author directly.
                    </p>

                    <a
                        href={issueUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md font-medium transition-colors"
                    >
                        <ExternalLink size={18} /> Open GitLab issue
                    </a>

                    <a
                        href={mailUrl}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-white/20 hover:border-cyan-500/50 text-secondary hover:text-white rounded-md font-medium transition-colors"
                    >
                        <Mail size={18} /> Email {CONTACT_EMAIL}
                    </a>

                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-2 text-sm text-muted hover:text-white transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
