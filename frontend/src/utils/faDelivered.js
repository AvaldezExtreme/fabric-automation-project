// Mirrors backend configGenerator's SSID-skip logic so every display
// surface (Review, Topology detail, PDF) tells the same story as the
// generated .cfg: a VLAN is delivered by Fabric Attach - and therefore
// NOT configured on an L2 access switch - when Extreme wireless is on,
// the switch is L2, the VLAN is SSID-flagged (wizard flag or Configure
// picker), and it is not the switch's management VLAN.
export const isFaDelivered = (vlan, sw, settings) => {
  if (!settings || settings.extremeWireless !== true) return false;
  if (!sw || sw.type !== 'L2') return false;
  const mgmtVlanId = sw.mgmtVlan ? parseInt(sw.mgmtVlan) : 8;
  if (vlan.vlanId === mgmtVlanId) return false;
  return !!vlan.ssid || (settings.ssidVlanIds || []).includes(vlan.vlanId);
};

export const faDeliveredCount = (sw, settings) =>
  (sw.vlans || []).filter(v => isFaDelivered(v, sw, settings)).length;

export const FA_TOOLTIP = 'Delivered by Fabric Attach - not configured on this switch';
