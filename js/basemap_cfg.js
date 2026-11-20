/* Konfigurasi basemap v7: Esri, Google Satellite, Esri Wayback, EOX Sentinel-2 Cloudless. */
window.BASEMAP_CFG={
  mapMaxZoom:21,
  defaultId:'esri',
  storeKey:'dnp_v7_basemap',
  kebun:[ -3.71, 104.45 ],
  waybackConfigUrl:'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json',
  esri:{
    id:'esri',
    label:'Esri World Imagery',
    url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom:18, /* diuji di kebun: z18 citra nyata; z19–22 identik "Map data not yet available" */
    attribution:'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  },
  google:{
    id:'google',
    label:'Google Satellite',
    url:'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    subdomains:'0123',
    maxNativeZoom:20, /* diuji: z14–21 merespons citra di kebun; memakai 20 sesuai spesifikasi */
    attribution:'© Google',
    warning:'Tile mt*.google.com tidak resmi (bukan Google Maps Platform / Map Tiles API). Pemakaian di luar API resmi dapat menyalahi ToS Google. Opsional; lihat README_V7.md.'
  },
  eox:{
    id:'eox',
    label:'EOX Sentinel-2 Cloudless',
    /* layer 3857 terbaru yang teruji (2025); pola g = GoogleMapsCompatible */
    url:'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg',
    maxNativeZoom:15, /* z15 tajam; z16–17 masih 200 tetapi tampak interpolasi */
    attribution:'Sentinel-2 cloudless © EOX IT Services GmbH, data © Copernicus Sentinel. Lisensi: cek eox.at (beberapa versi CC BY-NC-SA 4.0 — atribusi wajib, batasan non-komersial mungkin berlaku).'
  },
  wayback:{
    id:'wayback',
    label:'Esri Wayback',
    maxNativeZoom:18, /* diuji: z18 ada, z19+ HTTP 404 */
    attribution:'Tiles © Esri — World Imagery Wayback. Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    /* daftar cadangan hasil unduhan resmi 2026-11-20; runtime dapat memperbarui dari waybackConfigUrl */
    releases:[
      {date:'2026-11-18',release:3692,title:'World Imagery (Wayback 2026-11-18)',url:'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/3692/{z}/{y}/{x}',id:'WB_2026_R11'},
      {date:'2026-10-29',release:43291,title:'World Imagery (Wayback 2026-10-29)',url:'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/43291/{z}/{y}/{x}',id:'WB_2026_R10'},
      {date:'2026-09-24',release:63116,title:'World Imagery (Wayback 2026-09-24)',url:'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/63116/{z}/{y}/{x}',id:'WB_2026_R09'},
      {date:'2026-08-05',release:26334,title:'World Imagery (Wayback 2026-08-05)',url:'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/26334/{z}/{y}/{x}',id:'WB_2026_R07'},
      {date:'2026-06-30',release:32246,title:'World Imagery (Wayback 2026-06-30)',url:'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/32246/{z}/{y}/{x}',id:'WB_2026_R06'},
      {date:'2026-05-28',release:10842,title:'World Imagery (Wayback 2026-05-28)',url:'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/10842/{z}/{y}/{x}',id:'WB_2026_R05'},
      {date:'2026-04-30',release:49059,title:'World Imagery (Wayback 2026-04-30)',url:'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/49059/{z}/{y}/{x}',id:'WB_2026_R04'},
      {date:'2026-03-26',release:22869,title:'World Imagery (Wayback 2026-03-26)',url:'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/22869/{z}/{y}/{x}',id:'WB_2026_R03'},
      {date:'2026-02-26',release:64001,title:'World Imagery (Wayback 2026-02-26)',url:'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/64001/{z}/{y}/{x}',id:'WB_2026_R02'},
      {date:'2026-01-29',release:22252,title:'World Imagery (Wayback 2026-01-29)',url:'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/22252/{z}/{y}/{x}',id:'WB_2026_R01'}
    ]
  }
};
