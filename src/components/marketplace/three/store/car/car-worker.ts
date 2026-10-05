// Builds the showroom car off the main thread (it takes most of a second),
// and hands back its arrays without copying them.
import { buildCar } from "./coupe";

const scope = self as unknown as { onmessage: ((e: MessageEvent<{ detail: number }>) => void) | null; postMessage: (message: unknown, transfer: Transferable[]) => void };

scope.onmessage = (e) => {
  const car = buildCar(e.data.detail);
  const transfer = Object.values(car.meshes)
    .flat()
    .flatMap((p) => [p.positions.buffer, p.normals.buffer, p.indices.buffer]);
  scope.postMessage(car, transfer);
};
