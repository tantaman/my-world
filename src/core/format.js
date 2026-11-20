// How numbers are written for people.

export function formatDistance(d) {
  if (d < 1000) return `${Math.round(d)} m`;
  return `${(d / 1000).toFixed(d < 10000 ? 1 : 0)} km`;
}
