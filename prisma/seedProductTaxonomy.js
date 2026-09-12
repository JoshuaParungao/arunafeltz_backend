require("../src/config/env");
const prisma = require("../src/config/prisma");

const TAXONOMY_DATA = [
  {
    categoryCode: "CAT-ACCESSORIES",
    name: "Accessories",
    description: "Cables, adapters, chargers, hubs, and PC accessories",
    subcategories: [
      {
        categoryCode: "CAT-ACC-CABLE",
        name: "Cables",
        description: "Display, power, data, and audio cables",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["UGREEN", "Baseus", "Belkin", "Anker", "Vention", "Generic"] },
          { name: "Cable Type", type: "text", required: true, suggestions: ["HDMI", "DisplayPort", "USB Type-C", "Ethernet RJ45", "SATA", "Power Cord", "Audio 3.5mm"] },
          { name: "Connector 1", type: "text", required: true, suggestions: ["HDMI Male", "DisplayPort Male", "USB-C Male", "USB-A Male", "RJ45", "IEC C13"] },
          { name: "Connector 2", type: "text", required: true, suggestions: ["HDMI Male", "DisplayPort Male", "USB-C Male", "Lightning", "Micro-USB", "RJ45", "US Standard Plug"] },
          { name: "Length", type: "text", required: true, suggestions: ["0.5m", "1m", "1.5m", "2m", "3m", "5m", "10m"] },
          { name: "Data Transfer Speed", type: "text", required: true, suggestions: ["480 Mbps", "5 Gbps", "10 Gbps", "20 Gbps", "40 Gbps", "N/A"] },
          { name: "Power Delivery / Wattage", type: "text", required: true, suggestions: ["60W", "100W", "240W", "N/A"] },
        ],
      },
      {
        categoryCode: "CAT-ACC-ADAPT",
        name: "Adapters",
        description: "Signal converters, dongles, and power adapters",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["UGREEN", "Baseus", "Vention", "Belkin", "Generic"] },
          { name: "Adapter Type", type: "text", required: true, suggestions: ["Display Converter", "USB Hub Adapter", "OTG", "Audio Jack Adapter", "Power Adapter"] },
          { name: "Input", type: "text", required: true, suggestions: ["USB Type-C", "DisplayPort", "Mini DisplayPort", "HDMI", "USB-A"] },
          { name: "Output", type: "text", required: true, suggestions: ["HDMI", "VGA", "DisplayPort", "DVI", "3.5mm Audio", "Gigabit LAN"] },
          { name: "Compatibility", type: "text", required: true, suggestions: ["Windows / Mac / Android", "Universal", "iOS / iPadOS"] },
          { name: "Power / Wattage", type: "text", required: true, suggestions: ["Bus-Powered", "15W", "30W", "65W", "100W", "N/A"] },
        ],
      },
      {
        categoryCode: "CAT-ACC-HUB",
        name: "Hubs",
        description: "USB hubs and multi-port docking stations",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["UGREEN", "Baseus", "Anker", "Orico", "Vention"] },
          { name: "Interface", type: "text", required: true, suggestions: ["USB Type-C", "Thunderbolt 3", "Thunderbolt 4", "USB 3.0 Type-A"] },
          { name: "Number of Ports", type: "text", required: true, suggestions: ["4 Ports", "5-in-1", "6-in-1", "7-in-1", "8-in-1", "10-in-1", "12-in-1"] },
          { name: "USB Type", type: "text", required: true, suggestions: ["USB 3.0", "USB 3.2 Gen 1", "USB 3.2 Gen 2", "USB 2.0"] },
          { name: "HDMI", type: "text", required: true, suggestions: ["4K @ 30Hz", "4K @ 60Hz", "Dual 4K @ 60Hz", "None"] },
          { name: "Ethernet", type: "text", required: true, suggestions: ["10/100/1000 Mbps Gigabit", "2.5 Gbps", "None"] },
          { name: "Power Delivery", type: "text", required: true, suggestions: ["60W PD", "100W PD Pass-Through", "None"] },
        ],
      },
      {
        categoryCode: "CAT-ACC-CHRG",
        name: "Chargers",
        description: "Wall chargers, GaN adapters, and charging stations",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["UGREEN", "Baseus", "Anker", "Xiaomi", "Generic"] },
          { name: "Charger Type", type: "text", required: true, suggestions: ["GaN Wall Charger", "Standard USB Charger", "Desktop Charging Station", "Car Charger"] },
          { name: "Number of Ports", type: "text", required: true, suggestions: ["1 Port", "2 Ports (1C1A)", "3 Ports (2C1A)", "4 Ports (3C1A)", "6 Ports"] },
          { name: "Output Power (W)", type: "text", required: true, suggestions: ["20W", "30W", "65W", "100W", "140W", "200W"] },
          { name: "Fast Charging Support", type: "text", required: true, suggestions: ["PD 3.0 / QC 4+", "PD 3.1", "QC 3.0", "Samsung Super Fast Charging", "Proprietary"] },
          { name: "Cable Included", type: "text", required: true, suggestions: ["Yes (USB-C to C 1m)", "Yes (USB-C to C 1.5m)", "No (Charger Only)"] },
        ],
      },
      {
        categoryCode: "CAT-ACC-COOL",
        name: "Cooling Accessories",
        description: "Thermal paste, case fans, brackets, and cooling accessories",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Thermal Grizzly", "Arctic", "Cooler Master", "Noctua", "DeepCool", "DarkFlash"] },
          { name: "Accessory Type", type: "text", required: true, suggestions: ["Thermal Paste", "Thermal Pad", "Case Fan 120mm", "Case Fan 140mm", "GPU Anti-Sag Bracket", "Fan Hub / Splitter"] },
          { name: "Fan Size", type: "text", required: true, suggestions: ["120mm", "140mm", "80mm", "N/A"] },
          { name: "Thermal Conductivity", type: "text", required: true, suggestions: ["8.5 W/mK", "12.5 W/mK", "14.2 W/mK", "73 W/mK (Liquid Metal)", "N/A"] },
          { name: "Compatibility", type: "text", required: true, suggestions: ["Universal CPU/GPU", "Standard ATX Case", "Universal"] },
          { name: "RGB Support", type: "text", required: true, suggestions: ["5V 3-Pin ARGB", "12V 4-Pin RGB", "Auto RGB", "Non-RGB"] },
        ],
      },
      {
        categoryCode: "CAT-ACC-OTH",
        name: "Other Accessories",
        description: "Cable management, dust filters, screws, and mounts",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["UGREEN", "Orico", "Generic", "DarkFlash", "North Bayou"] },
          { name: "Product Type", type: "text", required: true, suggestions: ["Cable Ties / Velcro", "Monitor Arm / Desk Mount", "PC Dust Filter", "Motherboard Standoff Screw Kit", "Anti-Static Wrist Strap"] },
          { name: "Material", type: "text", required: true, suggestions: ["Aluminum Alloy", "Steel", "Silicone / Nylon", "Plastic"] },
          { name: "Compatibility", type: "text", required: true, suggestions: ["Universal", "VESA 75x75 / 100x100", "ATX Cases"] },
          { name: "Color", type: "text", required: true, suggestions: ["Black", "White", "Silver", "Gray"] },
          { name: "Dimensions", type: "text", required: true, suggestions: ["Standard", "Compact", "Custom"] },
        ],
      },
    ],
  },
  {
    categoryCode: "CAT-CPU",
    name: "CPU / Processor",
    description: "Desktop, laptop, and server microprocessors",
    subcategories: [
      {
        categoryCode: "CAT-CPU-DESK",
        name: "Desktop CPU",
        description: "Socketed central processing units for desktop PCs",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["AMD", "Intel"] },
          { name: "Series", type: "text", required: true, suggestions: ["Ryzen 5", "Ryzen 7", "Ryzen 9", "Ryzen 3", "Core i5", "Core i7", "Core i9", "Core i3", "Core Ultra 5", "Core Ultra 7", "Core Ultra 9"] },
          { name: "Generation", type: "text", required: true, suggestions: ["Ryzen 5000", "Ryzen 7000", "Ryzen 8000G", "Ryzen 9000", "Intel 12th Gen", "Intel 13th Gen", "Intel 14th Gen", "Core Ultra 200S"] },
          { name: "Socket", type: "text", required: true, suggestions: ["AM4", "AM5", "LGA1700", "LGA1851", "LGA1200"] },
          { name: "Cores", type: "text", required: true, suggestions: ["4 Cores", "6 Cores", "8 Cores", "10 Cores (6P+4E)", "12 Cores", "14 Cores (6P+8E)", "16 Cores", "20 Cores (8P+12E)", "24 Cores (8P+16E)"] },
          { name: "Threads", type: "text", required: true, suggestions: ["4 Threads", "8 Threads", "12 Threads", "16 Threads", "20 Threads", "24 Threads", "32 Threads"] },
          { name: "Base Clock", type: "text", required: true, suggestions: ["2.5 GHz", "3.0 GHz", "3.4 GHz", "3.6 GHz", "3.7 GHz", "3.8 GHz", "4.0 GHz", "4.2 GHz"] },
          { name: "Boost Clock", type: "text", required: true, suggestions: ["4.2 GHz", "4.4 GHz", "4.6 GHz", "5.0 GHz", "5.3 GHz", "5.4 GHz", "5.6 GHz", "5.7 GHz", "6.0 GHz"] },
          { name: "Cache", type: "text", required: true, suggestions: ["16MB L3", "19MB Total", "20MB L3", "32MB L3", "36MB L3", "96MB 3D V-Cache", "128MB 3D V-Cache"] },
          { name: "TDP", type: "text", required: true, suggestions: ["65W", "105W", "125W", "170W", "253W"] },
          { name: "Integrated Graphics", type: "text", required: true, suggestions: ["Radeon Graphics (2CU)", "Radeon 780M", "Intel UHD Graphics 770", "Intel UHD Graphics 730", "None (Discrete GPU Required)"] },
          { name: "Cooler Included", type: "text", required: true, suggestions: ["Yes (Wraith Stealth)", "Yes (Wraith Prism RGB)", "Yes (Intel Laminar RM1)", "No (Heatsink/Cooler Sold Separately)"] },
        ],
      },
      {
        categoryCode: "CAT-CPU-LAP",
        name: "Laptop CPU",
        description: "Mobile BGA processors for laptops and handhelds",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["AMD", "Intel", "Apple", "Qualcomm"] },
          { name: "Series", type: "text", required: true, suggestions: ["Ryzen 5000 Mobile", "Ryzen 7040 / 8040", "Ryzen AI 300", "Core 13th Gen H-Series", "Core Ultra 100H", "Core Ultra 200V", "Snapdragon X Elite"] },
          { name: "Generation", type: "text", required: true, suggestions: ["Zen 3", "Zen 4", "Zen 5", "Raptor Lake", "Meteor Lake", "Lunar Lake"] },
          { name: "Cores", type: "text", required: true, suggestions: ["6 Cores", "8 Cores", "10 Cores", "12 Cores", "14 Cores", "16 Cores"] },
          { name: "Threads", type: "text", required: true, suggestions: ["12 Threads", "16 Threads", "20 Threads", "24 Threads", "32 Threads"] },
          { name: "Base Clock", type: "text", required: true, suggestions: ["1.8 GHz", "2.2 GHz", "2.6 GHz", "3.0 GHz", "3.3 GHz"] },
          { name: "Boost Clock", type: "text", required: true, suggestions: ["4.5 GHz", "4.8 GHz", "5.0 GHz", "5.2 GHz", "5.4 GHz"] },
          { name: "Cache", type: "text", required: true, suggestions: ["16MB L3", "24MB L3", "30MB Intel Smart Cache"] },
          { name: "TDP", type: "text", required: true, suggestions: ["15W", "28W", "35W", "45W", "55W"] },
          { name: "Integrated Graphics", type: "text", required: true, suggestions: ["Radeon 780M", "Radeon 890M", "Intel Arc Graphics", "Intel Iris Xe", "Adreno X1-85"] },
        ],
      },
      {
        categoryCode: "CAT-CPU-SRV",
        name: "Server CPU",
        description: "Enterprise processors for workstations and servers",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["AMD", "Intel"] },
          { name: "Series", type: "text", required: true, suggestions: ["EPYC 9004", "EPYC 8004", "Xeon Scalable 4th Gen (Sapphire Rapids)", "Xeon Scalable 5th Gen (Emerald Rapids)", "Ryzen Threadripper 7000"] },
          { name: "Socket", type: "text", required: true, suggestions: ["SP5", "SP6", "LGA4677", "sTR5", "sTRX5"] },
          { name: "Cores", type: "text", required: true, suggestions: ["16 Cores", "24 Cores", "32 Cores", "48 Cores", "64 Cores", "96 Cores", "128 Cores"] },
          { name: "Threads", type: "text", required: true, suggestions: ["32 Threads", "48 Threads", "64 Threads", "96 Threads", "128 Threads", "192 Threads", "256 Threads"] },
          { name: "Base Clock", type: "text", required: true, suggestions: ["2.0 GHz", "2.4 GHz", "2.8 GHz", "3.2 GHz"] },
          { name: "Boost Clock", type: "text", required: true, suggestions: ["3.7 GHz", "4.0 GHz", "4.2 GHz", "5.1 GHz", "5.3 GHz"] },
          { name: "Cache", type: "text", required: true, suggestions: ["64MB L3", "128MB L3", "256MB L3", "384MB L3", "1152MB 3D V-Cache"] },
          { name: "TDP", type: "text", required: true, suggestions: ["200W", "240W", "280W", "300W", "350W", "400W"] },
          { name: "Memory Channels", type: "text", required: true, suggestions: ["4-Channel", "8-Channel", "12-Channel"] },
          { name: "ECC Support", type: "text", required: true, suggestions: ["Yes (RDIMM / LRDIMM DDR5)", "Yes (Registered DDR4)"] },
          { name: "PCIe Lanes", type: "text", required: true, suggestions: ["64 Lanes PCIe 5.0", "128 Lanes PCIe 5.0"] },
        ],
      },
    ],
  },
  {
    categoryCode: "CAT-GPU",
    name: "GPU / Graphics Card",
    description: "Dedicated graphics cards and accelerators",
    subcategories: [
      {
        categoryCode: "CAT-GPU-GAME",
        name: "Gaming GPU",
        description: "Consumer gaming graphics cards",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["ASUS", "MSI", "Gigabyte", "ZOTAC", "Palit", "GALAX", "Sapphire", "PowerColor", "XFX", "Inno3D"] },
          { name: "Chipset Manufacturer", type: "text", required: true, suggestions: ["NVIDIA", "AMD", "Intel"] },
          { name: "GPU Model", type: "text", required: true, suggestions: ["RTX 3060", "RTX 4060", "RTX 4060 Ti", "RTX 4070 SUPER", "RTX 4070 Ti SUPER", "RTX 4080 SUPER", "RTX 4090", "RX 6600", "RX 7600 XT", "RX 7700 XT", "RX 7800 XT", "RX 7900 GRE", "RX 7900 XTX", "Intel Arc A770"] },
          { name: "VRAM Size", type: "text", required: true, suggestions: ["8 GB", "12 GB", "16 GB", "20 GB", "24 GB"] },
          { name: "VRAM Type", type: "text", required: true, suggestions: ["GDDR6", "GDDR6X"] },
          { name: "Memory Bus", type: "text", required: true, suggestions: ["128-bit", "192-bit", "256-bit", "320-bit", "384-bit"] },
          { name: "Core Clock", type: "text", required: true, suggestions: ["1830 MHz", "1980 MHz", "2200 MHz", "2310 MHz", "2475 MHz"] },
          { name: "Boost Clock", type: "text", required: true, suggestions: ["2460 MHz", "2535 MHz", "2565 MHz", "2610 MHz", "2670 MHz"] },
          { name: "Interface", type: "text", required: true, suggestions: ["PCIe 4.0 x16", "PCIe 4.0 x8", "PCIe 5.0 x16"] },
          { name: "Power Connectors", type: "text", required: true, suggestions: ["1x 8-Pin PCIe", "2x 8-Pin PCIe", "1x 16-Pin 12V-2x6 / 12VHPWR", "None (Slot Powered)"] },
          { name: "Recommended PSU", type: "text", required: true, suggestions: ["450W", "550W", "650W", "750W", "850W", "1000W"] },
          { name: "Length", type: "text", required: true, suggestions: ["200mm (Compact/ITX)", "242mm (Dual-Fan)", "300mm (Triple-Fan)", "336mm (Massive Triple-Fan)"] },
          { name: "Output Ports", type: "text", required: true, suggestions: ["3x DP 1.4a, 1x HDMI 2.1a", "2x DP 1.4a, 2x HDMI 2.1", "3x DP 2.1, 1x HDMI 2.1"] },
        ],
      },
      {
        categoryCode: "CAT-GPU-PRO",
        name: "Professional / Workstation GPU",
        description: "AI, CAD, rendering, and scientific computing GPUs",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["NVIDIA", "AMD", "PNY", "HP", "Dell"] },
          { name: "GPU Model", type: "text", required: true, suggestions: ["RTX A2000", "RTX A4000", "RTX A4500", "RTX A5000", "RTX A6000", "RTX 4000 Ada", "RTX 4500 Ada", "RTX 5000 Ada", "RTX 6000 Ada", "Radeon Pro W7800", "Radeon Pro W7900"] },
          { name: "VRAM Size", type: "text", required: true, suggestions: ["12 GB", "16 GB", "20 GB", "24 GB", "32 GB", "48 GB"] },
          { name: "VRAM Type", type: "text", required: true, suggestions: ["GDDR6 with ECC", "GDDR6X with ECC", "HBM2e"] },
          { name: "Memory Bus", type: "text", required: true, suggestions: ["192-bit", "256-bit", "384-bit"] },
          { name: "ECC Memory Support", type: "text", required: true, suggestions: ["Yes (Error Correcting Code)", "No"] },
          { name: "Compute Performance", type: "text", required: true, suggestions: ["Single-Precision FP32 ~ 19 TFLOPS", "Single-Precision FP32 ~ 38 TFLOPS", "Single-Precision FP32 ~ 91 TFLOPS"] },
          { name: "Power Consumption", type: "text", required: true, suggestions: ["70W", "140W", "200W", "300W"] },
          { name: "Form Factor", type: "text", required: true, suggestions: ["Low-Profile Dual Slot", "Single Slot Full Height", "Dual Slot Full Height"] },
          { name: "Display Outputs", type: "text", required: true, suggestions: ["4x Mini-DisplayPort 1.4a", "4x DisplayPort 1.4a"] },
        ],
      },
      {
        categoryCode: "CAT-GPU-EXT",
        name: "External GPU (eGPU)",
        description: "External graphics card enclosures and docks",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Razer", "GPD", "Minisforum", "Sonnet", "AORUS"] },
          { name: "Interface", type: "text", required: true, suggestions: ["Thunderbolt 3", "Thunderbolt 4", "OCuLink (PCIe 4.0 x4)", "USB4"] },
          { name: "Included GPU", type: "text", required: true, suggestions: ["Enclosure Only (User-Supplied GPU)", "Built-in RTX 4070 8GB", "Built-in Radeon RX 7600M XT"] },
          { name: "Max GPU Length", type: "text", required: true, suggestions: ["Up to 330mm (3-Slot)", "Up to 310mm (Dual-Slot)", "Built-in GPU (Non-upgradable)"] },
          { name: "Power Supply", type: "text", required: true, suggestions: ["650W Internal ATX/SFX", "700W Internal SFX", "240W External Brick", "330W External Brick"] },
          { name: "Host Charging (PD)", type: "text", required: true, suggestions: ["100W Power Delivery", "85W Power Delivery", "65W Power Delivery", "None"] },
          { name: "Ports", type: "text", required: true, suggestions: ["4x USB 3.0, 1x Gigabit LAN", "2x USB-A, 1x SD Card Reader", "None (GPU Passthrough Only)"] },
        ],
      },
    ],
  },
  {
    categoryCode: "CAT-MOBO",
    name: "Motherboard",
    description: "Mainboards for desktop PCs, workstations, and servers",
    subcategories: [
      {
        categoryCode: "CAT-MOBO-DESK",
        name: "Desktop Motherboard",
        description: "Consumer desktop motherboards",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["ASUS", "MSI", "Gigabyte", "ASRock", "Colorful"] },
          { name: "Chipset", type: "text", required: true, suggestions: ["AMD B550", "AMD A520", "AMD B650", "AMD B650E", "AMD X670E", "AMD X870", "AMD X870E", "Intel H610", "Intel B760", "Intel Z790", "Intel Z890", "Intel B860"] },
          { name: "Socket", type: "text", required: true, suggestions: ["AM4", "AM5", "LGA1700", "LGA1851", "LGA1200"] },
          { name: "Form Factor", type: "text", required: true, suggestions: ["ATX", "Micro-ATX (mATX)", "Mini-ITX (mITX)", "E-ATX"] },
          { name: "Memory Type", type: "text", required: true, suggestions: ["DDR4", "DDR5"] },
          { name: "Memory Slots", type: "text", required: true, suggestions: ["2x DIMM Slots", "4x DIMM Slots"] },
          { name: "Max Memory", type: "text", required: true, suggestions: ["64 GB", "96 GB", "128 GB", "192 GB", "256 GB"] },
          { name: "PCIe Slots", type: "text", required: true, suggestions: ["1x PCIe 5.0 x16, 1x PCIe 4.0 x16", "1x PCIe 4.0 x16, 1x PCIe 3.0 x1", "1x PCIe 4.0 x16"] },
          { name: "M.2 Slots", type: "text", required: true, suggestions: ["1x M.2 NVMe PCIe 3.0", "2x M.2 NVMe (1x Gen4, 1x Gen3)", "3x M.2 NVMe PCIe 4.0", "4x M.2 NVMe (1x Gen5, 3x Gen4)"] },
          { name: "SATA Ports", type: "text", required: true, suggestions: ["4x SATA 6Gb/s", "6x SATA 6Gb/s", "2x SATA 6Gb/s"] },
          { name: "Networking", type: "text", required: true, suggestions: ["Gigabit LAN (1GbE)", "2.5 GbE LAN", "2.5 GbE LAN + Wi-Fi 6E + Bluetooth 5.3", "2.5 GbE LAN + Wi-Fi 7 + Bluetooth 5.4", "5 GbE / 10 GbE LAN"] },
          { name: "Audio Chipset", type: "text", required: true, suggestions: ["Realtek ALC897", "Realtek ALC1220", "Realtek ALC4080", "SupremeFX"] },
          { name: "RGB Header", type: "text", required: true, suggestions: ["1x 5V ARGB, 1x 12V RGB", "2x 5V ARGB, 1x 12V RGB", "3x 5V ARGB, 1x 12V RGB", "None"] },
        ],
      },
      {
        categoryCode: "CAT-MOBO-SRV",
        name: "Server Motherboard",
        description: "Workstation and enterprise server mainboards",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Supermicro", "ASRock Rack", "ASUS Server", "Gigabyte Server", "Tyan"] },
          { name: "Socket", type: "text", required: true, suggestions: ["Dual Socket SP5", "Single Socket SP5", "Single Socket SP6", "Dual Socket LGA4677", "Single Socket LGA4677", "sTR5"] },
          { name: "CPU Support", type: "text", required: true, suggestions: ["AMD EPYC 9004 / 9005", "Intel 4th/5th Gen Xeon Scalable", "AMD Threadripper 7000 Series"] },
          { name: "Form Factor", type: "text", required: true, suggestions: ["SSI-EEB", "SSI-CEB", "E-ATX", "Proprietary Server Form Factor"] },
          { name: "Memory Type", type: "text", required: true, suggestions: ["DDR5 ECC RDIMM", "DDR4 ECC RDIMM/LRDIMM"] },
          { name: "Memory Slots", type: "text", required: true, suggestions: ["8x DIMM Slots", "16x DIMM Slots", "24x DIMM Slots"] },
          { name: "Max Memory", type: "text", required: true, suggestions: ["1 TB", "2 TB", "4 TB", "6 TB"] },
          { name: "ECC Support", type: "text", required: true, suggestions: ["Yes (Full ECC RDIMM/3DS RDIMM)"] },
          { name: "PCIe Slots", type: "text", required: true, suggestions: ["4x PCIe 5.0 x16, 3x PCIe 5.0 x8", "7x PCIe 5.0 x16", "2x PCIe 5.0 x16"] },
          { name: "Storage Interfaces", type: "text", required: true, suggestions: ["MCIO PCIe 5.0, SlimSAS, 8x SATA", "4x NVMe U.2 / U.3, 10x SATA 6Gb/s"] },
          { name: "Network Ports", type: "text", required: true, suggestions: ["Dual 10GbE SFP+ LAN", "Dual 10GBase-T LAN", "Dual 1GbE Intel i210-AT"] },
          { name: "Management (IPMI)", type: "text", required: true, suggestions: ["ASPEED AST2600 BMC Dedicated IPMI 2.0 LAN", "ASPEED AST2500 BMC Dedicated LAN"] },
        ],
      },
      {
        categoryCode: "CAT-MOBO-IND",
        name: "Embedded / Industrial Motherboard",
        description: "Industrial, POS, and embedded computing motherboards",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Advantech", "DFI", "ASRock Industrial", "AAEON", "Portwell"] },
          { name: "Form Factor", type: "text", required: true, suggestions: ["3.5\" SBC", "Mini-ITX", "Thin Mini-ITX", "Nano-ITX", "Pico-ITX"] },
          { name: "Processor Support", type: "text", required: true, suggestions: ["Intel Celeron N100 Onboard", "Intel Core 12th/13th Gen LGA1700", "AMD Ryzen Embedded V-Series", "Onboard Atom x6000"] },
          { name: "Memory Type", type: "text", required: true, suggestions: ["DDR4 SO-DIMM", "DDR5 SO-DIMM", "LPDDR4x Onboard"] },
          { name: "Expansion Slots", type: "text", required: true, suggestions: ["1x M.2 Key-M, 1x M.2 Key-E, 1x Mini-PCIe", "1x PCIe 4.0 x16", "1x M.2 B-Key for 4G/5G"] },
          { name: "Operating Temperature", type: "text", required: true, suggestions: ["0°C to 60°C", "-20°C to 70°C (Wide Temp)", "-40°C to 85°C (Extreme Industrial)"] },
          { name: "Power Input", type: "text", required: true, suggestions: ["12V DC-In Jack", "9V - 36V Wide Range DC-In", "Standard 24-Pin ATX"] },
          { name: "Serial Ports", type: "text", required: true, suggestions: ["2x RS232/422/485", "4x RS232, 2x RS485", "6x COM Ports", "None"] },
        ],
      },
    ],
  },
  {
    categoryCode: "CAT-PERIPHERALS",
    name: "Peripherals",
    description: "Input devices, displays, audio gear, and gaming peripherals",
    subcategories: [
      {
        categoryCode: "CAT-PERI-KB",
        name: "Keyboard",
        description: "Mechanical and membrane input keyboards",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Logitech", "Razer", "Keychron", "Royal Kludge (RK)", "Akko", "Redragon", "Corsair", "SteelSeries", "AULA", "Attack Shark"] },
          { name: "Keyboard Type", type: "text", required: true, suggestions: ["Mechanical Keyboard", "Membrane Keyboard", "Optical-Mechanical", "Magnetic Hall Effect (HE)"] },
          { name: "Switch Type", type: "text", required: true, suggestions: ["Linear (Red)", "Tactile (Brown)", "Clicky (Blue)", "Silent Linear (Silent Red/Peach)", "Hall Effect Magnetic Switch", "Membrane Rubber Dome"] },
          { name: "Connectivity", type: "text", required: true, suggestions: ["Wired USB-C", "Tri-Mode (Wired / 2.4GHz Wireless / Bluetooth 5.0)", "Dual-Mode (Wired / Bluetooth)", "Wireless 2.4GHz Dongle Only"] },
          { name: "Form Factor", type: "text", required: true, suggestions: ["100% Full Size (104/108 Keys)", "96% / 1800-Compact (98-100 Keys)", "80% Tenkeyless (TKL / 87 Keys)", "75% Compact (81-84 Keys)", "65% Compact (67-68 Keys)", "60% Mini (61 Keys)"] },
          { name: "Backlight / RGB", type: "text", required: true, suggestions: ["Per-Key RGB South-Facing", "Per-Key RGB North-Facing", "Rainbow Backlight", "Single Color White LED", "Non-Backlit"] },
          { name: "Hot-Swappable", type: "text", required: true, suggestions: ["Yes (5-Pin / 3-Pin Universal Hot-Swap)", "Yes (Outemu 3-Pin Hot-Swap)", "No (Soldered Switches)", "N/A (Membrane)"] },
          { name: "Keycap Material", type: "text", required: true, suggestions: ["Double-shot PBT", "Dye-Sub PBT", "Double-shot ABS", "Laser-Etched ABS"] },
        ],
      },
      {
        categoryCode: "CAT-PERI-MOUSE",
        name: "Mouse",
        description: "Gaming and productivity pointing devices",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Logitech", "Razer", "SteelSeries", "Attack Shark", "VXE / VGN", "Zaopin", "Glorious", "Redragon", "A4Tech / Bloody"] },
          { name: "Sensor Type", type: "text", required: true, suggestions: ["PAW3395 Optical", "PAW3311 Optical", "Hero 25K / Hero 2", "Focus Pro 30K / 35K Optical", "PixArt PMW3325", "Standard Optical"] },
          { name: "Max DPI", type: "text", required: true, suggestions: ["1,000 DPI", "1,600 DPI", "6,400 DPI", "12,000 DPI", "26,000 DPI", "30,000 DPI", "35,000 DPI"] },
          { name: "Connectivity", type: "text", required: true, suggestions: ["Wired USB", "Tri-Mode (Wired / 2.4GHz / BT)", "Dual-Mode (2.4GHz Wireless / Bluetooth)", "2.4GHz Wireless Only"] },
          { name: "Number of Buttons", type: "text", required: true, suggestions: ["3 Buttons (Basic)", "6 Buttons (Standard Gaming)", "7 Buttons", "8 Buttons", "11+ Buttons (MMO/Productivity)"] },
          { name: "Weight", type: "text", required: true, suggestions: ["Ultra-light (<50g)", "Lightweight (50g - 65g)", "Medium (66g - 85g)", "Standard / Heavy (>85g)"] },
          { name: "RGB Lighting", type: "text", required: true, suggestions: ["RGB Chroma / Spectrum", "Underglow RGB", "Logo RGB Only", "No RGB (Battery Saver)"] },
          { name: "Battery Life", type: "text", required: true, suggestions: ["Up to 40 Hours", "Up to 70 Hours", "Up to 100 Hours", "Up to 200+ Hours", "AA/AAA Battery Operated", "Wired (Continuous)"] },
        ],
      },
      {
        categoryCode: "CAT-PERI-MON",
        name: "Monitor",
        description: "Display monitors for gaming, office, and creative work",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["ASUS", "AOC", "ViewSonic", "Samsung", "LG", "Gigabyte", "Koorui", "Titan Army", "Xiaomi", "Dell", "Acer"] },
          { name: "Screen Size", type: "text", required: true, suggestions: ["21.5-inch", "23.8-inch / 24-inch", "27-inch", "31.5-inch / 32-inch", "34-inch Ultrawide", "49-inch Super Ultrawide"] },
          { name: "Resolution", type: "text", required: true, suggestions: ["1920x1080 (FHD 1080p)", "2560x1440 (QHD 2K)", "3440x1440 (UWQHD)", "3840x2160 (UHD 4K)", "1366x768"] },
          { name: "Panel Type", type: "text", required: true, suggestions: ["Fast IPS", "Standard IPS", "VA", "Curved VA (1500R)", "Curved VA (1000R)", "OLED / QD-OLED", "TN"] },
          { name: "Refresh Rate", type: "text", required: true, suggestions: ["60Hz", "75Hz", "100Hz", "144Hz", "165Hz", "180Hz", "240Hz", "360Hz", "540Hz"] },
          { name: "Response Time", type: "text", required: true, suggestions: ["0.03ms GtG (OLED)", "0.5ms MPRT", "1ms GtG", "1ms MPRT", "4ms GtG", "5ms"] },
          { name: "Aspect Ratio", type: "text", required: true, suggestions: ["16:9 Standard", "21:9 Ultrawide", "32:9 Super Ultrawide", "16:10 Productivity"] },
          { name: "HDR Support", type: "text", required: true, suggestions: ["HDR10", "VESA DisplayHDR 400", "VESA DisplayHDR 600", "VESA True Black 400 (OLED)", "None"] },
          { name: "Ports", type: "text", required: true, suggestions: ["1x HDMI, 1x VGA", "2x HDMI 2.0, 1x DP 1.4, Audio Out", "2x HDMI 2.1, 1x DP 1.4, USB Hub", "1x DP 1.4, 2x HDMI 2.0, Type-C 65W PD"] },
          { name: "Adaptive Sync", type: "text", required: true, suggestions: ["AMD FreeSync Premium / G-Sync Compatible", "AMD FreeSync", "Adaptive Sync", "None"] },
        ],
      },
      {
        categoryCode: "CAT-PERI-AUDIO",
        name: "Headset / Audio",
        description: "Gaming headsets, headphones, and earphones",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Logitech G", "Razer", "HyperX", "SteelSeries", "Corsair", "JBL", "Redragon", "Fantech", "Tangzu", "Moondrop", "KZ"] },
          { name: "Headset Type", type: "text", required: true, suggestions: ["Over-Ear Closed Back", "Over-Ear Open Back", "In-Ear Monitors (IEM)", "TWS True Wireless Earbuds"] },
          { name: "Driver Size", type: "text", required: true, suggestions: ["40mm Dynamic Driver", "50mm Dynamic Driver", "53mm Neodymium Driver", "10mm Dynamic Driver (IEM)", "Planar Magnetic Driver"] },
          { name: "Frequency Response", type: "text", required: true, suggestions: ["20Hz - 20,000Hz", "15Hz - 25,000Hz", "10Hz - 40,000Hz (Hi-Res)"] },
          { name: "Connectivity", type: "text", required: true, suggestions: ["3.5mm Audio Jack", "USB-A Wired", "Tri-Mode (Wired 3.5mm / 2.4GHz Wireless / Bluetooth)", "2.4GHz Wireless Dongle + USB", "Bluetooth 5.3"] },
          { name: "Microphone", type: "text", required: true, suggestions: ["Detachable Cardioid Mic", "Flip-to-Mute Boom Mic", "Retractable Mic", "In-line Cable Mic", "None (Headphones/IEM Only)"] },
          { name: "Surround Sound", type: "text", required: true, suggestions: ["7.1 Virtual Surround Sound", "DTS Headphone:X 2.0", "THX Spatial Audio", "Stereo"] },
          { name: "Noise Cancellation", type: "text", required: true, suggestions: ["Active Noise Cancellation (ANC)", "Passive Noise Isolation", "ENC (Mic Noise Cancellation Only)", "None"] },
        ],
      },
      {
        categoryCode: "CAT-PERI-CAM",
        name: "Webcam",
        description: "Webcams for streaming, conferencing, and content creation",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Logitech", "Razer", "Elgato", "OBSBOT", "Anker", "Rapoo", "Generic"] },
          { name: "Resolution", type: "text", required: true, suggestions: ["720p HD", "1080p Full HD", "2K QHD (1440p)", "4K UHD (2160p)"] },
          { name: "Frame Rate", type: "text", required: true, suggestions: ["30 fps", "60 fps", "120 fps (at 720p/1080p)"] },
          { name: "Field of View (FOV)", type: "text", required: true, suggestions: ["65°", "78°", "90° Wide Angle", "Adjustable 65°-90°"] },
          { name: "Focus Type", type: "text", required: true, suggestions: ["Auto Focus", "Fixed Focus", "AI Tracking Auto Focus"] },
          { name: "Microphone", type: "text", required: true, suggestions: ["Dual Stereo Noise-Reducing Mics", "Built-in Mono Mic", "Omnidirectional Mic", "None"] },
          { name: "Connection Type", type: "text", required: true, suggestions: ["USB 2.0 Type-A", "USB 3.0 Type-A", "USB Type-C"] },
          { name: "Privacy Shutter", type: "text", required: true, suggestions: ["Built-in Sliding Shutter", "Attachable Lens Cap", "Electronic Privacy Switch", "None"] },
        ],
      },
      {
        categoryCode: "CAT-PERI-SPK",
        name: "Speakers",
        description: "Desktop speakers, soundbars, and speaker systems",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Logitech", "Edifier", "Creative", "Razer", "Redragon", "Fantech"] },
          { name: "Configuration", type: "text", required: true, suggestions: ["2.0 Stereo Speakers", "2.1 Speaker System (with Subwoofer)", "Desktop Soundbar", "5.1 Surround System"] },
          { name: "Total RMS Power", type: "text", required: true, suggestions: ["6W RMS", "10W RMS", "24W RMS", "42W RMS", "60W RMS", "120W Peak / 60W RMS", "200W RMS"] },
          { name: "Connectivity", type: "text", required: true, suggestions: ["3.5mm AUX + USB Power", "Bluetooth + 3.5mm AUX", "Bluetooth + Optical + AUX", "USB Digital Audio"] },
          { name: "Frequency Response", type: "text", required: true, suggestions: ["50Hz - 20,000Hz", "40Hz - 20,000Hz", "80Hz - 18,000Hz"] },
          { name: "Subwoofer Included", type: "text", required: true, suggestions: ["Yes (Dedicated Subwoofer)", "No (Integrated Bass Ports)"] },
          { name: "Control Interface", type: "text", required: true, suggestions: ["Knob on Satellite Speaker", "Wired Control Pod", "Wireless Remote Control", "Buttons on Soundbar"] },
        ],
      },
      {
        categoryCode: "CAT-PERI-MIC",
        name: "Microphone",
        description: "USB and XLR standalone studio/streaming microphones",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Fifine", "HyperX", "Razer", "Elgato", "Audio-Technica", "Shure", "Rode", "Maono", "Boyam"] },
          { name: "Transducer Type", type: "text", required: true, suggestions: ["Condenser", "Dynamic", "Electret"] },
          { name: "Polar Pattern", type: "text", required: true, suggestions: ["Cardioid", "Multi-Pattern (Cardioid/Omni/Bidirectional/Stereo)", "Omnidirectional"] },
          { name: "Frequency Response", type: "text", required: true, suggestions: ["20Hz - 20,000Hz", "50Hz - 16,000Hz", "20Hz - 18,000Hz"] },
          { name: "Bit Depth / Sample Rate", type: "text", required: true, suggestions: ["16-bit / 48kHz", "24-bit / 96kHz", "24-bit / 192kHz", "Analog (XLR)"] },
          { name: "Connectivity", type: "text", required: true, suggestions: ["USB Type-C / USB-A", "XLR 3-Pin", "Dual Interface (USB-C & XLR)"] },
          { name: "Mount Type", type: "text", required: true, suggestions: ["Desktop Stand Included", "Shock Mount + Boom Arm", "Built-in Tripod Stand"] },
          { name: "Gain Control", type: "text", required: true, suggestions: ["Physical Knob + Tap-to-Mute", "Physical Gain Knob Only", "Software Controlled", "None"] },
        ],
      },
      {
        categoryCode: "CAT-PERI-CTRL",
        name: "Controller / Gamepad",
        description: "Gamepads and controllers for PC and console gaming",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Microsoft Xbox", "Sony PlayStation", "8BitDo", "Gamesir", "Flydigi", "Logitech", "Machenike", "IINE"] },
          { name: "Compatibility", type: "text", required: true, suggestions: ["PC / Android / iOS / Switch", "PC / Xbox Series X|S / Xbox One", "PC / PS5 / PS4", "Universal Multi-Platform"] },
          { name: "Connectivity", type: "text", required: true, suggestions: ["Tri-Mode (Bluetooth / 2.4GHz Wireless / USB-C)", "Bluetooth + USB-C", "2.4GHz Wireless + USB-C", "Wired USB Only"] },
          { name: "Vibration Feedback", type: "text", required: true, suggestions: ["Dual Rumble Motors", "Hall Effect Linear Motors", "Haptic Feedback (DualSense)", "None"] },
          { name: "Programmable Buttons", type: "text", required: true, suggestions: ["2 Back Paddle Buttons", "4 Back Paddle Buttons", "None (Standard Layout)"] },
          { name: "Battery Life", type: "text", required: true, suggestions: ["Up to 20 Hours (Built-in Rechargeable)", "Up to 40 Hours (Built-in Rechargeable)", "AA Battery Powered (~40h)", "Wired (No Battery)"] },
          { name: "Audio Jack", type: "text", required: true, suggestions: ["3.5mm Headset Jack Included", "None"] },
        ],
      },
    ],
  },
  {
    categoryCode: "CAT-RAM",
    name: "RAM / Memory",
    description: "Random access memory modules for desktop, laptop, and server",
    subcategories: [
      {
        categoryCode: "CAT-RAM-DESK",
        name: "Desktop RAM",
        description: "UDIMM memory kits for desktop motherboards",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["G.Skill", "Corsair", "Kingston Fury", "TeamGroup T-Force", "ADATA XPG", "Patriot Viper", "Crucial", "Lexar"] },
          { name: "Series", type: "text", required: true, suggestions: ["Trident Z5 / Ripjaws", "Vengeance RGB / LPX", "Fury Beast / Renegade", "Delta RGB / Vulcan", "XPG Lancer / Spectrix", "Crucial Pro"] },
          { name: "Memory Type", type: "text", required: true, suggestions: ["DDR5", "DDR4", "DDR3"] },
          { name: "Capacity", type: "text", required: true, suggestions: ["8 GB (Single Stick)", "16 GB (Single Stick)", "16 GB (2x8GB Kit)", "32 GB (Single Stick)", "32 GB (2x16GB Kit)", "48 GB (2x24GB Kit)", "64 GB (2x32GB Kit)", "96 GB (2x48GB Kit)", "128 GB (4x32GB Kit)"] },
          { name: "Configuration", type: "text", required: true, suggestions: ["Single Channel (1x Module)", "Dual Channel (2x Modules Kit)", "Quad Channel (4x Modules Kit)"] },
          { name: "Speed / Frequency", type: "text", required: true, suggestions: ["3200 MHz", "3600 MHz", "5200 MHz", "5600 MHz", "6000 MHz", "6400 MHz", "6800 MHz", "7200 MHz", "8000 MHz"] },
          { name: "CAS Latency", type: "text", required: true, suggestions: ["CL16", "CL18", "CL30", "CL32", "CL36", "CL38", "CL40"] },
          { name: "Voltage", type: "text", required: true, suggestions: ["1.2V", "1.25V", "1.35V", "1.4V", "1.45V"] },
          { name: "Heatsink", type: "text", required: true, suggestions: ["Aluminum Heatspreader", "Low-Profile Aluminum", "None (Bare PCB)"] },
          { name: "RGB Lighting", type: "text", required: true, suggestions: ["Addressable RGB (Sync Supported)", "Non-RGB (Stealth Black/White)"] },
        ],
      },
      {
        categoryCode: "CAT-RAM-LAP",
        name: "Laptop RAM (SO-DIMM)",
        description: "Small outline DIMM memory for laptops and mini PCs",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Crucial", "Kingston Fury", "Samsung", "SK Hynix", "TeamGroup", "Corsair Vengeance", "ADATA"] },
          { name: "Series", type: "text", required: true, suggestions: ["Crucial Basics / Pro", "Fury Impact", "Vengeance SO-DIMM", "OEM Equivalent"] },
          { name: "Memory Type", type: "text", required: true, suggestions: ["DDR5 SO-DIMM", "DDR4 SO-DIMM", "DDR3L SO-DIMM"] },
          { name: "Capacity", type: "text", required: true, suggestions: ["8 GB", "16 GB", "16 GB (2x8GB Kit)", "32 GB", "32 GB (2x16GB Kit)", "64 GB (2x32GB Kit)"] },
          { name: "Configuration", type: "text", required: true, suggestions: ["1x Module (Single)", "2x Modules Kit (Dual Channel)"] },
          { name: "Speed / Frequency", type: "text", required: true, suggestions: ["2666 MHz", "3200 MHz", "4800 MHz", "5200 MHz", "5600 MHz"] },
          { name: "CAS Latency", type: "text", required: true, suggestions: ["CL19", "CL20", "CL22", "CL38", "CL40", "CL46"] },
          { name: "Voltage", type: "text", required: true, suggestions: ["1.1V (DDR5 standard)", "1.2V (DDR4 standard)", "1.35V (DDR3L)"] },
          { name: "Pin Count", type: "text", required: true, suggestions: ["262-Pin (DDR5)", "260-Pin (DDR4)", "204-Pin (DDR3)"] },
        ],
      },
      {
        categoryCode: "CAT-RAM-SRV",
        name: "Server RAM",
        description: "Error-correcting code registered memory for servers",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Samsung", "SK Hynix", "Micron / Crucial Server", "Kingston Server Premier"] },
          { name: "Memory Type", type: "text", required: true, suggestions: ["DDR5 RDIMM", "DDR4 RDIMM", "DDR4 LRDIMM"] },
          { name: "Capacity", type: "text", required: true, suggestions: ["16 GB", "32 GB", "64 GB", "96 GB", "128 GB", "256 GB"] },
          { name: "Speed / Frequency", type: "text", required: true, suggestions: ["2933 MHz", "3200 MHz", "4800 MHz", "5600 MHz", "6400 MHz"] },
          { name: "ECC Type", type: "text", required: true, suggestions: ["Registered ECC (RDIMM)", "Load-Reduced ECC (LRDIMM)", "Unbuffered ECC (ECC UDIMM)"] },
          { name: "Rank", type: "text", required: true, suggestions: ["1Rx4 (Single Rank)", "1Rx8", "2Rx4 (Dual Rank)", "2Rx8", "4Rx4 (Quad Rank / 3DS)"] },
          { name: "Voltage", type: "text", required: true, suggestions: ["1.1V", "1.2V"] },
          { name: "Registered / Unbuffered", type: "text", required: true, suggestions: ["Registered (Buffered)", "Unbuffered"] },
        ],
      },
    ],
  },
  {
    categoryCode: "CAT-STORAGE",
    name: "Storage",
    description: "Hard drives, solid state drives, and external storage",
    subcategories: [
      {
        categoryCode: "CAT-STRG-HDD",
        name: "HDD (Hard Disk Drive)",
        description: "Mechanical magnetic storage hard drives",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Seagate", "Western Digital (WD)", "Toshiba"] },
          { name: "Series", type: "text", required: true, suggestions: ["Seagate Barracuda", "Seagate IronWolf (NAS)", "Seagate SkyHawk (Surveillance)", "WD Blue", "WD Black", "WD Red Plus (NAS)", "WD Purple (Surveillance)", "Toshiba DT01"] },
          { name: "Form Factor", type: "text", required: true, suggestions: ["3.5-inch Desktop", "2.5-inch Laptop"] },
          { name: "Capacity", type: "text", required: true, suggestions: ["500 GB", "1 TB", "2 TB", "4 TB", "6 TB", "8 TB", "10 TB", "12 TB", "16 TB", "20 TB"] },
          { name: "Interface", type: "text", required: true, suggestions: ["SATA III (6.0 Gb/s)"] },
          { name: "Rotational Speed (RPM)", type: "text", required: true, suggestions: ["5400 RPM", "7200 RPM"] },
          { name: "Cache", type: "text", required: true, suggestions: ["64 MB", "128 MB", "256 MB", "512 MB"] },
          { name: "Workload Rating", type: "text", required: true, suggestions: ["Standard Desktop (55 TB/year)", "NAS 24/7 (180 TB/year)", "Surveillance 24/7 (180 TB/year)", "Enterprise (550 TB/year)"] },
        ],
      },
      {
        categoryCode: "CAT-STRG-SATA",
        name: "SATA SSD",
        description: "2.5-inch SATA internal solid state drives",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Kingston", "Samsung", "Crucial", "Western Digital (WD)", "TeamGroup", "Lexar", "ADATA", "Patriot"] },
          { name: "Series", type: "text", required: true, suggestions: ["Kingston A400", "Samsung 870 EVO", "Crucial BX500", "Crucial MX500", "WD Green", "WD Blue SA510", "TeamGroup GX2 / CX2"] },
          { name: "Form Factor", type: "text", required: true, suggestions: ["2.5-inch (7mm)"] },
          { name: "Capacity", type: "text", required: true, suggestions: ["120 GB / 128 GB", "240 GB / 256 GB", "480 GB / 512 GB", "960 GB / 1 TB", "2 TB", "4 TB"] },
          { name: "Interface", type: "text", required: true, suggestions: ["SATA III (6.0 Gb/s)"] },
          { name: "Sequential Read", type: "text", required: true, suggestions: ["500 MB/s", "520 MB/s", "540 MB/s", "560 MB/s"] },
          { name: "Sequential Write", type: "text", required: true, suggestions: ["450 MB/s", "500 MB/s", "520 MB/s", "530 MB/s"] },
          { name: "NAND Flash Type", type: "text", required: true, suggestions: ["3D TLC NAND", "3D QLC NAND"] },
          { name: "TBW", type: "text", required: true, suggestions: ["40 TBW", "80 TBW", "150 TBW", "300 TBW", "600 TBW", "1200 TBW"] },
        ],
      },
      {
        categoryCode: "CAT-STRG-NVME",
        name: "NVMe SSD",
        description: "M.2 PCIe NVMe high-speed solid state drives",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Samsung", "Kingston", "Western Digital (WD)", "Crucial", "TeamGroup", "Lexar", "ADATA XPG", "Seagate", "Corsair"] },
          { name: "Series", type: "text", required: true, suggestions: ["Samsung 990 PRO / 980", "Kingston NV2 / NV3 / KC3000", "WD Black SN850X / SN770", "Crucial T500 / P3 Plus", "TeamGroup MP44 / MP33", "Lexar NM790"] },
          { name: "Form Factor", type: "text", required: true, suggestions: ["M.2 2280", "M.2 2230 (Handheld / Steam Deck)", "M.2 2242"] },
          { name: "Capacity", type: "text", required: true, suggestions: ["250 GB / 256 GB", "500 GB / 512 GB", "1 TB", "2 TB", "4 TB"] },
          { name: "Interface", type: "text", required: true, suggestions: ["PCIe 4.0 x4 NVMe 1.4", "PCIe 4.0 x4 NVMe 2.0", "PCIe 3.0 x4 NVMe 1.3", "PCIe 5.0 x4 NVMe 2.0"] },
          { name: "Sequential Read", type: "text", required: true, suggestions: ["2,100 MB/s", "3,500 MB/s", "5,000 MB/s", "6,000 MB/s", "7,000 MB/s", "7,450 MB/s", "12,000+ MB/s (Gen5)"] },
          { name: "Sequential Write", type: "text", required: true, suggestions: ["1,700 MB/s", "3,000 MB/s", "4,200 MB/s", "6,000 MB/s", "6,900 MB/s", "11,000+ MB/s (Gen5)"] },
          { name: "Controller", type: "text", required: true, suggestions: ["Samsung Pascal / In-House", "Phison E18", "Phison E27T (DRAM-less)", "Maxio MAP1602 (DRAM-less)", "Silicon Motion SM2269XT"] },
          { name: "DRAM Cache", type: "text", required: true, suggestions: ["DRAM-less (with HMB support)", "1 GB LPDDR4 / DDR4 DRAM", "2 GB LPDDR4 / DDR4 DRAM", "4 GB LPDDR4 DRAM"] },
          { name: "TBW", type: "text", required: true, suggestions: ["150 TBW", "300 TBW", "600 TBW", "1200 TBW", "2400 TBW"] },
        ],
      },
      {
        categoryCode: "CAT-STRG-EXTHDD",
        name: "External HDD",
        description: "Portable and desktop external hard drives",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Seagate", "Western Digital (WD)", "Toshiba", "Transcend", "ADATA"] },
          { name: "Capacity", type: "text", required: true, suggestions: ["1 TB", "2 TB", "4 TB", "5 TB", "6 TB", "8 TB", "12 TB"] },
          { name: "Interface", type: "text", required: true, suggestions: ["USB 3.2 Gen 1 (USB 3.0 Type-A)", "USB Type-C", "Micro-B USB 3.0"] },
          { name: "Form Factor", type: "text", required: true, suggestions: ["2.5-inch Portable", "3.5-inch Desktop (with AC adapter)"] },
          { name: "Encryption", type: "text", required: true, suggestions: ["256-bit AES Hardware Encryption", "Password Protection via Software", "None"] },
          { name: "Power Source", type: "text", required: true, suggestions: ["USB Bus-Powered", "External AC Power Adapter"] },
          { name: "Shock Resistance", type: "text", required: true, suggestions: ["Military-Grade Shockproof (Silicone Casing)", "Standard Enclosure"] },
        ],
      },
      {
        categoryCode: "CAT-STRG-EXTSSD",
        name: "External SSD",
        description: "High-speed portable solid state drives",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["Samsung", "SanDisk", "Crucial", "Kingston", "Western Digital", "Lexar"] },
          { name: "Capacity", type: "text", required: true, suggestions: ["500 GB", "1 TB", "2 TB", "4 TB"] },
          { name: "Interface", type: "text", required: true, suggestions: ["USB 3.2 Gen 2 (10 Gbps) Type-C", "USB 3.2 Gen 2x2 (20 Gbps) Type-C", "USB4 / Thunderbolt 3 (40 Gbps)"] },
          { name: "Sequential Read", type: "text", required: true, suggestions: ["520 MB/s", "1,050 MB/s", "2,000 MB/s", "3,000+ MB/s"] },
          { name: "Sequential Write", type: "text", required: true, suggestions: ["500 MB/s", "1,000 MB/s", "2,000 MB/s", "2,800+ MB/s"] },
          { name: "Rugged / Water Resistant", type: "text", required: true, suggestions: ["IP55 / IP65 Dust & Water Resistant", "Drop Resistant up to 2 Meters", "Standard Metal/Plastic Body"] },
          { name: "Encryption", type: "text", required: true, suggestions: ["AES 256-bit Hardware Encryption", "Password Protected", "None"] },
        ],
      },
      {
        categoryCode: "CAT-STRG-USB",
        name: "USB Flash Drive",
        description: "Thumb drives and OTG flash memory",
        attributeSchema: [
          { name: "Brand", type: "text", required: true, suggestions: ["SanDisk", "Kingston", "Samsung", "Transcend", "Lexar", "PNY"] },
          { name: "Capacity", type: "text", required: true, suggestions: ["16 GB", "32 GB", "64 GB", "128 GB", "256 GB", "512 GB"] },
          { name: "USB Version", type: "text", required: true, suggestions: ["USB 3.2 Gen 1 (USB 3.0)", "USB 3.2 Gen 2", "USB 2.0", "Dual Drive (USB Type-C + USB Type-A)"] },
          { name: "Read Speed", type: "text", required: true, suggestions: ["Up to 100 MB/s", "Up to 150 MB/s", "Up to 200 MB/s", "Up to 400 MB/s (High Performance)"] },
          { name: "Write Speed", type: "text", required: true, suggestions: ["Up to 30 MB/s", "Up to 60 MB/s", "Up to 100 MB/s", "Up to 300 MB/s"] },
          { name: "Housing Material", type: "text", required: true, suggestions: ["Metal / Aluminum Alloy", "Plastic", "Rubberized Rugged"] },
          { name: "Features", type: "text", required: true, suggestions: ["Keychain Loop", "Capless Swivel", "Retractable Slider", "OTG Mobile Support"] },
        ],
      },
    ],
  },
];

