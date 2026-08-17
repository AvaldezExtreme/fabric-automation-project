import React, { useState } from 'react';
import tokenService from '../services/tokenService.js';

function Upload({ onNext, onError }) {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles[0]) {
      setFile(droppedFiles[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();

    if (!file) {
      onError('Please select a file');
      return;
    }

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      onError('Only .xlsx and .xls files are supported');
      return;
    }

    setLoading(true);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = event.target.result.split(',')[1];

          console.log('Uploading file:', file.name);

          // Send with JWT token from tokenService
          const response = await fetch('http://127.0.0.1:3001/api/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': tokenService.getAuthHeader()
            },
            body: JSON.stringify({
              filename: file.name,
              data: base64
            })
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
          }

          const result = await response.json();
          console.log('Upload response:', result);

          if (result.success) {
            onNext(result.data);
          } else {
            onError(result.error || 'Upload failed');
          }
        } catch (error) {
          console.error('Upload error:', error);
          onError(error.message || 'Upload failed');
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('File read error:', error);
      onError('Failed to read file: ' + error.message);
      setLoading(false);
    }
  };

  return (
    <div className="page-upload">
      <h2>Step 1: Upload Network Configuration File</h2>
      <p className="page-description">Upload your network configuration Excel file to begin</p>

      <form onSubmit={handleUpload}>
        <div
          className={`upload-area ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="upload-icon">📁</div>
          <div className="upload-text">Drag and drop your Excel file here</div>
          <div className="upload-subtext">or click to browse</div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            id="file-input"
          />
          <label htmlFor="file-input" style={{ cursor: 'pointer', width: '100%' }}>
            <div style={{ cursor: 'pointer' }}>
              {file ? (
                <div>
                  <strong>Selected:</strong> {file.name}
                  <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                    Size: {(file.size / 1024).toFixed(2)} KB
                  </div>
                </div>
              ) : (
                <div>Click here to select file</div>
              )}
            </div>
          </label>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <h3>Expected File Format</h3>
          <p>Your Excel file should contain:</p>
          <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
            <li>Multiple sheets (one per site/school)</li>
            <li>Columns: SwitchName, SwitchType (L2/L3), SiteID, Location, etc.</li>
            <li>VLAN information with I-SID mappings</li>
            <li>Management VLAN configuration</li>
          </ul>
        </div>

        <button type="submit" className="btn btn-primary" disabled={!file || loading} style={{ marginTop: '2rem' }}>
          {loading ? <span>⏳ Processing...</span> : <span>📤 Upload & Parse</span>}
        </button>
      </form>
    </div>
  );
}

export default Upload;