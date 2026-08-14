#!/usr/bin/env node
/**
 * Generates the cities migration from the GeoNames datasets.
 *
 *   node scripts/build-cities-seed.mjs
 *
 * Output is committed, so the dataset is reproducible offline and CI never
 * depends on geonames.org being up. Re-run only to refresh the data.
 *
 * Sources (both CC BY 4.0 — attribution appears in the app's about screen):
 *   cities5000.zip         ~2 MB    the cities themselves
 *   alternateNamesV2.zip   ~193 MB  names tagged by language
 *
 * The big file is needed because the main dump's `alternatenames` column has no
 * language tags. Ranking it heuristically produced junk: Munich ended up with
 * airport codes and Filipino exonyms but no "München", which is precisely what
 * a German-speaking user types. Language tags let us pick the actual local name.
 *
 * Downloads are cached in .cache/geonames so re-runs are fast.
 * Requires `unzip` on PATH (present on macOS and most Linux images).
 */
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const BASE_URL = 'https://download.geonames.org/export/dump'
const CACHE_DIR = fileURLToPath(new URL('../.cache/geonames/', import.meta.url))
const OUT_FILE = fileURLToPath(
  new URL('../supabase/migrations/20260813134400_seed_cities.sql', import.meta.url),
)

/**
 * Europe, broadly. The launch cluster is the German-speaking classical world,
 * but artists audition across the whole continent. Excludes Russia: European
 * Russia would add thousands of rows this audience is unlikely to travel to.
 *
 * The value is the set of local languages whose names we keep, so that a
 * Viennese user finds "Wien" and a Florentine finds "Firenze".
 */
const COUNTRY_LANGUAGES = {
  AD: ['ca'], AL: ['sq'], AT: ['de'], BA: ['bs', 'hr', 'sr'],
  BE: ['nl', 'fr', 'de'], BG: ['bg'], BY: ['be'], CH: ['de', 'fr', 'it', 'rm'],
  CY: ['el'], CZ: ['cs'], DE: ['de'], DK: ['da'], EE: ['et'],
  ES: ['es', 'ca', 'eu', 'gl'], FI: ['fi', 'sv'], FO: ['fo'], FR: ['fr'],
  GB: ['en', 'cy', 'gd'], GG: ['en'], GI: ['en'], GR: ['el'], HR: ['hr'],
  HU: ['hu'], IE: ['en', 'ga'], IM: ['en'], IS: ['is'], IT: ['it'],
  JE: ['en'], LI: ['de'], LT: ['lt'], LU: ['lb', 'fr', 'de'], LV: ['lv'],
  MC: ['fr'], MD: ['ro'], ME: ['sr'], MK: ['mk'], MT: ['mt', 'en'],
  NL: ['nl'], NO: ['no', 'nb', 'nn'], PL: ['pl'], PT: ['pt'], RO: ['ro'],
  RS: ['sr'], SE: ['sv'], SI: ['sl'], SK: ['sk'], SM: ['it'], TR: ['tr'],
  UA: ['uk'], VA: ['it'], XK: ['sq'],
}

/**
 * Population floor. 10,000 keeps the table small enough to ship in a migration
 * while still covering every town with a concert hall, conservatory or
 * festival. Below this the list fills with commuter villages.
 */
const MIN_POPULATION = 10_000
const MAX_ALIASES = 10

/** Latin script only — the audience types Latin script. */
const LATIN_NAME = /^[A-Za-zÀ-ɏḀ-ỿ][A-Za-zÀ-ɏḀ-ỿ .'’-]*$/

/**
 * Letters that are not accented forms of an ASCII letter, so Unicode
 * decomposition cannot handle them — NFD leaves ø intact and the ASCII filter
 * then deletes it, turning "København" into "Kbenhavn".
 */
const SPECIAL_LETTERS = {
  ø: 'o', Ø: 'O', æ: 'ae', Æ: 'Ae', œ: 'oe', Œ: 'Oe',
  ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ð: 'd', Ð: 'D',
  þ: 'th', Þ: 'Th', ß: 'ss', ı: 'i', İ: 'I',
}

const deaccent = (value) =>
  value
    .replace(/[øØæÆœŒłŁđĐðÐþÞßıİ]/g, (char) => SPECIAL_LETTERS[char] ?? char)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\x20-\x7E]/g, '')

