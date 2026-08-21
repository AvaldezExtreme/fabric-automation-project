// ============================================
// Closet Topology Builder
// Version: V2608211
// Purpose: Derive real network structure from the Closet column.
//   - The MDF closet (closet name contains "MDF") holds the root switch
//   - Each access closet's first switch (-1) uplinks to the MDF root
//   - Additional switches in a closet chain to the previous one
//     (CO-A111-2 -> CO-A111-1, CO-MDF-A115-2 -> CO-MDF-A115-1)
// ============================================

export function suffixNum(name) {
  const m = (name || '').toString().match(/-(\d+)$/);
  return m ? parseInt(m[1]) : 0;
}

export function isMdfSwitch(sw) {
  const closet = (sw.closet || sw.name || '').toString().toUpperCase();
  return closet.includes('MDF');
}

export function buildClosetTopology(switches) {
  // Group switches by closet (falls back to switch name when closet missing)
  const closets = new Map();
  switches.forEach(sw => {
    const key = (sw.closet && sw.closet.toString().trim()) || sw.name;
    if (!closets.has(key)) closets.set(key, []);
    closets.get(key).push(sw);
  });

  // Order within each closet by the switch's numeric suffix (-1, -2, -3)
  closets.forEach(list => list.sort((a, b) => suffixNum(a.name) - suffixNum(b.name)));

  // Find the MDF closet: name contains MDF; fallback to the closet holding
  // an L3 switch; fallback to the first closet
  let mdfKey = [...closets.keys()].find(k => k.toUpperCase().includes('MDF'));
  if (!mdfKey) {
    const withL3 = [...closets.entries()].find(([, list]) => list.some(s => s.type === 'L3'));
    mdfKey = withL3 ? withL3[0] : [...closets.keys()][0];
  }

  const root = closets.get(mdfKey)[0];
  const accessClosets = [...closets.keys()].filter(k => k !== mdfKey);

  // Links: chains inside every closet + uplinks from each access closet head
  const links = [];
  closets.forEach((list, key) => {
    for (let i = 1; i < list.length; i++) {
      links.push({ from: list[i - 1].name, to: list[i].name, kind: 'chain' });
    }
    if (key !== mdfKey && list.length > 0) {
      links.push({ from: root.name, to: list[0].name, kind: 'uplink' });
    }
  });

  return { closets, mdfKey, root, accessClosets, links };
}
