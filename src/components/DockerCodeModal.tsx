import React, { useState, useEffect } from 'react';
import { DockerFileItem } from '../types';
import { X, Copy, Check, FileCode, Download, Container } from 'lucide-react';

interface DockerCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DockerCodeModal: React.FC<DockerCodeModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [files, setFiles] = useState<DockerFileItem[]>([]);
  const [activeFileName, setActiveFileName] = useState<string>('docker-compose.yml');
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch('/api/docker-files')
        .then((res) => res.json())
        .then((data: DockerFileItem[]) => {
          setFiles(data);
          if (data.length > 0) setActiveFileName(data[0].name);
        })
        .catch((e) => console.error(e))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activeFile = files.find((f) => f.name === activeFileName);

  const handleCopy = () => {
    if (activeFile) {
      navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleDownloadFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name.replace('templates/', '');
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl p-6 shadow-2xl relative overflow-hidden flex flex-col h-[85vh]">
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Container className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Single-Container Docker & Python Stack</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                FastAPI + asyncio subnet scanner + SQLite backend configured for{' '}
                <span className="font-mono text-emerald-400">network_mode: host</span>.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto py-3 border-b border-slate-800/80">
          {files.map((file) => (
            <button
              key={file.name}
              onClick={() => setActiveFileName(file.name)}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-colors flex items-center space-x-1.5 flex-shrink-0 ${
                activeFileName === file.name
                  ? 'bg-indigo-600 text-white font-semibold shadow-md'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{file.name}</span>
            </button>
          ))}
        </div>

        {/* File Content Code View */}
        <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 my-3 font-mono text-xs overflow-auto text-slate-200 relative">
          {loading ? (
            <div className="text-center py-12 text-slate-500">
              Loading source files...
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-slate-300">
              {activeFile?.content}
            </pre>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-800">
          <div className="text-xs text-slate-500">
            Deploy with: <code className="text-emerald-400 font-mono">docker compose up -d</code>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl font-medium transition-colors inline-flex items-center space-x-1.5"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span>Copy File Content</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadFile}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-xl font-medium transition-colors inline-flex items-center space-x-1.5 shadow-lg shadow-indigo-950/40"
            >
              <Download className="w-4 h-4" />
              <span>Download {activeFileName.replace('templates/', '')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