/**
 * German transliteration, so that "Muenchen" — how Germans write München on a
 * keyboard without umlauts — finds Munich. Deaccenting alone yields "Munchen".
 */
const germanFold = (value) =>
  deaccent(
    value
      .replace(/ä/g, 'ae').replace(/Ä/g, 'Ae')
      .replace(/ö/g, 'oe').replace(/Ö/g, 'Oe')
      .replace(/ü/g, 'ue').replace(/Ü/g, 'Ue')
      .replace(/ß/g, 'ss'),
  )

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`
const sqlArray = (values) =>
  values.length === 0 ? `'{}'` : `array[${values.map(sqlString).join(',')}]`

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function fetchCached(fileName) {
  const target = CACHE_DIR + fileName
  if (await exists(target)) {
    console.log(`Using cached ${fileName}`)
    return target
  }
  await mkdir(CACHE_DIR, { recursive: true })
  process.stdout.write(`Downloading ${fileName} … `)
  const response = await fetch(`${BASE_URL}/${fileName}`)
  if (!response.ok) throw new Error(`GeoNames returned ${response.status} for ${fileName}`)
  await writeFile(target, Buffer.from(await response.arrayBuffer()))
  console.log('done')
  return target
}

/** Streams `member` out of `zipPath`, yielding one line at a time. */
async function* unzipLines(zipPath, member) {
  const child = spawn('unzip', ['-p', zipPath, member], { stdio: ['ignore', 'pipe', 'inherit'] })
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  try {
    for await (const line of lines) yield line
  } finally {
    child.kill()
  }
}

async function loadCities() {
  const zipPath = await fetchCached('cities5000.zip')
  const cities = new Map()
  let scanned = 0

  for await (const line of unzipLines(zipPath, 'cities5000.txt')) {
    if (!line) continue
    scanned += 1
    const f = line.split('\t')
    const countryCode = f[8]
    const population = Number.parseInt(f[14] ?? '0', 10) || 0

    if (f[6] !== 'P') continue
    if (!(countryCode in COUNTRY_LANGUAGES)) continue
    if (population < MIN_POPULATION) continue

    const geonameId = Number.parseInt(f[0], 10)
    cities.set(geonameId, {
      geonameId,
      name: f[1],
      asciiName: f[2],
      countryCode,
      lat: Number.parseFloat(f[4]),
      lon: Number.parseFloat(f[5]),
      population,
      /** language → { preferred: string[], other: string[] } */
      names: new Map(),
    })
  }

  console.log(`Cities: ${cities.size.toLocaleString('en-GB')} kept of ${scanned.toLocaleString('en-GB')} scanned`)
  return cities
}

async function loadAlternateNames(cities) {
  const zipPath = await fetchCached('alternateNamesV2.zip')
  const wanted = new Set(['en'])
  for (const languages of Object.values(COUNTRY_LANGUAGES)) {
    for (const language of languages) wanted.add(language)
  }

  let scanned = 0
  let kept = 0

  for await (const line of unzipLines(zipPath, 'alternateNamesV2.txt')) {
    if (!line) continue
    scanned += 1
    if (scanned % 4_000_000 === 0) {
      process.stdout.write(`  … ${(scanned / 1_000_000).toFixed(0)}M rows scanned\n`)
    }

    const f = line.split('\t')
    const language = f[2]
    if (!wanted.has(language)) continue

    const geonameId = Number.parseInt(f[1], 10)
    const city = cities.get(geonameId)
    if (!city) continue

    const value = f[3]
    if (!value || !LATIN_NAME.test(value) || value.length > 40) continue
    // Skip historic and colloquial forms — they add noise, not findability.
    if (f[7] === '1' || f[6] === '1') continue

    if (!city.names.has(language)) city.names.set(language, { preferred: [], other: [] })
    const bucket = city.names.get(language)
    if (f[4] === '1') bucket.preferred.push(value)
    else bucket.other.push(value)
    kept += 1
  }

  console.log(`Alternate names: kept ${kept.toLocaleString('en-GB')} of ${scanned.toLocaleString('en-GB')} scanned`)
}

function buildNames(city) {
  const languages = COUNTRY_LANGUAGES[city.countryCode] ?? []

  const pick = (language) => {
    const bucket = city.names.get(language)
    if (!bucket) return null
    return bucket.preferred[0] ?? bucket.other[0] ?? null
  }

  // The local-language name, where it genuinely differs from the canonical one.
  // Compared on the folded form so that "Zurich" is recognised as the same name
  // as "Zürich" — a transliteration is not a local name and would be misleading
  // to display.
  // Plain deaccenting, not germanFold: ü→ue would make "Zürich" and "Zurich"
  // compare as different, while ü→u correctly collapses them.
  const fold = (value) => deaccent(value).toLowerCase().replace(/[^a-z]/g, '')
  const nameKey = fold(city.name)

  // If any local language already calls the city by its canonical name, there
  // is no distinct local name to show. Without this, Zürich falls through the
  // Swiss language list (de matches, so it is skipped) and picks up the Italian
  // "Zurigo" — technically a local name, but not the one anyone there uses.
  const canonicalIsLocal = languages.some((language) => {
    const bucket = city.names.get(language)
    if (!bucket) return false
    return [...bucket.preferred, ...bucket.other].some((value) => fold(value) === nameKey)
  })

  let nameLocal = null
  if (!canonicalIsLocal) {
    for (const language of languages) {
      const candidate = pick(language)
      if (candidate && fold(candidate) !== nameKey) {
        nameLocal = candidate
        break
      }
    }
  }

  const aliases = []
  const seen = new Set([city.name.toLowerCase()])
  const add = (candidate) => {
    if (!candidate || aliases.length >= MAX_ALIASES) return
    const trimmed = candidate.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key) || trimmed.length < 2) return
    if (!LATIN_NAME.test(trimmed)) return
    seen.add(key)
    aliases.push(trimmed)
  }

  // Keyboard-friendly forms of the canonical name come first. Both folds are
  // needed: a user may type "Koeln" or "Koln" for Köln.
  add(city.asciiName)
  add(germanFold(city.name))
  add(deaccent(city.name))

  // Then the local name and its folds — the highest-value aliases.
  if (nameLocal) {
    add(nameLocal)
    add(germanFold(nameLocal))
    add(deaccent(nameLocal))
  }

  // Then any other local-language forms, then English.
  for (const language of [...languages, 'en']) {
    const bucket = city.names.get(language)
    if (!bucket) continue
    for (const value of [...bucket.preferred, ...bucket.other]) {
      add(value)
      add(germanFold(value))
    }
  }

  return { nameLocal, aliases }
}

async function main() {
  const cities = await loadCities()
  await loadAlternateNames(cities)

  const rows = [...cities.values()]
    .map((city) => ({ ...city, ...buildNames(city) }))
    .sort((a, b) => b.population - a.population || a.name.localeCompare(b.name))

  const chunks = []
  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows
      .slice(i, i + BATCH)
      .map(
        (c) =>
          `  (${c.geonameId}, ${sqlString(c.name)}, ` +
          `${c.nameLocal ? sqlString(c.nameLocal) : 'null'}, ${sqlString(c.countryCode)}, ` +
          `${c.lat}, ${c.lon}, ${c.population}, ${sqlArray(c.aliases)})`,
      )
      .join(',\n')

    chunks.push(
      'insert into public.cities\n' +
        '  (geoname_id, name, name_local, country_code, lat, lon, population, aliases)\nvalues\n' +
        values +
        '\non conflict (geoname_id) do nothing;\n',
    )
  }

  const withLocal = rows.filter((r) => r.nameLocal).length
  const header = `-- Milestone 1 — city reference data.
--
-- GENERATED by scripts/build-cities-seed.mjs — do not edit by hand.
--
-- Source:  GeoNames cities5000 + alternateNamesV2 (CC BY 4.0)
-- Filter:  feature class P, ${Object.keys(COUNTRY_LANGUAGES).length} European countries, population >= ${MIN_POPULATION.toLocaleString('en-GB')}
-- Rows:    ${rows.length.toLocaleString('en-GB')}, of which ${withLocal.toLocaleString('en-GB')} carry a local-language name
--
-- This is a migration rather than a local seed file because production needs
-- the same reference data; supabase/seed/ only runs on local \`db reset\`.

`

  await writeFile(OUT_FILE, header + chunks.join('\n'), 'utf8')
  console.log(`Wrote ${rows.length.toLocaleString('en-GB')} cities (${withLocal.toLocaleString('en-GB')} with local names)`)
}

await main()
