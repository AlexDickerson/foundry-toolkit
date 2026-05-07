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
    <div className="h-full overflow-y-auto bg-portal-bg text-portal-text">
      <div className="mx-auto max-w-4xl px-8 py-12">
        <header className="mb-8">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Player Portal</h1>
          <p className="mt-2 text-sm text-portal-text-muted">
            Pick a destination, or jump straight in from the nav bar above.
          </p>
        </header>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {TILES.map((tile) => (
            <Link
              key={tile.to}
              to={tile.to}
              className="block rounded-lg border border-portal-border bg-portal-surface p-5 text-portal-text no-underline transition-colors duration-150 hover:border-portal-accent hover:bg-portal-surface-hover"
            >
              <div className="mb-1.5 text-base font-semibold">{tile.label}</div>
              <div className="text-sm leading-relaxed text-portal-text-muted">{tile.blurb}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
