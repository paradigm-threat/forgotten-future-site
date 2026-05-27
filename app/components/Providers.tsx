'use client';

import { ThemeProvider } from 'next-themes';
import React from 'react';

/** Static site only — no NextAuth SessionProvider (no /api/auth). */
export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
        </ThemeProvider>
    );
}
