/**
 * The processor time this test's thread has used, ms (Node's process.threadCpuUsage, reached
 * through globalThis as test/files.ts reaches fs; the whole process's time where that is missing).
 * Timing tests measure it rather than the wall clock: the rest of the suite and whatever else the
 * machine is doing (a file sync) share the cores, and the wall clock counts the time this thread
 * waits for one; its own processor time does not. Windows counts it in ticks of 15.6 ms, so batches
 * should last a few hundred milliseconds.
 */
interface CpuUsage {
  user: number;
  system: number;
}
interface NodeProcess {
  cpuUsage(): CpuUsage;
  threadCpuUsage?(): CpuUsage;
}
const proc = (globalThis as unknown as { process: NodeProcess }).process;

export const cpuMs = (): number => {
  const u = proc.threadCpuUsage ? proc.threadCpuUsage() : proc.cpuUsage();
  return (u.user + u.system) / 1000;
};
