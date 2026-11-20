import { MapView } from './ui/MapView';
import { TopBar } from './ui/TopBar';
import { Inspector } from './ui/Inspector';
import { LeftRail, Drawer } from './ui/Panels';
import { NewsFeed, MapModes, Toasts, WarDialog, SearchBox, ToolBanner, SkipOverlay, useHotkeys } from './ui/Overlays';
import { ZoomControls } from './ui/ZoomControls';

export function App() {
  useHotkeys();
  return (
    <div className="app">
      <MapView />
      <TopBar />
      <LeftRail />
      <Drawer />
      <Inspector />
      <NewsFeed />
      <MapModes />
      <ZoomControls />
      <Toasts />
      <ToolBanner />
      <SkipOverlay />
      <WarDialog />
      <SearchBox />
    </div>
  );
}
