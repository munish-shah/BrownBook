import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: { fs: { allow: ['..'] } },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rolldownOptions: {
            output: {
                codeSplitting: {
                    groups: [
                        { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
                        { name: 'motion', test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/ },
                        { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ }
                    ]
                }
            }
        }
    }
});
