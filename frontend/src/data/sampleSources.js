/**
 * Placeholder sources — the sample Ariba SOP was built from these two
 * source videos. Swap for real .m3u8 CDN URLs when the backend is wired.
 * The URLs below use a public test HLS stream so the player works out
 * of the box for demos even without a backend.
 */
// Demo videos — swap these for real .m3u8 HLS URLs (from S3/R2 → CloudFront/
// Cloudflare Stream) when the backend is wired. MP4 URLs work in every
// browser without hls.js; HLS unlocks adaptive bitrate for large files.
const DEMO_MP4_A = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
const DEMO_MP4_B = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'

const SAMPLE_SOURCES = [
  {
    id: 'v-ariba-part01',
    kind: 'video',
    name: 'ariba_part01.mp4',
    description: 'Ariba SIPM walkthrough — profile & mass update (00:00–15:31)',
    url: DEMO_MP4_A,
    duration: 931,             // 15:31
    tags: ['SIPM', 'PART 1'],
  },
  {
    id: 'v-ariba-part02',
    kind: 'video',
    name: 'ariba_part02.mp4',
    description: 'Ariba SIPM walkthrough — performance metrics & reporting',
    url: DEMO_MP4_B,
    duration: 596,             // 09:56
    tags: ['SIPM', 'PART 2'],
  },
  {
    id: 'doc-template',
    kind: 'document',
    name: 'Client SOP Template v3.docx',
    description: 'TransitionSmart client-approved template with fonts & headers',
  },
  {
    id: 'doc-brief',
    kind: 'document',
    name: 'Procurement Ops – Requirements Brief.pdf',
    description: '4-page requirements doc from the procurement team',
  },
  {
    id: 'img-flowchart',
    kind: 'image',
    name: 'SIPM_flow_v2.png',
    url: null,
  },
  {
    id: 'img-org',
    kind: 'image',
    name: 'Vendor_org_chart.png',
    url: null,
  },
]

export default SAMPLE_SOURCES
