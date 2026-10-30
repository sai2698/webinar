const fs = require('fs');
const path = require('path');

const filePath = path.resolve('apps/web/components/WebinarForm.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize CRLF to LF for consistent replacement
const hadCrlf = content.includes('\r\n');
if (hadCrlf) {
  content = content.replace(/\r\n/g, '\n');
}

// 1. Ensure imports
if (!content.includes("useRef")) {
  content = content.replace(
    "import { useEffect, useState } from 'react';",
    "import { useEffect, useState, useRef } from 'react';\nimport { endpoints } from '@/lib/api';"
  );
}

// 2. Add state and handleFileUpload
const targetFunction = `  const [v, setV] = useState<WebinarFormValues>(initial);

  useEffect(() => {
    setV(initial);
  }, [initial]);

  function set<K extends keyof WebinarFormValues>(key: K, value: WebinarFormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }`;

const replacementFunction = `  const [v, setV] = useState<WebinarFormValues>(initial);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerMode, setBannerMode] = useState<'upload' | 'url'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setV(initial);
    if (initial.bannerUrl) {
      if (initial.bannerUrl.startsWith('http') && !initial.bannerUrl.includes('/uploads/')) {
        setBannerMode('url');
      }
    }
  }, [initial]);

  function set<K extends keyof WebinarFormValues>(key: K, value: WebinarFormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFileUpload(file: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setBannerError('Please select a valid image file (PNG, JPG, WebP, GIF)');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setBannerError('Image file is too large (max 15MB)');
      return;
    }

    setBannerError(null);
    setUploadingBanner(true);
    try {
      const res = await endpoints.uploadImage(file);
      if (res?.url) {
        set('bannerUrl', res.url);
      }
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploadingBanner(false);
    }
  }`;

if (content.includes(targetFunction)) {
  content = content.replace(targetFunction, replacementFunction);
  console.log('Replaced function block');
} else {
  console.error('Target function block not found');
}

// 3. Replace Banner image URL block
const targetBannerBlock = `      <div>
        <label className="label" htmlFor="bannerUrl">
          Banner image URL
        </label>
        <input
          id="bannerUrl"
          className="input"
          value={v.bannerUrl}
          onChange={(e) => set('bannerUrl', e.target.value)}
          placeholder="https://images.unsplash.com/..."
        />
      </div>`;

const replacementBannerBlock = `      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="label mb-0" htmlFor="bannerUrl">
            Webinar Banner Image
          </label>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-white/5 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setBannerMode('upload')}
              className={\`px-2.5 py-1 rounded-md font-medium transition \${
                bannerMode === 'upload'
                  ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }\`}
            >
              Upload Image
            </button>
            <button
              type="button"
              onClick={() => setBannerMode('url')}
              className={\`px-2.5 py-1 rounded-md font-medium transition \${
                bannerMode === 'url'
                  ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }\`}
            >
              Image URL
            </button>
          </div>
        </div>

        {/* Live Banner Preview when an image is present */}
        {v.bannerUrl ? (
          <div className="relative group overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-slate-950 aspect-[16/9] max-h-56 w-full shadow-sm">
            <img
              src={v.bannerUrl}
              alt="Webinar Banner Preview"
              className="h-full w-full object-cover"
              onError={() => setBannerError('Failed to load image preview. Please check URL or upload another.')}
            />
            {/* Top Right Quick Actions Overlay */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition">
              <button
                type="button"
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-black/70 text-white backdrop-blur-md hover:bg-black/90 transition shadow cursor-pointer"
              >
                Change Image
              </button>
              <button
                type="button"
                onClick={() => {
                  set('bannerUrl', '');
                  setBannerError(null);
                }}
                className="p-1 rounded-lg bg-red-600/80 text-white backdrop-blur-md hover:bg-red-600 transition shadow cursor-pointer"
                title="Remove banner"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {/* Bottom info pill */}
            <div className="absolute bottom-2 left-2 pointer-events-none">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/60 text-white/90 backdrop-blur-md">
                16:9 Banner Preview
              </span>
            </div>
          </div>
        ) : null}

        {/* Upload Mode (drag & drop / file input) */}
        {bannerMode === 'upload' && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
            />
            {!v.bannerUrl && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={\`cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition flex flex-col items-center justify-center gap-2 \${
                  isDragging
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-300 dark:border-white/15 hover:border-slate-400 dark:hover:border-white/30 bg-slate-50/50 dark:bg-white/[0.02]'
                }\`}
              >
                {uploadingBanner ? (
                  <div className="flex flex-col items-center gap-2 text-xs text-slate-500">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                    <span>Uploading banner image...</span>
                  </div>
                ) : (
                  <>
                    <div className="h-10 w-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center text-xl">
                      📷
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Click to upload banner or drag and drop
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        PNG, JPG, WebP, GIF up to 15MB (recommended 1920×1080 / 16:9)
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* URL Mode */}
        {bannerMode === 'url' && (
          <div className="space-y-1">
            <input
              id="bannerUrl"
              className="input"
              value={v.bannerUrl}
              onChange={(e) => {
                set('bannerUrl', e.target.value);
                setBannerError(null);
              }}
              placeholder="https://images.unsplash.com/..."
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Paste a direct image link from Unsplash, Cloudinary, or any web host.
            </p>
          </div>
        )}

        {bannerError && (
          <p className="text-xs text-red-500 font-medium">{bannerError}</p>
        )}
      </div>\`;

if (content.includes(targetBannerBlock)) {
  content = content.replace(targetBannerBlock, replacementBannerBlock);
  console.log('Replaced banner block');
} else {
  console.error('Target banner block not found');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated WebinarForm.tsx');

