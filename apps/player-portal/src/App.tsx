// Router root for the player portal. Landing page on `/`, four top-level
// surfaces under the nav (Globe, Inventory, Leaderboard, Characters), and
// nested character-creator/sheet routes. All share the outer Layout (nav
// + main); the character routes sit inside CharactersLayout so the ported
// pf2e parchment styling applies.

import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { CharactersLayout } from './components/CharactersLayout';
import { Layout } from './components/Layout';
import { CharacterCreator } from './routes/CharacterCreator';
import { CharacterSheet } from './routes/CharacterSheet';
import { Characters } from './routes/Characters';
import { Globe } from './routes/Globe';
import { Home } from './routes/Home';
import { Inventory } from './routes/Inventory';
import { Leaderboard } from './routes/Leaderboard';

const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: 'globe', Component: Globe },
      { path: 'inventory', Component: Inventory },
      { path: 'leaderboard', Component: Leaderboard },
      {
        path: 'characters',
        Component: CharactersLayout,
        children: [
          { index: true, Component: Characters },
          { path: 'new', Component: CharacterCreator },
          { path: ':actorId', Component: CharacterSheet },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
