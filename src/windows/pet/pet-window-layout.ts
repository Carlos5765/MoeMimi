export interface WindowSize {
  width: number;
  height: number;
}

export function fitWithin(source: WindowSize, bounds: WindowSize): WindowSize {
  if (source.width < 1 || source.height < 1) return { width: 1, height: 1 };
  const scale = Math.min(1, bounds.width / source.width, bounds.height / source.height);
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

export function resizeKeepingAspect(
  start: WindowSize,
  deltaX: number,
  deltaY: number,
  bounds: WindowSize,
  minimumEdge = 96,
): WindowSize {
  const aspectRatio = start.width / start.height;
  const horizontalChange = Math.abs(deltaX / start.width);
  const verticalChange = Math.abs(deltaY / start.height);
  const requestedWidth =
    horizontalChange >= verticalChange
      ? start.width + deltaX
      : (start.height + deltaY) * aspectRatio;
  const maximumWidth = Math.max(1, Math.min(bounds.width, bounds.height * aspectRatio));
  const minimumWidth = Math.min(
    maximumWidth,
    Math.max(minimumEdge, minimumEdge * aspectRatio),
  );
  const width = Math.min(Math.max(requestedWidth, minimumWidth), maximumWidth);

  return {
    width: Math.round(width),
    height: Math.round(width / aspectRatio),
  };
}
