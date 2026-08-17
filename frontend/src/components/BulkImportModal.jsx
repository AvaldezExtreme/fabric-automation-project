import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

function BulkImportModal({ switches, onImport, onClose }) {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [mapping, setMapping] = useState({});
  const [step, setStep] = useState('upload'); // upload, preview, confirm
  const [error, setError] = useState(null);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);

    // Parse file
    if (selectedFile.name.endsWith('.csv')) {
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processFileData(results.data);
        },
        error: (err) => {
          setError(`CSV parsing error: ${err.message}`);
        }
      });
    } else if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const workbook = XLSX.read(event.target.result, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(worksheet);
          processFileData(data);
        } catch (err) {
          setError(`Excel parsing error: ${err.message}`);
        }
      };
      reader.readAsBinaryString(selectedFile);
    } else {
      setError('Please upload a CSV or Excel file');
    }
  };

  const processFileData = (data) => {
    if (!data || data.length === 0) {
      setError('File is empty');
      return;
    }

    console.log('DEBUG BulkImport: Parsed data =', data);

    // Auto-detect column names (handle variations)
    const firstRow = data[0];
    const columns = Object.keys(firstRow);
    console.log('DEBUG BulkImport: Columns =', columns);

    let switchNameCol = null;
    let serialCol = null;

    // Find switch name column (try common variations)
    for (const col of columns) {
      const lower = col.toLowerCase();
      if (lower.includes('switch') || lower.includes('name') || lower.includes('device')) {
        switchNameCol = col;
        break;
      }
    }

    // Find serial column (try common variations)
    for (const col of columns) {
      const lower = col.toLowerCase();
      if (lower.includes('serial') || lower.includes('sn') || lower.includes('number')) {
        serialCol = col;
        break;
      }
    }

    if (!switchNameCol || !serialCol) {
      setError(`Could not auto-detect columns. Expected "Switch Name/Device" and "Serial/SN" columns.`);
      return;
    }

    // Build mapping
    const newMapping = {};
    const unmappedSwitches = new Set(switches.map(s => s.name));

    data.forEach((row, idx) => {
      const switchName = row[switchNameCol]?.trim();
      const serial = row[serialCol]?.trim();

      if (switchName && serial) {
        // Try to find matching switch
        const matchedSwitch = switches.find(s => s.name.toUpperCase() === switchName.toUpperCase());
        
        if (matchedSwitch) {
          newMapping[matchedSwitch.name] = serial;
          unmappedSwitches.delete(matchedSwitch.name);
          console.log(`DEBUG BulkImport [${idx}]: Matched ${switchName} → ${matchedSwitch.name} = ${serial}`);
        } else {
          console.log(`DEBUG BulkImport [${idx}]: No match for switch "${switchName}"`);
        }
      }
    });

    if (Object.keys(newMapping).length === 0) {
      setError('No switches found in the file');
      return;
    }

    setMapping(newMapping);
    setParsedData({
      fileName: file.name,
      matched: Object.keys(newMapping).length,
      total: switches.length,
      unmapped: Array.from(unmappedSwitches),
      switchNameCol,
      serialCol
    });
    setStep('preview');
  };

  const handleConfirmImport = () => {
    onImport(mapping);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        padding: '2rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>📤 Bulk Import Serial Numbers</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: 0
            }}
          >
            ✕
          </button>
        </div>

        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <div>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              Upload a CSV or Excel file with switch names and serial numbers
            </p>

            <div style={{
              border: '2px dashed #9ca3af',
              borderRadius: '8px',
              padding: '2rem',
              textAlign: 'center',
              marginBottom: '1.5rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                style={{
                  display: 'none',
                  cursor: 'pointer'
                }}
                id="bulk-upload"
              />
              <label htmlFor="bulk-upload" style={{ cursor: 'pointer', display: 'block' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📁</div>
                <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                  {file ? file.name : 'Click to upload or drag and drop'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                  CSV or Excel file with "Switch Name" and "Serial Number" columns
                </div>
              </label>
            </div>

            {error && (
              <div style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: '6px',
                padding: '1rem',
                marginBottom: '1.5rem',
                color: '#991b1b'
              }}>
                <strong>Error:</strong> {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={onClose}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={() => {}}
                className="btn btn-primary"
                style={{ flex: 1, opacity: file ? 1 : 0.5, pointerEvents: file ? 'auto' : 'none' }}
              >
                {file ? '✓ File Selected' : 'Select File'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Preview */}
        {step === 'preview' && parsedData && (
          <div>
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '6px',
              padding: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ fontWeight: '600', color: '#15803d', marginBottom: '0.5rem' }}>
                ✓ Import Preview
              </div>
              <div style={{ fontSize: '0.9rem', color: '#166534' }}>
                <div>File: <strong>{parsedData.fileName}</strong></div>
                <div>Matched Switches: <strong>{parsedData.matched} / {parsedData.total}</strong></div>
                <div>Columns Found: Switch Name = <strong>{parsedData.switchNameCol}</strong>, Serial = <strong>{parsedData.serialCol}</strong></div>
              </div>
            </div>

            {parsedData.unmapped.length > 0 && (
              <div style={{
                background: '#fef3c7',
                border: '1px solid #fcd34d',
                borderRadius: '6px',
                padding: '1rem',
                marginBottom: '1.5rem'
              }}>
                <div style={{ fontWeight: '600', color: '#b45309', marginBottom: '0.5rem' }}>
                  ⚠️ Unmapped Switches ({parsedData.unmapped.length})
                </div>
                <div style={{ fontSize: '0.9rem', color: '#92400e' }}>
                  {parsedData.unmapped.slice(0, 5).map(name => (
                    <div key={name}>• {name}</div>
                  ))}
                  {parsedData.unmapped.length > 5 && (
                    <div>• ... and {parsedData.unmapped.length - 5} more</div>
                  )}
                </div>
                <p style={{ fontSize: '0.85rem', color: '#92400e', margin: '0.5rem 0 0 0' }}>
                  These switches will need serial numbers entered manually, or you can go back and fix the file.
                </p>
              </div>
            )}

            <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>Imported Serials:</h4>
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '1rem',
              marginBottom: '1.5rem',
              background: '#f9fafb'
            }}>
              {Object.entries(mapping).map(([switchName, serial]) => (
                <div key={switchName} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid #e5e7eb',
                  fontSize: '0.9rem'
                }}>
                  <strong>{switchName}</strong>
                  <code style={{ background: '#f0f0f0', padding: '0.25rem 0.5rem', borderRadius: '3px' }}>
                    {serial}
                  </code>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => {
                  setStep('upload');
                  setFile(null);
                  setMapping({});
                  setParsedData(null);
                }}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                ← Back
              </button>
              <button
                onClick={handleConfirmImport}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                ✓ Import {parsedData.matched} Serials
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BulkImportModal;