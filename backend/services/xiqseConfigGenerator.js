// XIQ-SE Config Generator
// Generates per-site L2 and L3 configuration templates with actual values

// L2 Template with placeholders
const L2_TEMPLATE = `##this is version 2.0 01-06-2026 – Alex Valdez
## This config is applied under the 'site add actions' for the final site... 
## SLPP Guard will already have been set by XIQ-SE
## added error continue and error stop to the vlan create commands so the script does not abort if vlan is already created on the switch

banner custom

banner motd " *** $<DISTRICT_NAME> *** "
banner motd " "
banner motd "PLEASE DO NOT CONTINUE IF YOU DO NOT HAVE PROPER ACCESS"

banner displaymotd


router isis
spbm 1 multicast ena

#error continue
vlan create 8 name Netmgmt type port 0
#error stop
int vlan 8
mvpn-isid 0
ip spb-multicast enable
vlan i-sid 8 $<L2_ISID_8>
i-sid name $<L2_ISID_8> $<ISID_PREFIX>-Netmgmt

#error continue
vlan create 16 name VoIP type port 0
#error stop
int vlan 16
mvpn-isid 0
ip spb-multicast enable
vlan i-sid 16 $<L2_ISID_16>
i-sid name $<L2_ISID_16> $<ISID_PREFIX>-VoIP

#error continue
vlan create 24 name Security type port 0
#error stop
interface Vlan 24
mvpn-isid 0
ip spb-multicast enable
vlan i-sid 24 $<L2_ISID_24>
i-sid name $<L2_ISID_24> $<ISID_PREFIX>-Security

#error continue
vlan create 32 name StaffWired type port 0
#error stop
int vlan 32
mvpn-isid 0
ip spb-multicast enable
vlan i-sid 32 $<L2_ISID_32>
i-sid name $<L2_ISID_32> $<ISID_PREFIX>-StaffWired

#error continue
vlan create 56 name StudentWired type port 0
#error stop
interface Vlan 56
mvpn-isid 0
ip spb-multicast enable
vlan i-sid 56 $<L2_ISID_56>
i-sid name $<L2_ISID_56> $<ISID_PREFIX>-StudentWired

#error continue
vlan create 80 name Hvac type port 0
#error stop
interface Vlan 80
mvpn-isid 0
ip spb-multicast enable
vlan i-sid 80 $<L2_ISID_80>
i-sid name $<L2_ISID_80> $<ISID_PREFIX>-Hvac

#error continue
vlan create 88 name IoT type port 0
#error stop
interface Vlan 88
mvpn-isid 0
ip spb-multicast enable
vlan i-sid 88 $<L2_ISID_88>
i-sid name $<L2_ISID_88> $<ISID_PREFIX>-IoT

#error continue
vlan i-sid 1 $<L2_ISID_1>
i-sid name $<L2_ISID_1> $<ISID_PREFIX>-Default

#error continue
auto-sense data i-sid $<L2_ISID_32>
auto-sense voice i-sid $<L2_ISID_16> cvid 32
auto-sense fa cam i-sid $<L2_ISID_1>
auto-sense fa wap i-sid $<L2_ISID_8>
auto-sense wait-interval 30
auto-sense fa proxy-no-auth i-sid $<L2_ISID_8>

#to force corp laptops to MACauth instead of 802.1x
#auto-sense eapol multihost eap-mac-max 0
#auto-sense eapol multihost mac-max 30
#auto-sense eapol multihost non-eap-mac-max 30

##slpp-Guard configs for auto-sense ports is pushed via XIQ-SE

#fast and perpetual PoE are not on by default
#poe fast-poe-enable
#poe perpetual-poe-enable


##fail-open i-sid set at port level for all ports
##set fast and perpetual PoE on all interfaces
##some switches may not have PoE
#to account for the different possible port ranges
#error continue
#int gig 1/1-1/16
#int gig 1/1-1/24
#int gig 1/1-1/48
#error stop
#eapol multihost eap-mac-max 0
#eapol multihost mac-max 30
#eapol multihost non-eap-mac-max 30
#eapol fail-open-isid 14$<SiteID>0131
#error continue
#poe fast-poe-enable
#poe perpetual-poe-enable
#error stop



save config
`;

