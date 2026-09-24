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

export default function App() {
  useShortcuts();
  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black text-white">
      <Canvas
        flat
        dpr={[1, 2]}
        gl={{ logarithmicDepthBuffer: true, antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 50, near: 0.001, far: 1e13, position: [0, 0, 0] }}
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
      <TopBar />
      <InfoCard />
      <FlightHud />
      <BodyBar />
      <HelpOverlay />
    </div>
  );
}
