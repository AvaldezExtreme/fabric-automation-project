import React, { useState } from 'react';
import tokenService from '../services/tokenService.js';

function Export({ data, onNext, onBack }) {
  const [loading, setLoading] = useState(false);
  const [expandedSites, setExpandedSites] = useState({});

  const downloadAsZip = async (filesToDownload, zipName) => {
    try {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      
      script.onload = async () => {
        const JSZip = window.JSZip;
        const zip = new JSZip();

        console.log(`📦 Adding ${filesToDownload.length} files to ZIP...`);

        // Add files - ensure content is STRING
        filesToDownload.forEach((file, idx) => {
          try {
            // Convert to string if it's an object
            let content = file.content;
            if (typeof content !== 'string') {
              console.log(`⚠️ File ${idx} (${file.filename}): Converting object to string`);
              content = JSON.stringify(content, null, 2);
            }

            zip.file(file.filename, content);
            console.log(`✅ Added: ${file.filename} (${content.length} bytes)`);
          } catch (error) {
            console.error(`❌ Error adding file ${file.filename}:`, error);
          }
        });

        console.log('💾 Generating ZIP blob...');

        // Generate ZIP
        const blob = await zip.generateAsync({ type: 'blob' });
        console.log(`✅ ZIP generated: ${blob.size} bytes`);

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = zipName;
        document.body.appendChild(link);
        
        console.log(`⬇️ Triggering download: ${zipName}`);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log('✅ ZIP download complete');
      };

      script.onerror = (error) => {
        console.error('❌ Failed to load JSZip from CDN:', error);
        alert('Error: Could not load ZIP library from CDN. Check internet connection.');
      };

      document.head.appendChild(script);
    } catch (error) {
      console.error('❌ ZIP error:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const downloadAllFiles = async () => {
    setLoading(true);
    try {
      console.log('🔄 Fetching configurations...');
      
      const response = await fetch('http://127.0.0.1:3001/api/generate/all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': tokenService.getAuthHeader()
        },
        body: JSON.stringify({
          switches: data.switches,
          serialMap: data.serialMap || {},
          settings: data.settings || {},
          skipSerials: data.skipSerials || false,
          districtName: data.districtName || 'District'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Backend response received');

      const { configs, csv, xiqseConfigs, mgmtCsv } = result;
      const filesToDownload = [];

      // Group switches by site
      const sites = new Map();
      data.switches.forEach(sw => {
        if (!sites.has(sw.siteId)) {
          sites.set(sw.siteId, {
            name: sw.location || `Site${sw.siteId}`,
            switches: []
          });
        }
        sites.get(sw.siteId).switches.push(sw);
      });

      console.log(`📍 Total sites: ${sites.size}`);

      let txtCount = 0, cfgCount = 0, csvCount = 0;

      // Extract files per site
      sites.forEach((siteInfo, siteId) => {
        const siteNameClean = siteInfo.name.replace(/\s+/g, '_');
        const folderName = `${siteNameClean}`;

        // Per-switch .txt files
        if (configs) {
          siteInfo.switches.forEach(sw => {
            const switchKey = Object.keys(configs).find(key => 
              configs[key].filename && configs[key].filename.includes(sw.name)
            );
            
            if (switchKey && configs[switchKey]) {
              const fileData = configs[switchKey];
              let content = fileData.content || fileData;

              // Ensure content is string
              if (typeof content !== 'string') {
                content = JSON.stringify(content);
              }

              filesToDownload.push({
                filename: `${folderName}/${fileData.filename || switchKey}`,
                content: content
              });
              txtCount++;
            }
          });
        }

        // XIQ-SE .cfg files
        if (xiqseConfigs && xiqseConfigs[siteId]) {
          if (xiqseConfigs[siteId].l2) {
            // Extract content from object (backend returns {filename, content})
            let l2Content = xiqseConfigs[siteId].l2.content || xiqseConfigs[siteId].l2;
            if (typeof l2Content !== 'string') {
              l2Content = JSON.stringify(l2Content);
            }
            filesToDownload.push({
              filename: `${folderName}/${xiqseConfigs[siteId].l2.filename || siteNameClean + '-L2.cfg'}`,
              content: l2Content
            });
            cfgCount++;
          }
          if (xiqseConfigs[siteId].l3) {
            // Extract content from object (backend returns {filename, content})
            let l3Content = xiqseConfigs[siteId].l3.content || xiqseConfigs[siteId].l3;
            if (typeof l3Content !== 'string') {
              l3Content = JSON.stringify(l3Content);
            }
            filesToDownload.push({
              filename: `${folderName}/${xiqseConfigs[siteId].l3.filename || siteNameClean + '-L3.cfg'}`,
              content: l3Content
            });
            cfgCount++;
          }
        }
      });

      // Add CSVs (global)
      if (csv && !data.skipSerials) {
        let csvContent = csv.content;
        if (typeof csvContent !== 'string') {
          csvContent = JSON.stringify(csvContent);
        }
        filesToDownload.push({
          filename: csv.filename,
          content: csvContent
        });
        csvCount++;
      }

      if (mgmtCsv) {
        let mgmtContent = mgmtCsv.content;
        if (typeof mgmtContent !== 'string') {
          mgmtContent = JSON.stringify(mgmtContent);
        }
        filesToDownload.push({
          filename: mgmtCsv.filename,
          content: mgmtContent
        });
        csvCount++;
      }

      console.log(`📊 Files ready: ${txtCount} .txt, ${cfgCount} .cfg, ${csvCount} .csv`);
      console.log(`📋 File details:`, filesToDownload.map(f => ({ 
        filename: f.filename, 
        contentType: typeof f.content, 
        contentLength: f.content?.length 
      })));

      if (filesToDownload.length === 0) {
        alert('⚠️ No files generated');
        setLoading(false);
        return;
      }

      // Create ZIP
      const zipName = `${data.districtName || 'District'}-Configs.zip`;
      await downloadAsZip(filesToDownload, zipName);

      alert(`✅ ${filesToDownload.length} files packaged!\n\n📄 ${txtCount} .txt\n⚙️ ${cfgCount} .cfg\n📊 ${csvCount} .csv`);
      setLoading(false);

    } catch (error) {
      console.error('❌ Error:', error);
      alert(`Error: ${error.message}`);
      setLoading(false);
    }
  };

  const siteSwitches = {};
  data.switches?.forEach(sw => {
    if (!siteSwitches[sw.siteId]) {
      siteSwitches[sw.siteId] = {
        location: sw.location,
        switches: []
      };
    }
    siteSwitches[sw.siteId].switches.push(sw);
  });

  const l3Count = data.switches?.filter(s => s.type === 'L3').length || 0;
  const l2Count = data.switches?.filter(s => s.type === 'L2').length || 0;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Export Summary */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>📦 Export Summary</h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem'
        }}>
          <div style={{ padding: '1rem', background: '#f0f0f0', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Total Sites</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{Object.keys(siteSwitches).length}</div>
          </div>
          <div style={{ padding: '1rem', background: '#f0f0f0', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>L3 Switches</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#7519F9' }}>{l3Count}</div>
          </div>
          <div style={{ padding: '1rem', background: '#f0f0f0', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>L2 Switches</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#06b6d4' }}>{l2Count}</div>
          </div>
          <div style={{ padding: '1rem', background: '#f0f0f0', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Total Switches</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{data.switches?.length || 0}</div>
          </div>
        </div>
      </div>

      {/* Expected Files */}
      <div style={{
        padding: '1.5rem',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '6px',
        marginBottom: '2rem',
        color: '#1e40af'
      }}>
        <strong>📊 Files to Download (in ZIP):</strong>
        <div style={{ marginTop: '0.75rem', fontSize: '0.95rem', lineHeight: '1.8' }}>
          📄 <strong>{l3Count} L3 .txt files</strong> (one per L3 switch)<br/>
          📄 <strong>{l2Count} L2 .txt files</strong> (one per L2 switch)<br/>
          ⚙️ <strong>{Object.keys(siteSwitches).length * 2} .cfg files</strong> ({Object.keys(siteSwitches).length} sites × 2)<br/>
          📊 <strong>2 .csv files</strong> (Serials + Management IPs)
        </div>
        <div style={{ marginTop: '1rem', fontSize: '0.9rem', fontWeight: 'bold', color: '#059669' }}>
          ✓ Total: {l3Count + l2Count + (Object.keys(siteSwitches).length * 2) + 2} files
        </div>
      </div>

      {/* Download Button */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>📥 Download Configuration Package</h2>
        <button
          onClick={downloadAllFiles}
          disabled={loading}
          style={{
            width: '100%',
            padding: '1.5rem',
            background: '#7519F9',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? '⏳ Creating ZIP...' : '📦 Download All Files (ZIP)'}
        </button>
        <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#6b7280' }}>
          All files organized by site in a single ZIP file: <strong>{data.districtName || 'District'}-Configs.zip</strong>
        </p>
      </div>

      {/* File Structure Info */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          padding: '1rem',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '6px',
          color: '#1e40af'
        }}>
          <div style={{ fontWeight: '700', marginBottom: '0.5rem' }}>📁 ZIP Structure</div>
          <div style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>
            District-Configs.zip<br/>
            ├── SiteA_Config/<br/>
            │   ├── switch1_L3_config.txt<br/>
            │   ├── L2.cfg<br/>
            │   └── L3.cfg<br/>
            ├── SiteB_Config/<br/>
            │   └── ...<br/>
            ├── device-Serials.csv<br/>
            └── mgmt.csv
          </div>
        </div>

        <div style={{
          padding: '1rem',
          background: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: '6px',
          color: '#15803d'
        }}>
          <div style={{ fontWeight: '700', marginBottom: '0.5rem' }}>✅ Ready for Deployment</div>
          <div style={{ fontSize: '0.9rem' }}>
            All configurations organized by site. XIQ-SE .cfg files ready for import. Serial assignments and management IPs included.
          </div>
        </div>
      </div>

      {/* Sites List */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>
          📍 Configured Sites ({Object.keys(siteSwitches).length})
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1rem'
        }}>
          {Object.entries(siteSwitches).map(([siteId, siteInfo]) => {
            const isExpanded = expandedSites[siteId];
            const l3s = siteInfo.switches.filter(s => s.type === 'L3').length;
            const l2s = siteInfo.switches.filter(s => s.type === 'L2').length;
            return (
              <div key={siteId} style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                overflow: 'hidden'
              }}>
                <div
                  onClick={() => setExpandedSites({ ...expandedSites, [siteId]: !isExpanded })}
                  style={{
                    padding: '1rem',
                    background: '#f9f9f9',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div>Site {siteId}</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'normal', color: '#6b7280' }}>
                      {siteInfo.location}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'normal' }}>
                    {l3s} L3 • {l2s} L2
                  </div>
                  <span>{isExpanded ? '▼' : '▶'}</span>
                </div>

                {isExpanded && (
                  <div style={{ padding: '1rem', background: '#fafafa', borderTop: '1px solid #e5e7eb', fontSize: '0.9rem', color: '#6b7280', lineHeight: '1.8' }}>
                    ✓ {l3s} × L3_config.txt<br/>
                    ✓ {l2s} × L2_config.txt<br/>
                    ✓ 1 × L2.cfg (XIQ-SE)<br/>
                    ✓ 1 × L3.cfg (XIQ-SE)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <button
          onClick={onBack}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#e5e7eb',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          ← Back to Review
        </button>
        <button
          onClick={() => onNext(data)}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#7519F9',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          → Continue to Visualization
        </button>
      </div>
    </div>
  );
}

export default Export;