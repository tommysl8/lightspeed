import { Canvas } from '@react-three/fiber';
import { SimDriver } from './scene/SimDriver';
import { Starfield } from './scene/Starfield';
import { Bodies } from './scene/Bodies';
import { Orbits } from './scene/Orbits';
import { Belts } from './scene/Belts';
import { Glints } from './scene/Glints';
import { RenderPipeline } from './render/RenderPipeline';
import { LabelSync, LabelsLayer } from './ui/Labels';
import { TopBar } from './ui/TopBar';
import { BodyBar } from './ui/BodyBar';
import { InfoCard } from './ui/InfoCard';
import { FlightHud } from './ui/FlightHud';
import { HelpOverlay } from './ui/HelpOverlay';
import { useShortcuts } from './ui/useShortcuts';
import { WarpBadge } from './ui/TimeControls';
import { LightDelayPanel } from './ui/LightDelayPanel';
import { TravelPlanner } from './ui/TravelPlanner';
import { TripHud, WarpDriveBanner } from './ui/TripHud';
import { ExplainerPanel } from './ui/ExplainerPanel';
import { useExplainerTriggers } from './ui/useExplainerTriggers';
import { RelativityOverlay } from './ui/RelativityControls';

export default function App() {
  useShortcuts();
  useExplainerTriggers();
  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black text-white">
      <Canvas
        flat
        dpr={[1, 2]}
        gl={{
          logarithmicDepthBuffer: true,
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
        }}
        camera={{ fov: 50, near: 0.001, far: 1e15, position: [0, 0, 0] }}
        className="!absolute inset-0"
      >
        <SimDriver />
        <Starfield />
        <Bodies />
        <Orbits />
        <Belts />
        <Glints />
        <LabelSync />
        <RenderPipeline />
      </Canvas>
      <LabelsLayer />
      <RelativityOverlay />
      <WarpBadge />
      <TopBar />
      <LightDelayPanel />
      <InfoCard />
      <FlightHud />
      <BodyBar />
      <TravelPlanner />
      <TripHud />
      <WarpDriveBanner />
      <ExplainerPanel />
      <HelpOverlay />
    </div>
  );
}
