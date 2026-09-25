import { lazy, Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { SimDriver } from './scene/SimDriver';
import { Starfield } from './scene/Starfield';
import { Bodies } from './scene/Bodies';
import { Orbits } from './scene/Orbits';
import { Belts } from './scene/Belts';
import { Glints } from './scene/Glints';
import { LightPulses } from './scene/LightPulses';
import { EclipticGrid } from './scene/EclipticGrid';
import { RenderPipeline } from './render/RenderPipeline';
import { AdaptiveQuality } from './render/AdaptiveQuality';
import { LabelSync, LabelsLayer } from './ui/Labels';
import { Header } from './ui/layout/Header';
import { Footer } from './ui/layout/Footer';
import { ManualDock } from './ui/manual/ManualDock';
import { InstrumentsDock } from './ui/instruments/InstrumentsDock';
import { OverlaySync, ViewportInstruments } from './ui/viewport/Overlays';
import { ViewportChrome } from './ui/viewport/ViewportChrome';
import { TrajectoryPlanner } from './ui/flight/TrajectoryPlanner';
import { FlightStrip } from './ui/flight/FlightStrip';
import { Welcome } from './ui/overlays/Welcome';
import { Tour } from './ui/overlays/Tour';
import { Journeys } from './ui/overlays/Journeys';
import { KeysSheet } from './ui/overlays/KeysSheet';
import { useShortcuts } from './ui/useShortcuts';
import { useExplainerTriggers } from './ui/useExplainerTriggers';
import { useUI } from './state/ui';
import { useDocRoute } from './state/route';

// The lab report and the reading pages (with KaTeX) load on first use.
const LabReport = lazy(() => import('./ui/manual/LabReport'));
const DocView = lazy(() => import('./ui/docs/DocView'));

/**
 * Below 900 px the docks overlay the viewport. Show one at a time, and clear them away when the
 * planner opens or a trip starts, so neither hides under a dock.
 */
function useNarrowDocks() {
  useEffect(
    () =>
      useUI.subscribe((s, prev) => {
        if (window.innerWidth >= 900) return;
        if ((s.plannerOpen && !prev.plannerOpen) || (s.tripActive && !prev.tripActive)) {
          if (s.leftOpen || s.rightOpen) useUI.setState({ leftOpen: false, rightOpen: false });
        } else if (s.leftOpen && s.rightOpen) {
          useUI.setState(prev.leftOpen ? { leftOpen: false } : { rightOpen: false });
        }
      }),
    [],
  );
}

export default function App() {
  useShortcuts();
  useExplainerTriggers();
  useNarrowDocks();
  const leftOpen = useUI((s) => s.leftOpen);
  const rightOpen = useUI((s) => s.rightOpen);
  const reportFor = useUI((s) => s.reportFor);
  const doc = useDocRoute();
  return (
    <div className="app">
      <Header />
      {leftOpen && <ManualDock />}
      <main className="app-view select-none" aria-label="Simulation view" data-tour="view">
        <Canvas
          // While a reading page covers the screen the simulation pauses and nothing is drawn.
          frameloop={doc ? 'never' : 'always'}
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
          <EclipticGrid />
          <Bodies />
          <Orbits />
          <Belts />
          <Glints />
          <LightPulses />
          <LabelSync />
          <OverlaySync />
          <AdaptiveQuality />
          <RenderPipeline />
        </Canvas>
        <LabelsLayer />
        <ViewportInstruments />
        <ViewportChrome />
        <TrajectoryPlanner />
        <FlightStrip />
      </main>
      {rightOpen && <InstrumentsDock />}
      <Footer />
      <Welcome />
      <Tour />
      <Journeys />
      <KeysSheet />
      {reportFor && (
        <Suspense fallback={null}>
          <LabReport exp={reportFor} />
        </Suspense>
      )}
      {doc && (
        <Suspense fallback={<div className="fixed inset-0 z-[60] bg-bg" />}>
          <DocView route={doc} />
        </Suspense>
      )}
    </div>
  );
}