async function main() {
  console.log("🌱 Starting Product Taxonomy & Specification Schema Seeding...");

  const branches = await prisma.branch.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true, name: true },
  });

  if (!branches.length) {
    throw new Error("No active branches found.");
  }

  const superAdmin = await prisma.user.findFirst({
    where: { role: "SUPER_OWNER", status: "ACTIVE" },
    select: { id: true },
  });

  const userId = superAdmin?.id || null;

  for (const branch of branches) {
    console.log(`\n🏢 Seeding taxonomy for branch: ${branch.name} (${branch.code})`);

    for (const group of TAXONOMY_DATA) {
      // 1. Find or Upsert Parent Category
      let parentCat = await prisma.itemCategory.findFirst({
        where: {
          branchId: branch.id,
          OR: [
            { categoryCode: group.categoryCode },
            { name: group.name },
          ],
        },
      });

      if (parentCat) {
        parentCat = await prisma.itemCategory.update({
          where: { id: parentCat.id },
          data: {
            categoryCode: group.categoryCode,
            name: group.name,
            description: group.description,
            parentId: null,
            status: "ACTIVE",
            updatedById: userId,
          },
        });
      } else {
        parentCat = await prisma.itemCategory.create({
          data: {
            categoryCode: group.categoryCode,
            name: group.name,
            description: group.description,
            branchId: branch.id,
            parentId: null,
            status: "ACTIVE",
            createdById: userId,
            updatedById: userId,
          },
        });
      }

      console.log(`  📁 [Parent] ${parentCat.name} (${parentCat.categoryCode})`);

      // 2. Upsert Subcategories under this Parent
      for (const sub of group.subcategories) {
        let subCat = await prisma.itemCategory.findFirst({
          where: {
            branchId: branch.id,
            OR: [
              { categoryCode: sub.categoryCode },
              { name: sub.name },
            ],
          },
        });

        if (subCat) {
          subCat = await prisma.itemCategory.update({
            where: { id: subCat.id },
            data: {
              categoryCode: sub.categoryCode,
              name: sub.name,
              description: sub.description,
              parentId: parentCat.id,
              attributeSchema: sub.attributeSchema,
              status: "ACTIVE",
              updatedById: userId,
            },
          });
        } else {
          subCat = await prisma.itemCategory.create({
            data: {
              categoryCode: sub.categoryCode,
              name: sub.name,
              description: sub.description,
              branchId: branch.id,
              parentId: parentCat.id,
              attributeSchema: sub.attributeSchema,
              status: "ACTIVE",
              createdById: userId,
              updatedById: userId,
            },
          });
        }

        console.log(`    ↳ 🏷️  [Sub] ${subCat.name} (${sub.attributeSchema.length} specs)`);
      }
    }
  }

  console.log("\n✅ Product Taxonomy & Specification Schema successfully seeded!");
}

module.exports = {
  ensureStandardProductTaxonomy: main,
  TAXONOMY_DATA,
};

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("❌ Seeding failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
