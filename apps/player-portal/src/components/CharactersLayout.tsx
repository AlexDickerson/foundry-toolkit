// Wrapper for character-related routes. Paints the pf2e parchment
// background + text color inside the dark outer Layout so the ported
// sheet styles look as they did in the standalone character-creator.

import { Outlet } from 'react-router-dom';

export function CharactersLayout(): React.ReactElement {
  return (
    <div className="h-full w-full overflow-y-auto bg-pf-bg text-pf-text">
      <Outlet />
    </div>
  );
}
