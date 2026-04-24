// Wrapper for character-related routes. Paints the pf2e parchment
// background + text color inside the dark outer Layout so the ported
// sheet styles look as they did in the standalone character-creator.

import { Outlet } from 'react-router-dom';

export function CharactersLayout(): React.ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        backgroundColor: 'var(--color-pf-bg)',
        color: 'var(--color-pf-text)',
      }}
    >
      <Outlet />
    </div>
  );
}
