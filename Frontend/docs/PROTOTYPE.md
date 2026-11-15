# SPHEREX — PLANET X

Interactive React + TypeScript research workspace for the NASA Space Apps Challenge. The original illustrative views remain alongside an API-backed data panel per module.

## 1. Design system

- Canvas: `#090e19`; sidebar: `#0d131f`; panels: `#101724`; borders: `#252e41`.
- Primary action: lavender `#aaa0f6`; selected navigation: muted violet; scientific accents: cyan, blue, green.
- Typography: Inter for interface text, Space Grotesk for headings, JetBrains Mono for coordinates and identifiers.
- Reusable components in `src/App.tsx`: Icon, Button, Badge, Panel, Stat, Chart, SkyMap, ObservationTable, CandidateTable, Pagination, Comparison and Report.
- Shared context: selected region, RA/DEC, observation epochs, spectral bands, candidate and validation state.
- Responsive layouts: persistent desktop navigation, off-canvas tablet/mobile navigation, stacked panels, horizontally scrollable scientific tables.
- Keyboard support: native form controls, focus indicators, keyboard-operable table rows, Escape dismissal and dialog focus trapping.

## 2. Dashboard

Mission Control links the five modules, displays workspace statistics and recent observations.

## 3–7. Module views

| Module            | Six navigable views                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Sky Explorer      | Overview; Interactive map; Coordinate search; Region selection; Observation details; Source results |
| Temporal Vision   | Overview; Side by side; Swipe comparison; Blink comparison; Change visualization; Analysis report   |
| Spectral Analysis | Overview; Band explorer; Band comparison; Spectral slider; Spectral graph; Analysis report          |
| Object Detection  | Overview; Configuration; Processing; Detection results; Candidate validation; Detection report      |
| Discovery Catalog | Overview; Candidate explorer; Object detail; Object timeline; Evidence viewer; Scientific report    |

## 8. Interactive prototype

1. Switch between **Explore** (plain-language public experience) and **Observatory** (technical labels and analysis details). Select **New exploration** and search a named demonstration object or enter RA/DEC. Backend-returned regions and observations appear in the separately labeled data panel.
2. Choose a rectangular/circular region and angular size.
3. Open observation metadata, or continue to **Compare observations**.
4. Compare epochs side by side, drag the swipe divider, or play/pause blink mode.
5. Explore the direction-only celestial sphere; rotate and zoom, filter source/observation/detection markers, inspect demonstration coordinates, then open the selected region field.
6. In Temporal Vision, scrub the synchronized time axis to update observation B and follow illustrative source tracks across the three epochs.
7. Explore 102 bands; inspect the discrete spectral-cube coordinate grid, select a spatial sample and band, compare two bands or inspect a source-dependent illustrative spectrum.
8. Configure detection epochs, confidence threshold and sensitivity in the retained illustrative workflow, or use **Ejecutar análisis real** in the Backend panel to enqueue the actual temporal FITS processing job from two returned observations.
9. Review the matching candidates. Threshold filters confidence; sensitivity filters minimum simulated motion (conservative: 1.5 arcsec; balanced: 0.5; high: 0).
10. Validate, discard with confirmation, or flag a candidate, then save it to the session catalog. Filter by category/status, sort and paginate the results.
11. Open the object timeline, visual evidence and scientific report.
12. Export a plain-text demo report.

The detection overview includes a selectable 3D scatter of illustrative candidate RA, DEC and confidence values. Its confidence axis is a score, not physical depth or statistical significance. Statistical cards include compact visual summaries and describe the illustrative status counts rather than implying measured trends.

Global search supports M42/Orion, candidate identifiers and decimal coordinate pairs such as `83.8221, -5.3911`.
Workspace settings control coordinate units, celestial grid, candidate markers and playback interval.
Map tools provide zoom, image panning, centering, selection geometry and expanded viewing.

## 9. Scientific integrity and limitations

- The Sky, Temporal, Spectral and Discovery Backend panels call the API services documented in the root README. Successful archive/processing responses require the Backend, network access to NASA/IPAC and compatible observations. No authentication is implemented.
- Existing prototype observation dates, source counts, spectral responses, displacements and candidates remain illustrative and labeled as such. API-returned data are shown separately rather than silently substituted for illustrative values.
- Backend temporal products apply its FITS flags, variance and WCS alignment and return PNG previews, metrics and candidates. No FITS download endpoint exists; MEF FITS are processed server-side. Local FITS uploads remain browser-only and retain their existing WCS limitations.
- Spectral rows show the API-returned wavelength (µm), flux and uncertainty (MJy/sr), observation ID and MJD. No interpolation or calibration values are invented.
- Detection candidates are generated only by the real temporal pipeline. Its experimental score C is not a calibrated probability. Candidate review/verification is not writable through the current API.
- Backend job status is held in memory and disappears when the server restarts.
- Observation identifiers/dates, source counts, spectral responses, displacements and confidence scores are illustrative.
- Candidate validation is a prototype state, not confirmation of a discovery.
- Named regions change the coordinate context but use the same clearly labeled Orion reference photograph.
- Local FITS images from a primary or IMAGE extension are displayed with a 1st-to-99th percentile grayscale stretch. For cubes, only the first plane is shown. FITS headers and pixel ranges are read, but WCS projection, table-HDU rendering and scientific calibration are not applied.
- Band visualizations recolor the reference photograph; they are not real infrared band images.
- The celestial sphere's markers and demonstration metadata are illustrative directions, not a catalog or distance model. Its region image is a reference photograph without a calibrated WCS projection.
- Temporal tracks are illustrative. Their depth axis represents observation time only, never astronomical distance.
- The spectral-cube view is a discrete coordinate-grid schematic. Intensity is intentionally not plotted because no calibrated spatial-spectral cube is connected; no continuous surface or synthetic signal values are shown.
- The illustrative band positions use ordinal band index only. Exact channel calibration, resolution and cube intensity remain unavailable in those views. The Backend spectral panel independently presents its measured profile and uncertainties without interpolation.
- Scientific chart components accept typed spectral/temporal samples with uncertainty and provenance. They render supplied measurements as unconnected points with error bars; empty datasets show an unavailable state, and invalid samples are reported rather than silently substituted.
- The spectral time-surface and spatial heatmap/volume are intentionally unavailable without calibrated measurements for each coordinate. The coordinate-grid schematic is explanatory, not a measured surface.
- Plotly.js, Three.js / React Three Fiber, and Aladin Lite are not installed in this static-data prototype. Add them when calibrated data and a real sky-image projection service are available; until then, lightweight SVG controls do not imply scientific measurements or a calibrated celestial map.
- Temporal comparisons apply illustrative shifts and residual markers; they are not independent measured observations.
- Catalog and settings exist only in the current browser session and reset on reload.
- Reports are downloadable text, not PDF.
- NASA and SPHEREx do not endorse this concept.

## 10. Assets and verification

- `public/orion-reference.jpg`: Samuel PASTEUR-FOSSE / Unsplash, optical Orion reference field.
- `public/nebula-reference.jpg`: Alexander Andrews / Unsplash, illustrative dashboard imagery.
- No real SPHEREx discovery is claimed.
- Project commands: `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm format src/App.tsx src/index.css index.html docs/PROTOTYPE.md`.
- Browser verification covers all 30 module views, coordinate search, shared context, swipe/blink comparison, band scan, source selection, configured detection, validation, catalog saving/filtering, report download, settings and global search.