// L3 Template with placeholders
const L3_TEMPLATE = `##this is version 1.0 09-03-2025 – Jake Koch (Colab. Alex Valdez)
## This config is applied under the 'site add actions' for the final site...
##local DHCP server requires dhcp-relay to switch mgmt clip
## added error continue and error stop to the vlan create commands so the script does not abort if vlan is already created on the switch

banner custom

banner motd "$<DISTRICT_NAME>"

banner displaymotd


interface loopback 1
ip address 10.$<SiteID>.1.1/32
enable
router isis
spbm 1 multicast ena
ip-source-address 10.$<SiteID>.1.1
redistribute direct
redistribute direct enable
router isis enable
isis apply redistribute direct

#error continue
vlan create 8 name Netmgmt type port 0
#error stop
interface Vlan 8
ip address 10.1$<SiteID>.8.1/24
ip spb-multicast enable
ip dhcp-relay
ip dhcp-relay fwd-path 10.1.1.202 enable
ip dhcp-relay fwd-path 10.1.1.207 enable
vlan i-sid 8 $<L3_ISID_8>
i-sid name $<L3_ISID_8> $<ISID_PREFIX>-Netmgmt

#error continue
vlan create 16 name VoIP type port 0
#error stop
interface Vlan 16
ip address 10.1$<SiteID>.16.1/24
ip spb-multicast enable
ip dhcp-relay
ip dhcp-relay fwd-path 10.1.1.202 enable
ip dhcp-relay fwd-path 10.1.1.207 enable
vlan i-sid 16 $<L3_ISID_16>
i-sid name $<L3_ISID_16> $<ISID_PREFIX>-VoIP

#error continue
vlan create 24 name Security type port 0
#error stop
interface Vlan 24
ip address 10.1$<SiteID>.24.1/24
ip spb-multicast enable
ip dhcp-relay
ip dhcp-relay fwd-path 10.1.1.202 enable
ip dhcp-relay fwd-path 10.1.1.207 enable
vlan i-sid 24 $<L3_ISID_24>
i-sid name $<L3_ISID_24> $<ISID_PREFIX>-Security

#error continue
vlan create 32 name StaffWired type port 0
#error stop
interface Vlan 32
ip address 10.1$<SiteID>.32.1/23
ip spb-multicast enable
ip dhcp-relay
ip dhcp-relay fwd-path 10.1.1.202 enable
ip dhcp-relay fwd-path 10.1.1.207 enable
vlan i-sid 32 $<L3_ISID_32>
i-sid name $<L3_ISID_32> $<ISID_PREFIX>-StaffWired

#error continue
vlan create 40 name StaffWlan type port 0
#error stop
interface Vlan 40
ip address 10.1$<SiteID>.40.1/22
ip spb-multicast enable
ip dhcp-relay
ip dhcp-relay fwd-path 10.1.1.202 enable
ip dhcp-relay fwd-path 10.1.1.207 enable
vlan i-sid 40 $<L3_ISID_40>
i-sid name $<L3_ISID_40> $<ISID_PREFIX>-StaffWlan

#error continue
vlan create 56 name StudentWired type port 0
#error stop
interface Vlan 56
ip address 10.1$<SiteID>.56.1/24
ip spb-multicast enable
ip dhcp-relay
ip dhcp-relay fwd-path 10.1.1.202 enable
ip dhcp-relay fwd-path 10.1.1.207 enable
vlan i-sid 56 $<L3_ISID_56>
i-sid name $<L3_ISID_56> $<ISID_PREFIX>-StudentWired

#error continue
vlan create 64 name StudentWlan type port 0
#error stop
interface Vlan 64
ip address 10.1$<SiteID>.64.1/21
ip spb-multicast enable
ip dhcp-relay
ip dhcp-relay fwd-path 10.1.1.202 enable
ip dhcp-relay fwd-path 10.1.1.207 enable
vlan i-sid 64 $<L3_ISID_64>
i-sid name $<L3_ISID_64> $<ISID_PREFIX>-StudentWlan

#error continue
vlan create 72 name GuestWlan type port 0
#error stop
interface Vlan 72
ip address 10.1$<SiteID>.72.1/24
ip spb-multicast enable
ip dhcp-relay
ip dhcp-relay fwd-path 10.1.1.202 enable
ip dhcp-relay fwd-path 10.1.1.207 enable
vlan i-sid 72 $<L3_ISID_72>
i-sid name $<L3_ISID_72> $<ISID_PREFIX>-GuestWlan

#error continue
vlan create 80 name Hvac type port 0
#error stop
interface Vlan 80
ip address 10.1$<SiteID>.80.1/24
ip spb-multicast enable
ip dhcp-relay
ip dhcp-relay fwd-path 10.1.1.202 enable
ip dhcp-relay fwd-path 10.1.1.207 enable
vlan i-sid 80 $<L3_ISID_80>
i-sid name $<L3_ISID_80> $<ISID_PREFIX>-Hvac

#error continue
vlan create 88 name IoT type port 0
#error stop
interface Vlan 88
ip address 10.1$<SiteID>.88.1/24
ip spb-multicast enable
ip dhcp-relay
ip dhcp-relay fwd-path 10.1.1.202 enable
ip dhcp-relay fwd-path 10.1.1.207 enable
vlan i-sid 88 $<L3_ISID_88>
i-sid name $<L3_ISID_88> $<ISID_PREFIX>-IoT


cli timeout 65535

#auto-sense data i-sid $<L3_ISID_32>
auto-sense voice i-sid $<L3_ISID_16> cvid 32
auto-sense fa cam i-sid $<L3_ISID_24>
auto-sense fa wap i-sid $<L3_ISID_8>
auto-sense wait-interval 30
auto-sense fa proxy-no-auth i-sid $<L3_ISID_8>

#to force corp laptops to MACauth instead of 802.1x
#auto-sense eapol multihost eap-mac-max 0
#auto-sense eapol multihost mac-max 30
#auto-sense eapol multihost non-eap-mac-max 30


#the switch needs to send SLPP packets
slpp enable
slpp tx-interval 500
slpp vid 8
slpp vid 16
slpp vid 24
slpp vid 32
slpp vid 56
slpp vid 80
slpp vid 88

##slpp-Guard configs for auto-sense ports is pushed via XIQ-SE



#fast and perpetual PoE are not on by default
poe fast-poe-enable
poe perpetual-poe-enable

#DHCP Server links

ip dhcp-relay fwd-path 10.1$<SiteID>.8.1 10.1.1.202
ip dhcp-relay fwd-path 10.1$<SiteID>.8.1 10.1.1.202  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.8.1 10.1.1.202  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.16.1 10.1.1.202
ip dhcp-relay fwd-path 10.1$<SiteID>.16.1 10.1.1.202  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.16.1 10.1.1.202  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.24.1 10.1.1.202
ip dhcp-relay fwd-path 10.1$<SiteID>.24.1 10.1.1.202  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.24.1 10.1.1.202  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.32.1 10.1.1.202
ip dhcp-relay fwd-path 10.1$<SiteID>.32.1 10.1.1.202  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.32.1 10.1.1.202  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.40.1 10.1.1.202
ip dhcp-relay fwd-path 10.1$<SiteID>.40.1 10.1.1.202  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.40.1 10.1.1.202  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.56.1 10.1.1.202
ip dhcp-relay fwd-path 10.1$<SiteID>.56.1 10.1.1.202  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.56.1 10.1.1.202  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.64.1 10.1.1.202
ip dhcp-relay fwd-path 10.1$<SiteID>.64.1 10.1.1.202  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.64.1 10.1.1.202  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.72.1 10.1.1.202
ip dhcp-relay fwd-path 10.1$<SiteID>.72.1 10.1.1.202  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.72.1 10.1.1.202  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.80.1 10.1.1.202
ip dhcp-relay fwd-path 10.1$<SiteID>.80.1 10.1.1.202  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.80.1 10.1.1.202  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.88.1 10.1.1.202
ip dhcp-relay fwd-path 10.1$<SiteID>.88.1 10.1.1.202  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.88.1 10.1.1.202  mode bootp_dhcp

ip dhcp-relay fwd-path 10.1$<SiteID>.8.1 10.1.1.207
ip dhcp-relay fwd-path 10.1$<SiteID>.8.1 10.1.1.207  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.8.1 10.1.1.207  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.16.1 10.1.1.207
ip dhcp-relay fwd-path 10.1$<SiteID>.16.1 10.1.1.207  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.16.1 10.1.1.207  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.24.1 10.1.1.207
ip dhcp-relay fwd-path 10.1$<SiteID>.24.1 10.1.1.207  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.24.1 10.1.1.207  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.32.1 10.1.1.207
ip dhcp-relay fwd-path 10.1$<SiteID>.32.1 10.1.1.207  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.32.1 10.1.1.207  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.40.1 10.1.1.207
ip dhcp-relay fwd-path 10.1$<SiteID>.40.1 10.1.1.207  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.40.1 10.1.1.207  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.56.1 10.1.1.207
ip dhcp-relay fwd-path 10.1$<SiteID>.56.1 10.1.1.207  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.56.1 10.1.1.207  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.64.1 10.1.1.207
ip dhcp-relay fwd-path 10.1$<SiteID>.64.1 10.1.1.207  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.64.1 10.1.1.207  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.72.1 10.1.1.207
ip dhcp-relay fwd-path 10.1$<SiteID>.72.1 10.1.1.207  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.72.1 10.1.1.207  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.80.1 10.1.1.207
ip dhcp-relay fwd-path 10.1$<SiteID>.80.1 10.1.1.207  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.80.1 10.1.1.207  mode bootp_dhcp
ip dhcp-relay fwd-path 10.1$<SiteID>.88.1 10.1.1.207
ip dhcp-relay fwd-path 10.1$<SiteID>.88.1 10.1.1.207  enable
ip dhcp-relay fwd-path 10.1$<SiteID>.88.1 10.1.1.207  mode bootp_dhcp


##fail-open i-sid set at port level for all ports
##set fast and perpetual PoE on all interfaces
##some switches may not have PoE
#to account for the different possible port ranges
#error continue
int gig 1/1-1/16
int gig 1/1-1/24
int gig 1/1-1/48
#error stop
#eapol multihost eap-mac-max 0
#eapol multihost mac-max 30
#eapol multihost non-eap-mac-max 30
#eapol fail-open-isid 14$<SiteID>0131
#error continue
poe fast-poe-enable
poe perpetual-poe-enable
#error stop


save config
`;

