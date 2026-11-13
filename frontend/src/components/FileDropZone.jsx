// Drag-and-drop OR click-to-browse file picker, shared by the Upload page
// and the serial-number bulk import. The whole box is clickable and a
// keyboard-focusable button; drops are handled here (preventDefault), so the
// browser never falls back to downloading/opening the dropped file.

import React, { useRef, useState } from 'react';

function FileDropZone({ accept, onFile, file, title, hint, compact = false }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0); // dragenter/leave fire for children too

  const exts = accept.split(',').map(s => s.trim().toLowerCase());
  const pick = (f) => {
    if (!f) return;
    onFile(f, exts.some(ext => f.name.toLowerCase().endsWith(ext)));
  };

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current && inputRef.current.click()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current.click(); } }}
      onDragEnter={e => { stop(e); depth.current += 1; setOver(true); }}
      onDragOver={e => { stop(e); e.dataTransfer.dropEffect = 'copy'; }}
      onDragLeave={e => { stop(e); depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); }}
      onDrop={e => { stop(e); depth.current = 0; setOver(false); pick(e.dataTransfer.files && e.dataTransfer.files[0]); }}
      style={{
        border: `2px dashed ${over ? '#00CC99' : '#7519F9'}`,
        borderRadius: '12px',
        padding: compact ? '1.5rem 1rem' : '2.25rem 1.5rem',
        textAlign: 'center',
        cursor: 'pointer',
        background: over ? 'rgba(0,204,153,0.12)' : 'rgba(117,25,249,0.07)',
        transition: 'background 0.15s, border-color 0.15s',
        outline: 'none'
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onClick={e => e.stopPropagation()}
        onChange={e => { pick(e.target.files && e.target.files[0]); e.target.value = ''; }}
      />
      <div style={{ fontSize: compact ? '2rem' : '2.6rem', lineHeight: 1 }}>{over ? '📥' : '📁'}</div>
      <div style={{ fontWeight: 700, fontSize: compact ? '1rem' : '1.1rem', color: 'var(--text-primary)', marginTop: '8px' }}>
        {over ? 'Drop it here' : title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Drag &amp; drop the file here</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>or</span>
        <span style={{
          padding: '7px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '0.88rem', color: 'white',
          background: 'linear-gradient(135deg, #7519F9, #5B059C)'
        }}>
          Browse files…
        </span>
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '10px' }}>{hint}</div>
      {file && (
        <div style={{ marginTop: '12px', display: 'inline-block', padding: '6px 12px', borderRadius: '8px', background: 'var(--card-bg)', border: '1px solid #00CC99', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
          ✅ <strong>{file.name}</strong> · {(file.size / 1024).toFixed(1)} KB <span style={{ color: 'var(--text-secondary)' }}>(click or drop to replace)</span>
        </div>
      )}
    </div>
  );
}

export default FileDropZone;
