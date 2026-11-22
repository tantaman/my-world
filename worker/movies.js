// Film details for Rewind Video's fixed lineup. The worker makes one TMDB
// request for each uncached title, shared across its VHS and DVD versions.

import { LINEUP } from '../src/videostore/lineup.js';

const titles = new Set(Object.values(LINEUP).flat().map(([id]) => String(id)));
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const noDetails = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export async function movieDetails(request, token, ctx, id) {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
  if (!titles.has(id)) return new Response(null, { status: 404 });
  if (!token) return noDetails();

  const key = new URL(`/api/videostore/movies/${id}`, request.url).href;
  const cache = globalThis.caches?.default;
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) return cached;

  const url = new URL(`https://api.themoviedb.org/3/movie/${id}`);
  url.searchParams.set('append_to_response', 'credits,release_dates');
  url.searchParams.set('language', 'en-US');
  try {
    const upstream = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) {
      console.warn('TMDB movie lookup failed', { id, status: upstream.status });
      return noDetails();
    }
    const movie = await upstream.json();
    if (String(movie.id) !== id) return noDetails();
    const us = movie.release_dates?.results?.find((entry) => entry.iso_3166_1 === 'US')?.release_dates || [];
    const certification = us.find((entry) => entry.type === 3 && entry.certification)?.certification
      || us.find((entry) => entry.certification)?.certification;
    // Type 5 means a physical release. Dates from later reissues are not
    // part of the shop's 2004 stock.
    const homeYear = us
      .filter((entry) => entry.type === 5)
      .map((entry) => clean(entry.release_date, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= '2004-12-31')
      .sort()[0]?.slice(0, 4) || '';
    const details = {
      title: clean(movie.title, 120),
      tagline: clean(movie.tagline, 120),
      blurb: clean(movie.overview, 1500),
      mins: Number.isInteger(movie.runtime) && movie.runtime > 0 ? movie.runtime : null,
      rating: clean(certification, 12),
      homeYear,
      cast: (movie.credits?.cast || []).slice(0, 3).map((entry) => clean(entry.name, 80)).filter(Boolean),
      director: (movie.credits?.crew || []).filter((entry) => entry.job === 'Director').slice(0, 3)
        .map((entry) => clean(entry.name, 80)).filter(Boolean).join(', '),
    };
    const response = Response.json(details, { headers: { 'cache-control': 'public, max-age=86400' } });
    if (cache) ctx.waitUntil(cache.put(key, response.clone()).catch(() => {}));
    return response;
  } catch {
    console.warn('TMDB movie lookup unavailable', { id });
    return noDetails();
  }
}
