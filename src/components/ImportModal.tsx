import React, { useState, useRef } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, FileText, ClipboardList } from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [markdown, setMarkdown] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await handleFileLoad(file);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await handleFileLoad(file);
    }
  };

  const handleFileLoad = (file: File): Promise<void> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setMarkdown(event.target.result as string);
        }
        resolve();
      };
      reader.readAsText(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!markdown.trim()) {
      setMessage({ type: 'error', text: 'Please paste markdown or upload a file first.' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/import/md', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ markdown }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMessage({
          type: 'success',
          text: `Import successful! ${data.count} IP records updated/imported.`,
        });
        await onSuccess();
        setTimeout(() => {
          onClose();
          setMarkdown('');
          setMessage(null);
        }, 2000);
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to parse the markdown content. Please verify table column alignment.',
        });
      }
    } catch (err) {
      console.error('Import error:', err);
      setMessage({ type: 'error', text: 'A network error occurred while sending data to the server.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative overflow-hidden max-h-[95vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center">
              <ClipboardList className="w-5 h-5 mr-2 text-emerald-400" />
              Import IP-Freely Inventory
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">
              Bypass local cloud scanner isolation by importing or pasting your local IPAM markdown inventory.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-slate-800/80 p-1.5 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info box explaining why this is needed */}
        <div className="mb-4 p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-xs text-slate-300">
          <p className="font-semibold text-emerald-400 mb-1">
            Why is this recommended?
          </p>
          <p className="leading-relaxed">
            Because this application runs inside a secure, sandboxed Cloud container, its active auto-discovery ping probes cannot directly reach inside your real private physical homelab network. Importing your markdown inventory keeps your dashboard perfectly in sync with all your actual devices!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col space-y-4 overflow-y-auto pr-1">
          {/* File Upload Area */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all ${
              dragActive
                ? 'border-emerald-400 bg-emerald-950/10'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInput}
              accept=".md,.txt"
              className="hidden"
            />
            <Upload className={`w-8 h-8 mb-2 ${dragActive ? 'text-emerald-400' : 'text-slate-500'}`} />
            <p className="text-xs font-semibold text-slate-200">
              Drag & Drop your inventory `.md` file here
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              Or click to browse your computer
            </p>
          </div>

          {/* Text Area for Pasting */}
          <div className="flex flex-col space-y-1.5 flex-1 min-h-[160px]">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center">
              <FileText className="w-3.5 h-3.5 mr-1 text-slate-500" />
              Or Paste Markdown Table
            </label>
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              placeholder="# IP-Freely Inventory&#10;&#10;## Gateway / Router&#10;| IP Address | Hostname | Status | Services & Ports | MAC Address | Notes |&#10;|:---|:---|:---|:---|:---|:---|&#10;| `192.168.2.1` | `omada-controller` | **Active** | [Omada (443)](https://...) | `AA:BB:CC:...` | ..."
              className="w-full flex-1 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none min-h-[160px]"
            />
          </div>

          {/* Feedback message */}
          {message && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start space-x-2.5 ${
                message.type === 'success'
                  ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-950/20 border-rose-500/20 text-rose-300'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700/80 text-xs text-slate-300 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !markdown.trim()}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-xs text-white rounded-xl font-semibold shadow-md shadow-emerald-900/10 transition-colors flex items-center justify-center space-x-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                  <span>Parsing...</span>
                </>
              ) : (
                <span>Import Inventory</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
