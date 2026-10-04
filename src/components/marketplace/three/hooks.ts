import { useEffect } from "react";

/** Frees a three.js object's graphics memory (texture, shape) when it's replaced or the component goes away. */
export function useDispose(value: { dispose: () => void } | null | undefined) {
  useEffect(() => () => value?.dispose(), [value]);
}
