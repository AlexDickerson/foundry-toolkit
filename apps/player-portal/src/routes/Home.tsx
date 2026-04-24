import { Link } from 'react-router-dom';

interface Tile {
  to: string;
  label: string;
  blurb: string;
}

const TILES: Tile[] = [
  { to: '/globe', label: 'Golarion Globe', blurb: 'Live campaign map with mission pins.' },
  { to: '/inventory', label: 'Party Inventory', blurb: 'Shared loot and quest items.' },
  { to: '/leaderboard', label: 'Aurus Leaderboard', blurb: 'Team standings, updated live.' },
  { to: '/characters', label: 'Characters', blurb: 'Sheets, creation wizard, actions.' },
];

export function Home(): React.ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        color: '#e5e5e5',
        padding: '48px 32px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 600, margin: 0, letterSpacing: '0.01em' }}>Player Portal</h1>
          <p style={{ color: '#9a9a9a', marginTop: 8, fontSize: 14 }}>
            Pick a destination, or jump straight in from the nav bar above.
          </p>
        </header>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {TILES.map((tile) => (
            <Link
              key={tile.to}
              to={tile.to}
              style={{
                display: 'block',
                padding: '20px 20px 18px',
                backgroundColor: '#1a1a1a',
                border: '1px solid #2d2d2d',
                borderRadius: 8,
                color: '#e5e5e5',
                textDecoration: 'none',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
              onMouseEnter={(e): void => {
                e.currentTarget.style.borderColor = '#e4a547';
                e.currentTarget.style.backgroundColor = '#1f1f1f';
              }}
              onMouseLeave={(e): void => {
                e.currentTarget.style.borderColor = '#2d2d2d';
                e.currentTarget.style.backgroundColor = '#1a1a1a';
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{tile.label}</div>
              <div style={{ fontSize: 13, color: '#9a9a9a', lineHeight: 1.45 }}>{tile.blurb}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
