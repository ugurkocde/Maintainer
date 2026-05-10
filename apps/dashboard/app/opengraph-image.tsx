import { ImageResponse } from 'next/og';

// next/og's ImageResponse is built for the Edge runtime; using nodejs adds
// cold-start latency for what is essentially a pure render and gives no
// upside.
export const runtime = 'edge';
export const alt = 'Maintainer · Live OSS automation';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          background:
            'radial-gradient(1200px 600px at 80% -100px, rgba(124,92,255,0.35), transparent 60%), radial-gradient(900px 500px at -10% 10%, rgba(20,184,166,0.18), transparent 55%), #0d0d11',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          color: '#ececef',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              width: 40,
              height: 40,
              borderRadius: 9999,
              background: '#34d399',
              boxShadow: '0 0 30px 4px rgba(52,211,153,0.5)',
            }}
          />
          <div style={{ display: 'flex', fontSize: 36, fontWeight: 600, letterSpacing: -0.5 }}>
            Maintainer
          </div>
          <div style={{ display: 'flex', fontSize: 22, color: '#7d7d8a' }}>live OSS automation</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 76,
              fontWeight: 600,
              letterSpacing: -1.5,
              lineHeight: 1.05,
            }}
          >
            A fleet of AI agents keeping repositories healthy.
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              color: '#b1b1bb',
              lineHeight: 1.4,
              maxWidth: 1000,
            }}
          >
            Triages new issues, drafts pull requests for scoped bugs, reviews
            its own diffs. Watch every run as it happens.
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#7d7d8a',
            fontSize: 22,
          }}
        >
          <span style={{ display: 'flex' }}>maintainer.ugurlabs.com</span>
          <span style={{ display: 'flex' }}>open source · GitHub Action</span>
        </div>
      </div>
    ),
    size,
  );
}