export const generateXIQSEConfigs = (switches, districtName) => {
  const configs = {}; // { siteId: { l2: config, l3: config } }
  
  // Group switches by site and type
  const siteGroups = new Map();
  switches.forEach(sw => {
    if (!siteGroups.has(sw.siteId)) {
      siteGroups.set(sw.siteId, { l3: null, l2: null, location: sw.location, isidPrefix: sw.isidPrefix });
    }
    
    if (sw.type === 'L3') {
      siteGroups.get(sw.siteId).l3 = sw;
    } else if (sw.type === 'L2') {
      if (!siteGroups.get(sw.siteId).l2) {
        siteGroups.get(sw.siteId).l2 = sw;
      }
    }
  });
  
  // Generate configs per site
  siteGroups.forEach((group, siteId) => {
    if (group.l3) {
      // Generate L3 config
      let l3Config = L3_TEMPLATE;
      l3Config = l3Config.replace(/\$<SiteID>/g, siteId);
      l3Config = l3Config.replace(/\$<DISTRICT_NAME>/g, districtName);
      l3Config = l3Config.replace(/\$<ISID_PREFIX>/g, group.isidPrefix);
      
      // Replace I-SID placeholders for L3
      l3Config = replaceISIDPlaceholders(l3Config, group.l3.vlans, 'L3');
      
      if (!configs[siteId]) {
        configs[siteId] = {};
      }
      configs[siteId].l3 = {
        filename: `${group.location.replace(/\s+/g, '')}-L3.cfg`,
        content: l3Config
      };
    }
    
    if (group.l2) {
      // Generate L2 config
      let l2Config = L2_TEMPLATE;
      l2Config = l2Config.replace(/\$<DISTRICT_NAME>/g, districtName);
      l2Config = l2Config.replace(/\$<ISID_PREFIX>/g, group.isidPrefix);
      
      // Replace I-SID placeholders for L2
      l2Config = replaceISIDPlaceholders(l2Config, group.l2.vlans, 'L2');
      
      if (!configs[siteId]) {
        configs[siteId] = {};
      }
      configs[siteId].l2 = {
        filename: `${group.location.replace(/\s+/g, '')}-L2.cfg`,
        content: l2Config
      };
    }
  });
  
  return configs;
};

const replaceISIDPlaceholders = (configTemplate, vlans, type) => {
  let config = configTemplate;
  
  // Map VLAN IDs to their I-SIDs
  const vlanIsidMap = {};
  vlans.forEach(vlan => {
    vlanIsidMap[vlan.vlanId] = vlan.isid;
  });
  
  // Standard VLAN IDs to replace
  const vlanIds = [1, 8, 16, 24, 32, 40, 56, 64, 72, 80, 88];
  
  vlanIds.forEach(vlanId => {
    const isid = vlanIsidMap[vlanId] || `12${vlanId.toString().padStart(4, '0')}`;
    const placeholder = `$<${type}_ISID_${vlanId}>`;
    config = config.replace(new RegExp(placeholder, 'g'), isid);
  });
  
  return config;
};