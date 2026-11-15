import { useEffect, useRef, useState, type ReactNode } from "react";
import { decodeFitsImage, type FitsImage } from "./fits";
import {
  getDiscoveryEvidence,
  getDiscoveries,
  type CandidateDiscovery,
  type CandidateEvidence,
} from "./api/detection";
import { backendAssetUrl } from "./api/client";
import {
  getFitsDownloadUrl,
  getFitsPreviewUrl,
  getFitsMetadata,
  getLocalFitsFiles,
  getLocalSpectralPoint,
  runLocalTemporalComparison,
  type FitsModule,
  type LocalFitsFile,
  type LocalFitsMetadata,
  type LocalSpectralPoint,
} from "./api/fits";
import { getFeaturedRegions, searchObservations, type FeaturedRegion, type Observation } from "./api/sky";
import { getSpectralProfile, type SpectralProfile } from "./api/spectral";
import { runTemporalComparison, type JobStatus, type TemporalResult } from "./api/temporal";

type IconName =
  | "grid"
  | "sky"
  | "time"
  | "spectrum"
  | "target"
  | "catalog"
  | "settings"
  | "help"
  | "search"
  | "bell"
  | "chevron"
  | "arrow"
  | "plus"
  | "minus"
  | "cross"
  | "layers"
  | "expand"
  | "download"
  | "play"
  | "pause"
  | "check"
  | "close"
  | "filter"
  | "external"
  | "globe"
  | "menu"
  | "move"
  | "square"
  | "circle"
  | "info"
  | "upload";
function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const paths: Record<IconName, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    sky: (
      <>
        <circle cx="12" cy="12" r="8" />
        <ellipse cx="12" cy="12" rx="4" ry="8" transform="rotate(40 12 12)" />
        <path d="m3 9 18 6M8 3l8 18" />
      </>
    ),
    time: (
      <>
        <rect x="3" y="5" width="7" height="14" rx="1.5" />
        <rect x="14" y="5" width="7" height="14" rx="1.5" />
        <path d="m6 9 1 3-1 3m11-6 1 3-1 3" />
      </>
    ),
    spectrum: (
      <>
        <path d="M3 19h18M5 15V9m4 6V4m4 11V7m4 8V3m4 12v-4" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
      </>
    ),
    catalog: (
      <>
        <path d="M4 5h6l2 2h8v13H4z" />
        <path d="M4 10h16m-12 4h8m-8 3h5" />
      </>
    ),
    settings: (
      <>
        <path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    bell: (
      <>
        <path d="M5 16h14l-2-3V9a5 5 0 0 0-10 0v4zm5 3h4" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    arrow: <path d="M4 12h15m-5-5 5 5-5 5" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    cross: (
      <>
        <circle cx="12" cy="12" r="5" />
        <path d="M12 2v6m0 8v6M2 12h6m8 0h6" />
      </>
    ),
    layers: (
      <>
        <path d="m3 8 9-5 9 5-9 5zm0 5 9 5 9-5M3 18l9 5 9-5" />
      </>
    ),
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8z" />,
    pause: (
      <>
        <path d="M8 4v16M16 4v16" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    filter: (
      <>
        <path d="M3 5h18M6 12h12m-8 7h4" />
        <circle cx="8" cy="5" r="2" />
        <circle cx="15" cy="12" r="2" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7m0-7L11 13M10 4H4v16h16v-6" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    move: (
      <>
        <path d="M12 2v20M2 12h20m-13-7 3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3" />
      </>
    ),
    square: <rect x="4" y="4" width="16" height="16" rx="2" />,
    circle: <circle cx="12" cy="12" r="8" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v7m0-10h.01" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const modules = [
  {
    name: "Sky Explorer",
    icon: "sky",
    description: "Navigate the sky. Find your next discovery.",
    tabs: [
      "Overview",
      "Interactive map",
      "Coordinate search",
      "Region selection",
      "Observation details",
      "Source results",
    ],
  },
  {
    name: "Temporal Vision",
    icon: "time",
    description: "The same sky. A different moment. A new perspective.",
    tabs: [
      "Overview",
      "Side by side",
      "Swipe comparison",
      "Blink comparison",
      "Change visualization",
      "Analysis report",
    ],
  },
  {
    name: "Spectral Analysis",
    icon: "spectrum",
    description: "Discover what lies beyond the visible.",
    tabs: [
      "Overview",
      "Band explorer",
      "Band comparison",
      "Spectral slider",
      "Spectral graph",
      "Analysis report",
    ],
  },
  {
    name: "Object Detection",
    icon: "target",
    description: "Find subtle movements. Reveal new possibilities.",
    tabs: [
      "Overview",
      "Configuration",
      "Processing",
      "Detection results",
      "Candidate validation",
      "Detection report",
    ],
  },
  {
    name: "Discovery Catalog",
    icon: "catalog",
    description: "Every candidate is the beginning of a question.",
    tabs: [
      "Overview",
      "Candidate explorer",
      "Object detail",
      "Object timeline",
      "Evidence viewer",
      "Scientific report",
    ],
  },
] as const;
const skyImage = "/orion-reference.jpg";
const observations = [
  {
    id: "SPX-2025-ORI-0042",
    date: "Sep 18, 2025",
    time: "04:32:16 UTC",
    coverage: "99.8%",
    tag: "Latest",
    band: "1 – 102",
    quality: "Excellent",
  },
  {
    id: "SPX-2025-ORI-0021",
    date: "Mar 18, 2025",
    time: "03:18:42 UTC",
    coverage: "98.6%",
    tag: "",
    band: "1 – 102",
    quality: "Excellent",
  },
  {
    id: "SPX-2024-ORI-0008",
    date: "Sep 17, 2024",
    time: "05:06:28 UTC",
    coverage: "97.2%",
    tag: "",
    band: "1 – 102",
    quality: "Good",
  },
];
type Candidate = {
  id: string;
  ra: string;
  dec: string;
  confidence: number;
  motion: string;
  status: string;
  type: string;
};
type MeasurementProvenance = "measured" | "estimated" | "interpolated";
type SpectralSample = {
  wavelength: number;
  flux: number;
  uncertainty: number;
  band: number;
  observationId: string;
  timestamp: string;
  provenance: MeasurementProvenance;
};
type TemporalSample = {
  timestamp: string;
  ra: number;
  dec: number;
  flux: number;
  uncertainty: number;
  observationId: string;
  provenance: MeasurementProvenance;
};
const initialCandidates: Candidate[] = [
  {
    id: "PX-2025-0042",
    ra: "83.8224°",
    dec: "−5.3912°",
    confidence: 98.6,
    motion: "2.34",
    status: "Pending review",
    type: "Moving source",
  },
  {
    id: "PX-2025-0039",
    ra: "83.8106°",
    dec: "−5.3821°",
    confidence: 94.2,
    motion: "1.87",
    status: "Validated",
    type: "Asteroid candidate",
  },
  {
    id: "PX-2025-0036",
    ra: "83.8392°",
    dec: "−5.4108°",
    confidence: 89.7,
    motion: "0.92",
    status: "Pending review",
    type: "Variable source",
  },
  {
    id: "PX-2025-0031",
    ra: "83.7953°",
    dec: "−5.3652°",
    confidence: 76.4,
    motion: "0.61",
    status: "Needs review",
    type: "Unclassified",
  },
  {
    id: "PX-2025-0028",
    ra: "83.8512°",
    dec: "−5.4217°",
    confidence: 64.8,
    motion: "0.24",
    status: "Discarded",
    type: "Image artifact",
  },
];

function Badge({ children, color = "green" }: { children: ReactNode; color?: string }) {
  return (
    <span className={`badge ${color}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
function Button({
  children,
  icon,
  onClick,
  primary = false,
  className = "",
  disabled = false,
}: {
  children?: ReactNode;
  icon?: IconName;
  onClick?: () => void;
  primary?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`button ${primary ? "primary" : ""} ${className}`}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}
function Panel({
  title,
  children,
  action,
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <h3>{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
function Stat({
  label,
  value,
  foot,
  icon,
  color = "blue",
  visual = "coverage",
}: {
  label: string;
  value: string;
  foot: string;
  icon: IconName;
  color?: string;
  visual?: "sources" | "epochs" | "bands" | "coverage" | "reviews";
}) {
  return (
    <div className="stat">
      <div>
        <p>{label}</p>
        <div className="stat-value">{value}</div>
        <span className="stat-foot">{foot}</span>
        <div className={`stat-visual ${visual}`} aria-hidden="true">
          {visual === "sources" ? (
            <svg viewBox="0 0 120 26">
              {Array.from({ length: 22 }, (_, index) => (
                <circle
                  key={index}
                  cx={5 + ((index * 37) % 108)}
                  cy={4 + ((index * 13) % 18)}
                  r={index % 6 === 0 ? 2 : 1.3}
                />
              ))}
            </svg>
          ) : visual === "epochs" ? (
            <svg viewBox="0 0 120 26">
              <path d="M8 13h104" />
              {[12, 60, 108].map((x) => (
                <circle key={x} cx={x} cy="13" r="4" />
              ))}
            </svg>
          ) : visual === "bands" ? (
            <div className="stat-band-strip">
              {Array.from({ length: 24 }, (_, index) => (
                <i key={index} />
              ))}
            </div>
          ) : visual === "reviews" ? (
            <div className="stat-review-strip">
              <i />
              <i />
              <i />
            </div>
          ) : (
            <div className="stat-quality-track">
              <i />
            </div>
          )}
        </div>
      </div>
      <div className={`stat-icon ${color}`}>
        <Icon name={icon} size={20} />
      </div>
    </div>
  );
}
function Chart({
  spectral = false,
  compact = false,
  spectralSamples = [],
  temporalSamples = [],
}: {
  spectral?: boolean;
  compact?: boolean;
  spectralSamples?: readonly SpectralSample[];
  temporalSamples?: readonly TemporalSample[];
}) {
  const samples = spectral
    ? spectralSamples.map((sample) => ({
        x: sample.wavelength,
        y: sample.flux,
        uncertainty: sample.uncertainty,
        provenance: sample.provenance,
        detail: `${sample.observationId} · Band ${sample.band} · ${sample.timestamp}`,
      }))
    : temporalSamples.map((sample) => ({
        x: new Date(sample.timestamp).getTime(),
        y: sample.flux,
        uncertainty: sample.uncertainty,
        provenance: sample.provenance,
        detail: `${sample.observationId} · ${sample.timestamp} · RA ${sample.ra}° · DEC ${sample.dec}°`,
      }));
  const finiteSamples = samples.filter(
    (sample) =>
      Number.isFinite(sample.x) &&
      Number.isFinite(sample.y) &&
      Number.isFinite(sample.uncertainty) &&
      sample.uncertainty >= 0,
  );
  const invalidSampleCount = samples.length - finiteSamples.length;
  const minX = finiteSamples.length ? Math.min(...finiteSamples.map((sample) => sample.x)) : 0;
  const maxX = finiteSamples.length ? Math.max(...finiteSamples.map((sample) => sample.x)) : 1;
  const minY = finiteSamples.length
    ? Math.min(...finiteSamples.map((sample) => sample.y - sample.uncertainty))
    : 0;
  const maxY = finiteSamples.length
    ? Math.max(...finiteSamples.map((sample) => sample.y + sample.uncertainty))
    : 1;
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;
  return (
    <div
      className={`chart ${compact ? "compact" : ""} ${finiteSamples.length ? "has-samples" : "no-samples"}`}
    >
      {finiteSamples.length ? (
        <>
          <svg
            viewBox="0 0 640 220"
            role="img"
            aria-label={
              spectral
                ? "Measured spectral samples with uncertainty bars"
                : "Measured temporal flux samples with uncertainty bars"
            }
          >
            {[35, 75, 115, 155].map((y) => (
              <line key={y} x1="58" y1={y} x2="620" y2={y} stroke="#253043" strokeDasharray="3 5" />
            ))}
            <line x1="58" y1="20" x2="58" y2="180" stroke="#64718a" />
            <line x1="58" y1="180" x2="620" y2="180" stroke="#64718a" />
            <text x="58" y="207" fill="#94a1b7" fontSize="10">
              {spectral ? "Wavelength (μm)" : "Observation time"}
            </text>
            <text transform="translate(16 145) rotate(-90)" fill="#94a1b7" fontSize="10">
              {spectral ? "Flux" : "Measured brightness"}
            </text>
            {finiteSamples.map((sample, index) => {
              const x = 62 + ((sample.x - minX) / xRange) * 550;
              const y = 176 - ((sample.y - minY) / yRange) * 145;
              const error = (sample.uncertainty / yRange) * 145;
              return (
                <g key={`${sample.detail}-${index}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={y - error}
                    y2={y + error}
                    stroke="#a99aff"
                    strokeWidth="1.2"
                  />
                  <line x1={x - 3} x2={x + 3} y1={y - error} y2={y - error} stroke="#a99aff" />
                  <line x1={x - 3} x2={x + 3} y1={y + error} y2={y + error} stroke="#a99aff" />
                  <circle
                    cx={x}
                    cy={y}
                    r="3"
                    fill={
                      sample.provenance === "measured"
                        ? "#68d6e4"
                        : sample.provenance === "estimated"
                          ? "#e4c57e"
                          : "#b39cff"
                    }
                    stroke="#101724"
                    strokeWidth="1.5"
                  >
                    <title>{`${sample.detail} · value ${sample.y} ± ${sample.uncertainty} · ${sample.provenance}`}</title>
                  </circle>
                </g>
              );
            })}
          </svg>
          <div className="chart-provenance-legend" aria-label="Measurement provenance">
            <span className="measured">Measured</span>
            <span className="estimated">Estimated</span>
            <span className="interpolated">Interpolated</span>
          </div>
          <p className="chart-provenance">
            Original samples only · points are not connected · whiskers show supplied uncertainty.
          </p>
        </>
      ) : (
        <div className="chart-empty">
          <span className="chart-empty-mark">
            <Icon name={spectral ? "spectrum" : "time"} size={20} />
          </span>
          <strong>No calibrated measurements loaded</strong>
          <span>
            {spectral
              ? "A spectrum needs measured wavelength, flux and uncertainty for each band."
              : "A time series needs measured timestamps, brightness and uncertainty for each observation."}
          </span>
        </div>
      )}
      {invalidSampleCount > 0 && (
        <p className="chart-data-warning" role="alert">
          {invalidSampleCount} sample{invalidSampleCount === 1 ? "" : "s"} omitted: coordinates,
          values and non-negative uncertainty must be finite.
        </p>
      )}
    </div>
  );
}

function Pagination({
  total,
  page,
  size,
  onPage,
  onSize,
}: {
  total: number;
  page: number;
  size: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="table-footer">
      <span>{total} illustrative candidates</span>
      <div className="pagination-controls">
        <select
          aria-label="Candidates per page"
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
        >
          <option value="3">3 per page</option>
          <option value="5">5 per page</option>
          <option value="10">10 per page</option>
        </select>
        <button
          className="icon-button"
          aria-label="Previous candidate page"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
        >
          <Icon name="chevron" size={12} className="previous-chevron" />
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          className="icon-button"
          aria-label="Next candidate page"
          disabled={page === pages}
          onClick={() => onPage(page + 1)}
        >
          <Icon name="chevron" size={12} />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [moduleIndex, setModuleIndex] = useState(0);
  const [tab, setTab] = useState(0);
  const [experienceMode, setExperienceMode] = useState<"public" | "advanced">("public");
  const [dashboard, setDashboard] = useState(false);
  const [region, setRegion] = useState("Orion Nebula (M42)");
  const [fitsImage, setFitsImage] = useState<FitsImage | null>(null);
  const [ra, setRa] = useState("83.8221");
  const [dec, setDec] = useState("-5.3911");
  const [radius, setRadius] = useState("0.5");
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [celestialView, setCelestialView] = useState(true);
  const [sphereRotation, setSphereRotation] = useState({ x: -10, y: -24 });
  const [sphereLayer, setSphereLayer] = useState("All layers");
  const [sphereZoom, setSphereZoom] = useState(1);
  const [selectedSphereSource, setSelectedSphereSource] = useState<number | null>(null);
  const sphereDragStart = useRef<{ x: number; y: number } | null>(null);
  const panStart = useRef<{ x: number; y: number } | null>(null);
  const [grid, setGrid] = useState(true);
  const [tool, setTool] = useState("move");
  const [circleSelection, setCircleSelection] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [band, setBand] = useState(48);
  const [comparisonBand, setComparisonBand] = useState(76);
  const [cubePosition, setCubePosition] = useState({ x: 2, y: 2 });
  const [cubeRotation, setCubeRotation] = useState({ x: -14, y: -20 });
  const cubeDragStart = useRef<{ x: number; y: number } | null>(null);
  const [selectedTemporalTrack, setSelectedTemporalTrack] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [blink, setBlink] = useState(false);
  const [speed, setSpeed] = useState("700");
  const [swipe, setSwipe] = useState(50);
  const [dateA, setDateA] = useState("1");
  const [dateB, setDateB] = useState("0");
  const [observation, setObservation] = useState(0);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [resultIds, setResultIds] = useState(initialCandidates.map((c) => c.id));
  const [selectedCandidate, setSelectedCandidate] = useState("PX-2025-0042");
  const [saved, setSaved] = useState<string[]>([
    "PX-2025-0039",
    "PX-2025-0036",
    "PX-2025-0031",
    "PX-2025-0028",
  ]);
  const [filter, setFilter] = useState("All statuses");
  const [sort, setSort] = useState("Confidence");
  const [category, setCategory] = useState("All categories");
  const [candidatePage, setCandidatePage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [threshold, setThreshold] = useState(75);
  const [sensitivity, setSensitivity] = useState("Balanced");
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<
    "help" | "settings" | "notifications" | "profile" | "discard" | null
  >(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [units, setUnits] = useState("Degrees");
  const [showMarkers, setShowMarkers] = useState(true);
  const [apiState, setApiState] = useState<"checking" | "online" | "offline">("checking");
  const [apiError, setApiError] = useState("");
  const [apiRegions, setApiRegions] = useState<FeaturedRegion[]>([]);
  const [apiObservations, setApiObservations] = useState<Observation[]>([]);
  const [observationsLoading, setObservationsLoading] = useState(false);
  const [discoveries, setDiscoveries] = useState<CandidateDiscovery[]>([]);
  const [discoveriesLoading, setDiscoveriesLoading] = useState(false);
  const [discoveriesError, setDiscoveriesError] = useState("");
  const [selectedDiscovery, setSelectedDiscovery] = useState<CandidateEvidence | null>(null);
  const [spectralProfile, setSpectralProfile] = useState<SpectralProfile | null>(null);
  const [spectralLoading, setSpectralLoading] = useState(false);
  const [spectralError, setSpectralError] = useState("");
  const [spectralFov, setSpectralFov] = useState("0.05");
  const [temporalResult, setTemporalResult] = useState<TemporalResult | null>(null);
  const [temporalLoading, setTemporalLoading] = useState(false);
  const [temporalMode, setTemporalMode] = useState<"irsa" | "local" | null>(null);
  const [temporalError, setTemporalError] = useState("");
  const [temporalStep, setTemporalStep] = useState("");
  const [epochT1, setEpochT1] = useState("");
  const [epochT2, setEpochT2] = useState("");
  const temporalAbort = useRef<AbortController | null>(null);
  const [localFitsFiles, setLocalFitsFiles] = useState<LocalFitsFile[]>([]);
  const [localFitsLoading, setLocalFitsLoading] = useState(false);
  const [localFitsError, setLocalFitsError] = useState("");
  const [localFileT1, setLocalFileT1] = useState("");
  const [localFileT2, setLocalFileT2] = useState("");
  const [selectedLocalFile, setSelectedLocalFile] = useState("");
  const [localSpectralPoint, setLocalSpectralPoint] = useState<LocalSpectralPoint | null>(null);
  const [localSpectralLoading, setLocalSpectralLoading] = useState(false);
  const [localSpectralError, setLocalSpectralError] = useState("");
  const [localFitsMetadata, setLocalFitsMetadata] = useState<LocalFitsMetadata | null>(null);
  const [localMetadataLoading, setLocalMetadataLoading] = useState(false);
  const [localMetadataError, setLocalMetadataError] = useState("");
  const [previewHdu, setPreviewHdu] = useState<number | undefined>(undefined);
  const fitsInputRef = useRef<HTMLInputElement>(null);
  const currentModule = modules[moduleIndex];
  const candidate = candidates.find((c) => c.id === selectedCandidate) || candidates[0];
  const displayModuleName = (index: number) =>
    experienceMode === "advanced"
      ? modules[index].name
      : [
          "Cosmic Sky",
          "Temporal Universe",
          "Spectral Cube",
          "Object Discovery",
          "Discovery Catalog",
        ][index];
  const displayTabName = (index: number) => {
    if (experienceMode === "advanced") return currentModule.tabs[index];
    const publicTabs = [
      [
        "Explore the sky",
        "Sky map",
        "Find a place",
        "Choose a region",
        "Observation details",
        "Sources",
      ],
      [
        "Explore change",
        "Compare images",
        "Swipe between dates",
        "Blink between dates",
        "Changes",
        "Report",
      ],
      [
        "Explore light",
        "Browse channels",
        "Compare channels",
        "Choose a channel",
        "Source spectrum",
        "Report",
      ],
      [
        "Find moving objects",
        "Choose observations",
        "Processing",
        "Results",
        "Review object",
        "Report",
      ],
      [
        "Saved discoveries",
        "Browse discoveries",
        "Discovery details",
        "Discovery timeline",
        "Evidence",
        "Report",
      ],
    ];
    return publicTabs[moduleIndex][index];
  };
  const publicModuleDescriptions = [
    "Explore the sky in every direction. Choose a point to reveal its sky coordinates.",
    "Move through observing dates and see how the same patch of sky changes.",
    "Explore 102 spectral channels. Calibrated wavelengths and measured signals are not connected in this demo.",
    "Review illustrative moving-object candidates. No detection here is a confirmed discovery.",
    "Keep track of candidates you have saved during this browser session.",
  ];
  const notify = (message: string) => setToast(message);
  const navigate = (index: number, nextTab = 0) => {
    setModuleIndex(index);
    setTab(nextTab);
    setDashboard(false);
    setPlaying(false);
    if (index === 0 && nextTab <= 1) setCelestialView(true);
    setMobileMenu(false);
  };
  const loadFitsFile = async (file: File) => {
    try {
      const image = await decodeFitsImage(file);
      setFitsImage(image);
      navigate(0, 1);
      setCelestialView(false);
      const cubePlanes = image.axes.slice(2).reduce((count, axis) => count * axis, 1);
      notify(
        `${image.fileName} · ${image.width} × ${image.height} px · ${image.hdu} · BITPIX ${image.bitpix} · min ${image.min.toPrecision(4)} · max ${image.max.toPrecision(4)} · ${image.finitePixels.toLocaleString()} valid pixels${cubePlanes > 1 ? ` · showing plane 1 of ${cubePlanes}` : ""}`,
      );
    } catch (error) {
      notify(
        `Could not read FITS file: ${error instanceof Error ? error.message : "Unknown decoding error."}`,
      );
    }
  };
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const controller = new AbortController();
    getFeaturedRegions(controller.signal)
      .then((regions) => {
        setApiRegions(regions);
        setApiState("online");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setApiState("offline");
        setApiError(error instanceof Error ? error.message : "Error al consultar el backend.");
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    temporalAbort.current?.abort();
    temporalAbort.current = null;
    setTemporalLoading(false);
    setTemporalMode(null);
    setTemporalResult(null);
    setTemporalError("");
    setTemporalStep("");
  }, [ra, dec, radius]);
  useEffect(() => {
    const parsedRa = Number(ra);
    const parsedDec = Number(dec);
    const fovDeg = Number(radius);
    setApiObservations([]);
    setTemporalResult(null);
    if (
      !Number.isFinite(parsedRa) ||
      parsedRa < 0 ||
      parsedRa > 360 ||
      !Number.isFinite(parsedDec) ||
      parsedDec < -90 ||
      parsedDec > 90 ||
      !Number.isFinite(fovDeg) ||
      fovDeg < 0.01 ||
      fovDeg > 0.5
    ) {
      setApiError("El servicio de observaciones acepta RA 0°–360°, DEC −90°–90° y FOV 0.01°–0.5°.");
      setObservationsLoading(false);
      return;
    }
    const controller = new AbortController();
    setObservationsLoading(true);
    setApiError("");
    const timer = setTimeout(() => {
      setObservationsLoading(true);
      searchObservations(parsedRa, parsedDec, fovDeg, controller.signal)
        .then((response) => {
          setApiObservations(response.observations);
          setApiState("online");
          setApiError("");
          setEpochT1((current) =>
            response.observations.some((item) => item.obs_id === current)
              ? current
              : (response.observations[0]?.obs_id ?? ""),
          );
          setEpochT2((current) =>
            response.observations.some((item) => item.obs_id === current)
              ? current
              : (response.observations[response.observations.length - 1]?.obs_id ?? ""),
          );
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setApiObservations([]);
          setApiState("offline");
          setApiError(error instanceof Error ? error.message : "Error al consultar observaciones.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setObservationsLoading(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ra, dec, radius]);
  useEffect(() => {
    if (moduleIndex !== 3 && moduleIndex !== 4) return;
    const controller = new AbortController();
    setDiscoveriesLoading(true);
    setDiscoveriesError("");
    getDiscoveries(50, controller.signal)
      .then(setDiscoveries)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDiscoveriesError(error instanceof Error ? error.message : "Error al consultar candidatos.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDiscoveriesLoading(false);
      });
    return () => controller.abort();
  }, [moduleIndex]);
  useEffect(() => {
    setPreviewHdu(undefined);
  }, [selectedLocalFile]);
  useEffect(() => {
    if (!selectedLocalFile) {
      setLocalFitsMetadata(null);
      setLocalMetadataError("");
      return;
    }
    const controller = new AbortController();
    setLocalMetadataLoading(true);
    setLocalMetadataError("");
    getFitsMetadata(selectedLocalFile, controller.signal)
      .then(setLocalFitsMetadata)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLocalFitsMetadata(null);
          setLocalMetadataError(error instanceof Error ? error.message : "No se pudieron leer los metadatos FITS.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLocalMetadataLoading(false);
      });
    return () => controller.abort();
  }, [selectedLocalFile]);
  useEffect(() => {
    if (!localFitsMetadata || localFitsMetadata.file_id !== selectedLocalFile) return;
    const imageHdus = localFitsMetadata.extensions.filter((hdu) => hdu.shape?.length === 2);
    const defaultHdu =
      imageHdus.find((hdu) => hdu.name?.toUpperCase() === "IMAGE")?.index ??
      imageHdus[0]?.index;
    if (defaultHdu !== undefined && previewHdu === undefined) setPreviewHdu(defaultHdu);
  }, [localFitsMetadata, previewHdu, selectedLocalFile]);
  useEffect(() => {
    const consumer: FitsModule[] = [
      "sky_explorer",
      "temporal_vision",
      "spectral_analysis",
      "object_detection",
      "discovery_catalog",
    ];
    const controller = new AbortController();
    setLocalFitsLoading(true);
    setLocalFitsFiles([]);
    setLocalFitsError("");
    setSelectedLocalFile("");
    setLocalFitsMetadata(null);
    setLocalSpectralPoint(null);
    getLocalFitsFiles(consumer[moduleIndex], controller.signal)
      .then((catalog) => {
        setLocalFitsFiles(catalog.files);
        setLocalSpectralPoint(null);
        setLocalSpectralError("");
        const temporalCompatible = catalog.files.filter(
          (file) => file.compatibility.temporal_comparison?.compatible,
        );
        setSelectedLocalFile((current) =>
          catalog.files.some((file) => file.file_id === current)
            ? current
            : (catalog.files[0]?.file_id ?? ""),
        );
        setLocalFileT1((current) =>
          catalog.files.some((file) => file.file_id === current)
            ? current
            : (catalog.files.find((file) => file.compatibility.temporal_comparison?.compatible)?.file_id ?? ""),
        );
        setLocalFileT2((current) =>
          temporalCompatible.some((file) => file.file_id === current)
            ? current
            : (temporalCompatible[temporalCompatible.length - 1]?.file_id ?? ""),
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLocalFitsFiles([]);
          setLocalFitsError(error instanceof Error ? error.message : "No se pudo consultar el inventario FITS local.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLocalFitsLoading(false);
      });
    return () => controller.abort();
  }, [moduleIndex]);
  useEffect(() => {
    if (moduleIndex !== 2) return;
    const parsedRa = Number(ra);
    const parsedDec = Number(dec);
    const fovDeg = Number(spectralFov);
    if (fovDeg < 0.01 || fovDeg > 0.2) {
      setSpectralProfile(null);
      setSpectralLoading(false);
      setSpectralError("Spectral profile endpoint requires a field of view from 0.01° to 0.2°.");
      return;
    }
    const controller = new AbortController();
    setSpectralProfile(null);
    setSpectralLoading(true);
    setSpectralError("");
    getSpectralProfile(parsedRa, parsedDec, fovDeg, controller.signal)
      .then(setSpectralProfile)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSpectralProfile(null);
          setSpectralError(error instanceof Error ? error.message : "Error al cargar perfil espectral.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSpectralLoading(false);
      });
    return () => controller.abort();
  }, [moduleIndex, ra, dec, spectralFov]);
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      if (moduleIndex === 2) setBand((b) => (b === 102 ? 1 : b + 1));
      else if (moduleIndex === 1 && tab !== 3)
        setDateB((epoch) =>
          String(Number(epoch) === 0 ? observations.length - 1 : Number(epoch) - 1),
        );
      else setBlink((b) => !b);
    }, Number(speed));
    return () => clearInterval(interval);
  }, [playing, moduleIndex, speed, tab]);
  useEffect(() => {
    if (!processing) return;
    const interval = setInterval(() => setProgress((p) => Math.min(p + 4, 100)), 160);
    return () => clearInterval(interval);
  }, [processing]);
  useEffect(() => {
    if (processing && progress === 100) {
      const matches = candidates.filter(
        (c) =>
          c.confidence >= threshold &&
          Number(c.motion) >=
            (sensitivity === "Conservative" ? 1.5 : sensitivity === "Balanced" ? 0.5 : 0),
      );
      setResultIds(matches.map((c) => c.id));
      setProcessing(false);
      notify(
        `Illustrative analysis complete. ${matches.length} candidates match your configuration.`,
      );
    }
  }, [progress, processing, threshold, sensitivity, candidates]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        setExpanded(false);
        setMobileMenu(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = document.querySelectorAll<HTMLElement>(
        ".modal button:not(:disabled), .modal a[href], .modal input, .modal select",
      );
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", trapFocus);
      previousFocus?.focus();
    };
  }, [modal]);
  const runAnalysis = () => {
    setProgress(0);
    setProcessing(true);
    setTab(2);
  };
  const runBackendAnalysis = async () => {
    if (temporalLoading) {
      temporalAbort.current?.abort();
      temporalAbort.current = null;
      setTemporalLoading(false);
      setTemporalMode(null);
      setTemporalStep("Análisis cancelado.");
      return;
    }
    if (apiObservations.length < 2) {
      setTemporalError("Se necesitan al menos dos observaciones reales consultables en esta región.");
      return;
    }
    if (!epochT1 || !epochT2 || epochT1 === epochT2) {
      setTemporalError("Selecciona dos exposiciones distintas devueltas por el catálogo.");
      return;
    }
    const fovDeg = Number(radius);
    if (!Number.isFinite(fovDeg) || fovDeg < 0.01 || fovDeg > 0.5) {
      setTemporalError("El servicio temporal acepta FOV entre 0.01° y 0.5°.");
      return;
    }
    const controller = new AbortController();
    temporalAbort.current = controller;
    setTemporalLoading(true);
    setTemporalMode("irsa");
    setTemporalError("");
    setTemporalResult(null);
    setTemporalStep("Enviando comparación al backend…");
    try {
      const result = await runTemporalComparison(
        {
          ra: Number(ra),
          dec: Number(dec),
          fov_deg: fovDeg,
          band_index: Math.max(0, Math.min(101, band - 1)),
          epoch_t1: epochT1,
          epoch_t2: epochT2,
        },
        controller.signal,
        (status: JobStatus) => setTemporalStep(status.step || `Trabajo ${status.status}`),
      );
      setTemporalResult(result);
      setTemporalStep("Comparación temporal completada.");
      try {
        setDiscoveries(await getDiscoveries(50, controller.signal));
        setDiscoveriesError("");
      } catch (error) {
        if (!controller.signal.aborted) {
          setDiscoveriesError(
            error instanceof Error ? `Análisis completado; no se pudo actualizar el catálogo: ${error.message}` : "Análisis completado; no se pudo actualizar el catálogo.",
          );
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setTemporalError(error instanceof Error ? error.message : "La comparación temporal falló.");
        setTemporalStep("");
      }
    } finally {
      if (temporalAbort.current === controller) {
        temporalAbort.current = null;
        setTemporalLoading(false);
        setTemporalMode(null);
      }
    }
  };
  const runLocalBackendAnalysis = async () => {
    if (temporalLoading && temporalMode === "local") {
      temporalAbort.current?.abort();
      temporalAbort.current = null;
      setTemporalLoading(false);
      setTemporalMode(null);
      setTemporalStep("Análisis local cancelado.");
      return;
    }
    if (temporalLoading) return;
    if (!localFileT1 || !localFileT2 || localFileT1 === localFileT2) {
      setTemporalError("Selecciona dos archivos FITS locales distintos asignados al módulo.");
      return;
    }
    const controller = new AbortController();
    temporalAbort.current = controller;
    setTemporalLoading(true);
    setTemporalMode("local");
    setTemporalError("");
    setTemporalResult(null);
    setTemporalStep("Enviando comparación de archivos FITS locales…");
    try {
      const result = await runLocalTemporalComparison(
        {
          file_id_t1: localFileT1,
          file_id_t2: localFileT2,
          ra: Number(ra),
          dec: Number(dec),
        },
        controller.signal,
        (status) => setTemporalStep(status.step || `Trabajo local ${status.status}`),
      );
      setTemporalResult(result);
      setTemporalStep("Comparación FITS local completada.");
      try {
        setDiscoveries(await getDiscoveries(50, controller.signal));
        setDiscoveriesError("");
      } catch (error) {
        if (!controller.signal.aborted) {
          setDiscoveriesError(error instanceof Error ? error.message : "No se pudo actualizar el catálogo.");
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setTemporalError(error instanceof Error ? error.message : "La comparación FITS local falló.");
        setTemporalStep("");
      }
    } finally {
      if (temporalAbort.current === controller) {
        temporalAbort.current = null;
        setTemporalLoading(false);
        setTemporalMode(null);
      }
    }
  };
  const extractLocalSpectrum = async () => {
    if (!selectedLocalFile) return;
    setLocalSpectralLoading(true);
    setLocalSpectralError("");
    try {
      setLocalSpectralPoint(
        await getLocalSpectralPoint(selectedLocalFile, Number(ra), Number(dec)),
      );
    } catch (error) {
      setLocalSpectralPoint(null);
      setLocalSpectralError(error instanceof Error ? error.message : "No se pudo extraer el espectro local.");
    } finally {
      setLocalSpectralLoading(false);
    }
  };
  const loadDiscoveryEvidence = async (candidateCode: string) => {
    try {
      setSelectedDiscovery(await getDiscoveryEvidence(candidateCode));
    } catch (error) {
      setDiscoveriesError(error instanceof Error ? error.message : "No se pudo cargar la ficha.");
    }
  };
  function BackendPanel() {
    const errorBanner = (message: string) => (
      <p className="backend-error" role="alert">
        {message}
      </p>
    );
    const compatibleLocalTemporal = localFitsFiles.filter(
      (file) => file.compatibility.temporal_comparison?.compatible,
    );
    const selectedFile = localFitsFiles.find((file) => file.file_id === selectedLocalFile);
    const selectedFitsMetadata =
      localFitsMetadata?.file_id === selectedLocalFile ? localFitsMetadata : null;
    const previewHdus = (selectedFitsMetadata?.extensions ?? [])
      .filter((hdu) => hdu.shape?.length === 2)
      .map((hdu) => ({ index: hdu.index, name: hdu.name }));
    const localInventory = (
      <>
        <div className="panel-heading backend-subheading">
          <h3>Inventario local FITS</h3>
          <span className="count-pill">{localFitsLoading ? "…" : localFitsFiles.length}</span>
        </div>
        {localFitsError && errorBanner(localFitsError)}
        {localFitsLoading ? (
          <p className="backend-note">Consultando inventario local…</p>
        ) : localFitsFiles.length ? (
          <>
            <label className="backend-fov">
              Archivo FITS local
              <select value={selectedLocalFile} onChange={(event) => setSelectedLocalFile(event.target.value)}>
                {localFitsFiles.map((file) => (
                  <option key={file.file_id} value={file.file_id}>
                    {file.filename} · {file.validation_status} · {file.release ?? "release unknown"}
                  </option>
                ))}
              </select>
            </label>
            {selectedFile && (
              <>
                {previewHdus.length > 1 && (
                  <label className="backend-fov">
                    HDU de previsualización
                    <select value={previewHdu ?? ""} onChange={(event) => setPreviewHdu(Number(event.target.value))}>
                      {previewHdus.map((hdu) => <option key={hdu.index} value={hdu.index}>{hdu.index} · {hdu.name ?? "imagen"}</option>)}
                    </select>
                  </label>
                )}
                {selectedFile.compatibility.sky_preview?.compatible ? (
                  <img className="fits-preview" src={getFitsPreviewUrl(selectedFile.file_id, previewHdu)} alt={`Rendered preview from FITS file ${selectedFile.filename}; derived visualization, not original data`} />
                ) : <p className="backend-note">No se encontró una imagen FITS 2D compatible para previsualizar.</p>}
                <div className="backend-file-meta">
                  <strong>{selectedFile.relative_path}</strong>
                  <span>{selectedFile.size_bytes?.toLocaleString() ?? "?"} bytes · SHA-256 {selectedFile.sha256 ?? "unavailable"}</span>
                  <span>Release {selectedFile.release ?? "not identified"} · {selectedFile.hdu_count} HDUs · celestial WCS {selectedFile.has_celestial_wcs ? "present" : "absent"} · spectral WCS {selectedFile.has_spectral_wcs ? "present" : "absent"}</span>
                  <span>Consumers: {selectedFile.consumers.join(", ") || "not assigned"}</span>
                  {selectedFile.validation_warnings.map((warning, index) => <small key={index}>{warning}</small>)}
                  {localMetadataLoading && <small role="status">Leyendo HDUs y cabeceras…</small>}
                  {localMetadataError && errorBanner(localMetadataError)}
                  {selectedFitsMetadata && (
                    <details className="backend-hdu-list">
                      <summary>Inspección de {selectedFitsMetadata.extensions.length} HDUs</summary>
                      {selectedFitsMetadata.extensions.map((hdu) => (
                        <details key={hdu.index}>
                          <summary>
                            HDU {hdu.index} · {hdu.name ?? hdu.type} · {hdu.shape?.join(" × ") ?? "sin array"}
                            {" · CHECKSUM "}
                            {hdu.checksum_present ? (hdu.checksum_valid ? "válido" : "inválido") : "ausente"}
                            {" · DATASUM "}
                            {hdu.datasum_present ? (hdu.datasum_valid ? "válido" : "inválido") : "ausente"}
                            {" · WCS celeste "}
                            {hdu.has_celestial_wcs ? "sí" : "no"}
                            {" · WCS espectral "}
                            {hdu.has_spectral_wcs ? "sí" : "no"}
                          </summary>
                          <div className="backend-header-cards">
                            {hdu.header_cards.map((card, index) => (
                              <span key={`${hdu.index}-${card.keyword}-${index}`}>
                                <b>{card.keyword || "(blank)"}</b> {String(card.value ?? "")} <small>{card.comment}</small>
                              </span>
                            ))}
                          </div>
                        </details>
                      ))}
                      <div className="backend-file-meta">
                        {Object.entries(selectedFitsMetadata.metadata_presence).map(([field, status]) => (
                          <span key={field}>{field}: {status}</span>
                        ))}
                      </div>
                    </details>
                  )}
                  <a className="text-link" href={getFitsDownloadUrl(selectedFile.file_id)} download>
                    Download original FITS <Icon name="download" size={13} />
                  </a>
                </div>
              </>
            )}
          </>
        ) : (
          <p className="backend-note">
            No hay archivos asignados a este módulo. Agrega archivos en Backend/data/raw/spherex y asígnalos en fits-consumers.json; después regenera el manifiesto.
          </p>
        )}
      </>
    );
    const comparisonControls = (
      <>
        <p className="backend-note">
          Este endpoint alinea los FITS mediante WCS, propaga varianzas/máscaras y genera un mapa Z.
          El selector de banda se envía como índice, según el esquema del Backend.
        </p>
        <div className="backend-controls">
          <label>
            Época T1
            <select value={epochT1} onChange={(event) => setEpochT1(event.target.value)}>
              {apiObservations.map((item) => <option key={item.obs_id} value={item.obs_id}>{item.obs_id}</option>)}
            </select>
          </label>
          <label>
            Época T2
            <select value={epochT2} onChange={(event) => setEpochT2(event.target.value)}>
              {apiObservations.map((item) => <option key={item.obs_id} value={item.obs_id}>{item.obs_id}</option>)}
            </select>
          </label>
          <Button primary icon={temporalMode === "irsa" ? "pause" : "play"} onClick={() => void runBackendAnalysis()} disabled={apiObservations.length < 2 || (temporalLoading && temporalMode !== "irsa")}>
            {temporalMode === "irsa" ? "Cancelar análisis" : "Ejecutar análisis real"}
          </Button>
        </div>
        {(temporalLoading || temporalStep) && <p className="backend-note" role="status">{temporalStep}</p>}
        {temporalResult && (
          <div className="backend-result">
            <div className="backend-image-grid">
              {[
                ["Época T1 · PNG procesado", temporalResult.t1_image_url],
                ["Época T2 · PNG procesado", temporalResult.t2_image_url],
                ["Diferencia Z · PNG procesado", temporalResult.diff_z_image_url],
              ].map(([label, path]) => (
                <figure key={label}>
                  <img src={backendAssetUrl(path)} alt={label} />
                  <figcaption>{label}</figcaption>
                </figure>
              ))}
            </div>
            <div className="detail-rows">
              <div><span>Píxeles válidos</span><b>{String(temporalResult.metrics.valid_pixel_ratio ?? "No informado")}</b></div>
              <div><span>Fuentes en T1 / T2</span><b>{String(temporalResult.metrics.sources_detected_t1 ?? "—")} / {String(temporalResult.metrics.sources_detected_t2 ?? "—")}</b></div>
              <div><span>Significancia máxima Z</span><b>{String(temporalResult.metrics.peak_z_score ?? "—")}</b></div>
              <div><span>Candidatos en este análisis</span><b>{temporalResult.candidates.length}</b></div>
            </div>
            <p className="backend-note">El backend entrega PNGs renderizados del procesamiento FITS; no transmite los MEF FITS originales al navegador.</p>
            {temporalResult.candidates.length > 0 && (
              <div className="backend-discoveries">
                {temporalResult.candidates.map((item) => (
                  <div className="backend-discovery-result" key={`${item.candidate_id}-${item.ra}-${item.dec}`}>
                    <strong>{item.candidate_id}</strong>
                    <span>RA {item.ra.toFixed(6)}° · DEC {item.dec.toFixed(6)}°</span>
                    <small>|Z| {item.peak_z_score.toFixed(3)} · Score C experimental {item.confidence_score_c.toFixed(4)} · µ {item.angular_velocity_mu === null ? "no medido" : `${item.angular_velocity_mu} arcsec/day`}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </>
    );
    const localComparisonControls = (
      <div className="backend-local-comparison">
        <h4>Comparar archivos del inventario local</h4>
        {compatibleLocalTemporal.length >= 2 ? (
          <div className="backend-controls">
            <label>FITS T1<select value={localFileT1} onChange={(event) => setLocalFileT1(event.target.value)}>{compatibleLocalTemporal.map((file) => <option key={file.file_id} value={file.file_id}>{file.filename} · {file.release}</option>)}</select></label>
            <label>FITS T2<select value={localFileT2} onChange={(event) => setLocalFileT2(event.target.value)}>{compatibleLocalTemporal.map((file) => <option key={file.file_id} value={file.file_id}>{file.filename} · {file.release}</option>)}</select></label>
            <Button primary icon={temporalMode === "local" ? "pause" : "play"} onClick={() => void runLocalBackendAnalysis()} disabled={temporalLoading && temporalMode !== "local"}>
              {temporalMode === "local" ? "Cancelar comparación local" : "Comparar FITS locales"}
            </Button>
          </div>
        ) : <p className="backend-note">{localFitsLoading ? "Cargando manifiesto FITS…" : localFitsFiles.length === 0 ? "No hay archivos FITS asignados a este módulo." : "Se necesitan dos MEF compatibles (release DR1/QR3, DATE-OBS y WCS). Se comparan la banda y calibración declaradas; se exige la misma grilla WCS y PSF compatible. El recorte es de 150 píxeles y el pipeline local no usa FOV ni selecciona una banda dentro del FITS."}</p>}
        {localFitsError && errorBanner(localFitsError)}
      </div>
    );

    if (moduleIndex === 0) {
      return (
        <Panel title="Datos del Backend · Sky Explorer" action={<Badge color={apiState === "online" ? "green" : apiState === "checking" ? "blue" : "yellow"}>{apiState === "online" ? "API conectada" : apiState === "checking" ? "Conectando…" : "API no disponible"}</Badge>}>
          <div className="panel-body">
            <p className="backend-note">GET /api/v1/sky/regions/featured · GET /api/v1/sky/observations?ra=&amp;dec=&amp;fov_deg=</p>
            {apiError && errorBanner(apiError)}
            <div className="backend-region-list">
              {apiRegions.map((item) => (
                <button key={item.region_id} onClick={() => {
                  setRegion(item.name);
                  setRa(String(item.ra));
                  setDec(String(item.dec));
                  setRadius(String(item.fov_deg));
                }}>
                  <strong>{item.name}</strong><span>RA {item.ra}° · DEC {item.dec}° · FOV {item.fov_deg}°</span>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
            <div className="panel-heading backend-subheading">
              <h3>IRSA observations for current coordinates</h3>
              <span className="count-pill">{observationsLoading ? "…" : apiObservations.length}</span>
            </div>
            {observationsLoading ? <p className="backend-note">Consultando catálogo IRSA…</p> : apiObservations.length ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>OBSERVATION</th><th>COLLECTION</th><th>MJD RANGE</th><th>WAVELENGTH (µm)</th></tr></thead>
                  <tbody>{apiObservations.map((item) => (
                    <tr key={item.obs_id}>
                      <td className="mono">{item.obs_id}</td><td>{item.collection}</td>
                      <td className="mono">{item.t_min.toFixed(5)} – {item.t_max.toFixed(5)}</td>
                      <td className="mono">{item.wavelength_min_um ?? "—"} – {item.wavelength_max_um ?? "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="backend-note">No hay observaciones IRSA disponibles para esta posición/FOV. Los datos ilustrativos de las vistas se mantienen identificados como tales.</p>}
            {localInventory}
          </div>
        </Panel>
      );
    }

    if (moduleIndex === 1 || moduleIndex === 3) {
      return (
        <Panel title="Procesamiento del Backend · Comparación temporal" action={<span className="mono muted">POST /api/v1/jobs/temporal · GET /api/v1/jobs/{'{job_id}'}</span>}>
          <div className="panel-body">
            {apiError && errorBanner(apiError)}
            {apiObservations.length < 2
              ? <p className="backend-note">{observationsLoading ? "Consultando observaciones compatibles…" : "Se requieren al menos dos observaciones reales del catálogo para ejecutar el análisis."}</p>
              : comparisonControls}
            {apiObservations.length >= 2 && temporalError && !temporalLoading ? errorBanner(temporalError) : null}
            {localComparisonControls}
            {localInventory}
            {moduleIndex === 3 && (
              <div className="backend-subheading">
                <h3>Candidatos persistidos</h3>
                {discoveriesLoading && <p className="backend-note">Consultando candidatos…</p>}
                {discoveriesError && errorBanner(discoveriesError)}
                {discoveries.map((item) => (
                  <button className="backend-candidate-row" key={item.candidate_code} onClick={() => void loadDiscoveryEvidence(item.candidate_code)}>
                    <strong>{item.candidate_code}</strong>
                    <span>{item.category} · |Z| {item.peak_z_score.toFixed(3)} · Score C experimental {String(item.metrics_summary?.confidence_score_c ?? "—")}</span>
                  </button>
                ))}
                {!discoveriesLoading && !discoveries.length && <p className="backend-note">No hay candidatos persistidos. Ejecuta el análisis real con al menos dos observaciones.</p>}
              </div>
            )}
          </div>
        </Panel>
      );
    }

    if (moduleIndex === 2) {
      return (
        <Panel title="Perfil espectral medido · Backend" action={<span className="mono muted">GET /api/v1/spectral/profile</span>}>
          <div className="panel-body">
            <p className="backend-note">
              Extracción directa MEF usando WCS espectral (sin interpolar). Unidades reportadas por el servicio: µm y MJy/sr.
            </p>
            <label className="backend-fov">
              Field of view (degrees; endpoint accepts 0.01–0.2°)
              <input type="number" min="0.01" max="0.2" step="0.01" value={spectralFov} onChange={(event) => setSpectralFov(event.target.value)} />
            </label>
            {spectralLoading && <p className="backend-note" role="status">Descargando y extrayendo muestras FITS…</p>}
            {spectralError && errorBanner(spectralError)}
            {spectralProfile && (
              <>
                <p className="backend-note">{spectralProfile.total_channels_measured} muestras válidas · {spectralProfile.measurement_type}</p>
                {spectralProfile.failed_observations.length > 0 && (
                  <p className="backend-note" role="status">
                    Resultado parcial: {spectralProfile.failed_observations.length} observaciones no pudieron descargarse o procesarse.
                  </p>
                )}
                {spectralProfile.spectrum.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>WAVELENGTH (µm)</th><th>FLUX (MJy/sr)</th><th>UNCERTAINTY (MJy/sr)</th><th>OBSERVATION</th><th>MJD</th></tr></thead>
                      <tbody>{spectralProfile.spectrum.map((point, index) => (
                        <tr key={`${point.obs_id}-${index}`}>
                          <td className="mono">{point.wavelength_um}</td><td className="mono">{point.flux_mjy_sr}</td>
                          <td className="mono">{point.flux_error_mjy_sr}</td><td className="mono">{point.obs_id}</td><td className="mono">{point.t_min}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <p className="backend-note">El servicio respondió correctamente pero no encontró canales válidos para estas coordenadas.</p>}
              </>
            )}
            {localFitsFiles.length > 0 && (
              <div className="backend-local-spectrum">
                <h4>Extraer muestra de un FITS local</h4>
                <p className="backend-note">Consulta un píxel sobre su WCS espectral. Cada archivo devuelve una muestra; no se interpola entre canales ni se combina con otras exposiciones.</p>
                <label className="backend-fov">
                  Archivo local
                  <select value={selectedLocalFile} onChange={(event) => setSelectedLocalFile(event.target.value)}>
                    {localFitsFiles.map((file) => <option key={file.file_id} value={file.file_id}>{file.filename}</option>)}
                  </select>
                </label>
                <Button icon="spectrum" onClick={() => void extractLocalSpectrum()} disabled={!selectedFile?.compatibility.spectral_profile?.compatible || localSpectralLoading}>
                  {localSpectralLoading ? "Extrayendo…" : "Extraer muestra local"}
                </Button>
                {localSpectralError && errorBanner(localSpectralError)}
                {localSpectralPoint && (
                  <div className="backend-file-meta">
                    <strong>{localSpectralPoint.filename} · {localSpectralPoint.measurement_type}</strong>
                    <span>λ {localSpectralPoint.wavelength_um} µm · Flux {localSpectralPoint.flux} {localSpectralPoint.unit} · Uncertainty {localSpectralPoint.flux_error} {localSpectralPoint.uncertainty_unit}</span>
                    <span>RA {localSpectralPoint.ra}° · DEC {localSpectralPoint.dec}° · FLAGS {localSpectralPoint.flag} · release {localSpectralPoint.release ?? "unknown"}</span>
                  </div>
                )}
                {localInventory}
              </div>
            )}
          </div>
        </Panel>
      );
    }

    return (
      <Panel title="Catálogo de candidatos del Backend" action={<span className="mono muted">GET /api/v1/detection/discoveries</span>}>
        <div className="panel-body">
          <p className="backend-note">Los candidatos aparecen aquí tras ser persistidos por una ejecución temporal. La puntuación experimental C no es una probabilidad calibrada.</p>
          {discoveriesLoading && <p className="backend-note" role="status">Consultando base de datos…</p>}
          {discoveriesError && errorBanner(discoveriesError)}
          {discoveries.length ? (
            <div className="backend-discoveries">
              {discoveries.map((item) => {
                const metrics = item.metrics_summary;
                const score = metrics?.confidence_score_c;
                const velocity = metrics?.angular_velocity_mu;
                return (
                  <button key={item.candidate_code} onClick={() => void loadDiscoveryEvidence(item.candidate_code)}>
                    <strong>{item.candidate_code}</strong>
                    <span>{item.category} · RA {item.ra.toFixed(5)}° · DEC {item.dec.toFixed(5)}°</span>
                    <small>Peak |Z| {item.peak_z_score.toFixed(3)} · Score C {typeof score === "number" ? score.toFixed(4) : "—"} · µ {typeof velocity === "number" ? `${velocity} arcsec/day` : "no medido"}</small>
                  </button>
                );
              })}
            </div>
          ) : !discoveriesLoading && <p className="backend-note">El backend no ha devuelto candidatos persistidos.</p>}
          {selectedDiscovery && (
            <div className="backend-evidence">
              <strong>Evidence · {selectedDiscovery.candidate_code}</strong>
              <span>Verificado: {selectedDiscovery.is_verified ? "sí" : "no"}</span>
              <span>Épocas: {selectedDiscovery.epochs_involved.join(", ") || "no informadas"}</span>
              <span>Score C experimental: {String(selectedDiscovery.metrics_summary?.confidence_score_c ?? "no informado")} (no es probabilidad).</span>
            </div>
          )}
          {localFitsFiles.length > 0 && (
            <div className="backend-file-meta">
              <strong>Archivos locales relacionados</strong>
              {localFitsFiles.map((file) => <span key={file.file_id}>{file.filename} · {file.release ?? "release unknown"} · {file.validation_status}</span>)}
            </div>
          )}
        </div>
      </Panel>
    );
  }
  const updateStatus = (status: string) => {
    setCandidates((cs) => cs.map((c) => (c.id === selectedCandidate ? { ...c, status } : c)));
    notify(`${selectedCandidate} marked as ${status.toLowerCase()}.`);
  };
  const exportReport = () => {
    const text = `SPHEREX — PLANET X\nSIMULATED DATA · NASA Space Apps concept · Not an official NASA product\n\n${currentModule.name} — ${currentModule.tabs[tab]}\nRegion: ${region}\nRA: ${ra}° | DEC: ${dec}° | Radius: ${radius}°\nObservation A: ${observations[Number(dateA)].date}\nObservation B: ${observations[Number(dateB)].date}\nSelected band: ${band} | Wavelength calibration: unavailable\nDetection threshold: ${threshold}% | Sensitivity: ${sensitivity}\n\n${candidates.map((c) => `${c.id} | RA ${c.ra} | DEC ${c.dec} | ${c.motion} arcsec | ${c.confidence}% | ${c.status}`).join("\n")}\n\nImages: Samuel PASTEUR-FOSSE / Unsplash. Visible-light reference imagery, not calibrated SPHEREx data.\nAll observations, spectra, movements and candidates are illustrative. No scientific discovery is claimed.`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `SPHEREX-${currentModule.name.replace(/ /g, "-")}-demo-report.txt`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Demo report exported.");
  };
  const searchCoordinates = (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !Number.isFinite(Number(ra)) ||
      Number(ra) < 0 ||
      Number(ra) >= 360 ||
      !Number.isFinite(Number(dec)) ||
      Number(dec) < -90 ||
      Number(dec) > 90
    )
      return notify("Enter a valid RA (0–360°) and DEC (−90–90°).");
    setRegion(
      Math.abs(Number(ra) - 83.8221) < 0.1
        ? "Orion Nebula (M42)"
        : `Custom field · ${Number(ra).toFixed(4)}°`,
    );
    setTab(3);
    notify("Region selected. Reference imagery is illustrative, not a live sky survey.");
  };
  const globalSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    const coordinates = query.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*[,/ ]\s*([+-]?\d+(?:\.\d+)?)\s*$/);
    if (coordinates) {
      const [, rightAscension, declination] = coordinates;
      if (
        Number(rightAscension) < 0 ||
        Number(rightAscension) >= 360 ||
        Math.abs(Number(declination)) > 90
      ) {
        notify("Coordinates must be RA 0–360° and DEC −90–90°.");
        return;
      }
      setRa(rightAscension);
      setDec(declination);
      setRegion(
        Math.abs(Number(rightAscension) - 83.8221) < 0.1
          ? "Orion Nebula (M42)"
          : `Custom field · ${Number(rightAscension).toFixed(4)}°`,
      );
      navigate(0, 3);
      setQuery("");
      notify("Coordinate context updated. Sky imagery is illustrative.");
      return;
    }
    const found = candidates.find((c) => c.id.toLowerCase().includes(query.toLowerCase()));
    if (found) {
      setSelectedCandidate(found.id);
      navigate(4, 2);
    } else if (/orion|m42/i.test(query)) {
      setRegion("Orion Nebula (M42)");
      setRa("83.8221");
      setDec("-5.3911");
      navigate(0, 0);
    } else {
      navigate(0, 2);
      notify("Search the demo region M42, a candidate ID, or enter sky coordinates.");
    }
    setQuery("");
  };

  function SkyMap({
    small = false,
    epoch = false,
    difference = false,
    selection = true,
    spectralBand,
  }: {
    small?: boolean;
    epoch?: boolean;
    difference?: boolean;
    selection?: boolean;
    spectralBand?: number;
  }) {
    const visibleFitsImage =
      fitsImage && !small && !epoch && !difference && !spectralBand ? fitsImage : null;
    if (celestialView && !small && !epoch && !difference && !spectralBand) {
      const sphereObjects = Array.from({ length: 22 }, (_, index) => {
        const kind =
          index === 0
            ? "Observations"
            : index === 7
              ? "Detections"
              : ["Sources", "Observations", "Detections"][index % 3];
        const candidate = candidates.find((item) => item.id === "PX-2025-0042");
        return {
          index,
          kind,
          name:
            index === 0
              ? region
              : index === 7
                ? "PX-2025-0042"
                : `Demo source ${String(index + 1).padStart(2, "0")}`,
          ra:
            index === 0
              ? ra
              : index === 7
                ? candidate?.ra.replace("°", "") || ra
                : (12.45 + index * 13.72).toFixed(4),
          dec:
            index === 0
              ? dec
              : index === 7
                ? candidate?.dec.replace("−", "-").replace("°", "") || dec
                : (-48.2 + index * 4.13).toFixed(4),
        };
      });
      const selectedObject = sphereObjects.find((object) => object.index === selectedSphereSource);
      const visibleObjects =
        sphereLayer === "All layers"
          ? sphereObjects
          : sphereObjects.filter((object) => object.kind === sphereLayer);
      return (
        <div className="cosmic-sky-stage">
          <div className="cosmic-sky-toolbar">
            <div>
              <span className="live-dot" />
              <strong>CELESTIAL SPHERE</strong>
              <span className="mono muted">ICRS · J2000 · DIRECTIONS ONLY</span>
            </div>
            <select
              value={sphereLayer}
              onChange={(event) => setSphereLayer(event.target.value)}
              aria-label="Celestial sphere layer"
            >
              <option>All layers</option>
              <option>Sources</option>
              <option>Observations</option>
              <option>Detections</option>
            </select>
          </div>
          <div className="celestial-sphere-wrap">
            <div
              className="celestial-sphere"
              style={{
                transform: `rotateX(${sphereRotation.x}deg) rotateY(${sphereRotation.y}deg) scale(${sphereZoom})`,
              }}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest("button")) return;
                sphereDragStart.current = { x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!sphereDragStart.current) return;
                const deltaX = event.clientX - sphereDragStart.current.x;
                const deltaY = event.clientY - sphereDragStart.current.y;
                sphereDragStart.current = { x: event.clientX, y: event.clientY };
                setSphereRotation((rotation) => ({
                  x: rotation.x + deltaY * 0.35,
                  y: rotation.y + deltaX * 0.35,
                }));
              }}
              onPointerUp={() => {
                sphereDragStart.current = null;
              }}
              onPointerCancel={() => {
                sphereDragStart.current = null;
              }}
              role="group"
              aria-label="Interactive celestial sphere showing directions in the sky"
            >
              <div className="sphere-grid sphere-latitude" />
              <div className="sphere-grid sphere-longitude" />
              {visibleObjects.map(({ index, kind, name }) => (
                <button
                  key={index}
                  className={`sphere-source source-${index % 4} sphere-${kind.toLowerCase()} ${selectedSphereSource === index ? "selected" : ""}`}
                  style={{
                    left: `${14 + ((index * 37) % 72)}%`,
                    top: `${12 + ((index * 23) % 72)}%`,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedSphereSource(index);
                  }}
                  aria-label={`Select ${kind.toLowerCase()} ${name}`}
                  aria-pressed={selectedSphereSource === index}
                />
              ))}
              <span className="sphere-axis axis-ra">RA 05h 35m</span>
              <span className="sphere-axis axis-dec">DEC −05°</span>
            </div>
            <div className="sphere-orbit orbit-one" />
            <div className="sphere-orbit orbit-two" />
            <div className="sphere-zoom-controls" aria-label="Celestial sphere zoom">
              <button
                title="Zoom out"
                onClick={() => setSphereZoom((value) => Math.max(0.8, value - 0.1))}
              >
                <Icon name="minus" size={14} />
              </button>
              <span>{sphereZoom.toFixed(1)}×</span>
              <button
                title="Zoom in"
                onClick={() => setSphereZoom((value) => Math.min(1.4, value + 0.1))}
              >
                <Icon name="plus" size={14} />
              </button>
            </div>
          </div>
          {selectedObject && (
            <div className="sphere-selection">
              <div>
                <span className="data-label">SELECTED {selectedObject.kind.toUpperCase()}</span>
                <strong>{selectedObject.name}</strong>
                <span className="mono">
                  RA {selectedObject.ra}° · DEC {selectedObject.dec}°
                </span>
              </div>
              <button
                className="text-link"
                onClick={() => {
                  setRegion(selectedObject.name);
                  setRa(selectedObject.ra);
                  setDec(selectedObject.dec);
                  setCelestialView(false);
                  setTab(1);
                }}
              >
                Open region field <Icon name="arrow" size={14} />
              </button>
            </div>
          )}
          <div className="cosmic-sky-footer">
            <div className="sphere-legend">
              <span>
                <i className="legend-dot cyan" />
                Sources
              </span>
              <span>
                <i className="legend-dot purple" />
                Detections
              </span>
              <span>
                <i className="legend-dot green" />
                Observations
              </span>
              <span className="sphere-layer-count">{visibleObjects.length} markers</span>
            </div>
            <div className="sphere-hint">
              <Icon name="move" size={14} /> Drag to rotate · Click a source to inspect
            </div>
            <button
              className="text-link"
              onClick={() => {
                setCelestialView(false);
                setTab(1);
              }}
            >
              Open region field <Icon name="arrow" size={14} />
            </button>
          </div>
          <p className="sphere-integrity">
            <Icon name="info" size={13} /> Direction-only sky view; marker positions and metadata
            are illustrative. No physical distances are encoded.
          </p>
        </div>
      );
    }
    return (
      <div
        className={`sky-map ${small ? "small" : ""} ${expanded && !small ? "map-expanded" : ""} ${tool === "square" || tool === "circle" ? "selecting" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) void loadFitsFile(file);
        }}
        onPointerDown={(event) => {
          if (tool === "move" && !(event.target as HTMLElement).closest("button,input,select")) {
            panStart.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerUp={(event) => {
          if (panStart.current) {
            const dx = event.clientX - panStart.current.x;
            const dy = event.clientY - panStart.current.y;
            setPan((p) => ({
              x: Math.max(-12, Math.min(12, p.x + dx / 18)),
              y: Math.max(-12, Math.min(12, p.y + dy / 18)),
            }));
            panStart.current = null;
          }
        }}
        onClick={(event) => {
          if ((tool === "square" || tool === "circle") && event.target === event.currentTarget) {
            setCircleSelection(tool === "circle");
            navigate(0, 3);
          }
        }}
      >
        <img
          draggable={false}
          className={`sky-photo ${epoch ? "epoch-b" : ""} ${difference ? "difference-photo" : ""}`}
          src={visibleFitsImage?.imageUrl ?? skyImage}
          alt={
            visibleFitsImage
              ? `FITS image ${visibleFitsImage.fileName}, ${visibleFitsImage.width} by ${visibleFitsImage.height} pixels`
              : "Illustrative optical star field of the Orion Nebula, photographed by Samuel PASTEUR-FOSSE"
          }
          style={{
            transform: `scale(${zoom + (pan.x || pan.y ? 0.3 : 0)}) translate(${pan.x + (epoch ? 0.5 : 0)}%, ${pan.y + (epoch ? -0.3 : 0)}%)`,
            filter:
              spectralBand && !visibleFitsImage
                ? `hue-rotate(${(spectralBand - 48) * 1.8}deg) brightness(${0.65 + spectralBand / 220})`
                : undefined,
          }}
        />
        <div className="sky-vignette" />
        {grid && !visibleFitsImage && <div className="coordinate-grid" />}
        <div className="map-top-label">
          <span className="live-dot" />
          {(visibleFitsImage?.fileName ?? region).toUpperCase()}
          <span className="map-label-divider">/</span>
          <span>
            {visibleFitsImage
              ? `${visibleFitsImage.width} × ${visibleFitsImage.height} · ${visibleFitsImage.hdu}`
              : spectralBand
                ? `BAND ${String(spectralBand).padStart(3, "0")} · CALIBRATION UNAVAILABLE`
                : "COMPOSITE VIEW"}
          </span>
        </div>
        {!visibleFitsImage && (
          <>
            <div className="coordinate-labels top">
              <span>05h 36m</span>
              <span>05h 35m</span>
              <span>05h 34m</span>
              <span>05h 33m</span>
            </div>
            <div className="coordinate-labels left">
              <span>−05° 15′</span>
              <span>−05° 20′</span>
              <span>−05° 25′</span>
              <span>−05° 30′</span>
            </div>
          </>
        )}
        {!small && (
          <div className="map-toolset">
            <input
              ref={fitsInputRef}
              type="file"
              accept=".fits,.fit,.fts,application/fits"
              aria-label="Choose a FITS image"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFitsFile(file);
                event.target.value = "";
              }}
            />
            {(
              [
                "move",
                "cross",
                "square",
                "circle",
                ...(!visibleFitsImage ? ["layers"] : []),
              ] as IconName[]
            ).map((t) => (
              <button
                key={t}
                title={
                  {
                    move: "Pan / zoom view",
                    cross: "Center on selected region",
                    square: "Select rectangular region",
                    circle: "Select circular region",
                    layers: "Toggle coordinate grid",
                  }[t as string]
                }
                aria-label={t}
                className={tool === t ? "active" : ""}
                onClick={() => {
                  if (t === "layers") setGrid(!grid);
                  else if (t === "cross") {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                    setTool(t);
                  } else {
                    setTool(t);
                    if (t === "square" || t === "circle") {
                      setCircleSelection(t === "circle");
                      setTab(3);
                    }
                  }
                }}
              >
                <Icon name={t} size={17} />
              </button>
            ))}
            <button
              title="Load a FITS image"
              aria-label="Load a FITS image"
              onClick={() => fitsInputRef.current?.click()}
            >
              <Icon name="upload" size={17} />
            </button>
            {visibleFitsImage && (
              <button
                title="Return to reference image"
                aria-label="Return to reference image"
                onClick={() => setFitsImage(null)}
              >
                <Icon name="close" size={17} />
              </button>
            )}
          </div>
        )}
        {selection && !visibleFitsImage && (
          <div className={`region-outline ${circleSelection ? "rounded" : ""}`}>
            <span className="selection-corner tl" />
            <span className="selection-corner tr" />
            <span className="selection-corner bl" />
            <span className="selection-corner br" />
            <span className="selection-cross">+</span>
            <span className="selection-label">
              SELECTED REGION{" "}
              <span>
                {radius}° × {radius}°
              </span>
            </span>
          </div>
        )}
        {showMarkers && !visibleFitsImage && (
          <>
            <button
              className={`source-point source-one ${epoch ? "shifted" : ""}`}
              onClick={() => {
                setSelectedCandidate("PX-2025-0042");
                navigate(3, 4);
              }}
              title="Inspect simulated candidate PX-2025-0042"
              aria-label="Inspect candidate PX-2025-0042"
            >
              <span />
              <i>PX-0042</i>
            </button>
            <button
              className="source-point source-two"
              onClick={() => {
                setSelectedCandidate("PX-2025-0039");
                navigate(4, 2);
              }}
              title="Inspect simulated candidate PX-2025-0039"
              aria-label="Inspect candidate PX-2025-0039"
            >
              <span />
            </button>
            <span className="star-label">θ¹ Orionis</span>
          </>
        )}
        {difference && (
          <>
            <div className="difference-marker first" />
            <div className="difference-marker second" />
            <div className="difference-key">
              <span />
              Positive residual <i />
              Negative residual
            </div>
          </>
        )}
        {!visibleFitsImage && (
          <>
            <div className="compass">
              <span>N</span>
              <Icon name="arrow" size={23} />
              <b>E</b>
            </div>
            <div className="angular-scale">
              <span />5 arcmin
            </div>
          </>
        )}
        {!small && (
          <>
            {!visibleFitsImage && (
              <div className="map-bottom-coordinates">
                <span>RA</span>{" "}
                {units === "Degrees"
                  ? `${Number(ra).toFixed(4)}°`
                  : `${(Number(ra) / 15).toFixed(4)}h`}
                <i />
                <span>DEC</span> {Number(dec).toFixed(4)}° <i />
                <span>FOV</span> {(1.2 / zoom).toFixed(2)}°
              </div>
            )}
            <div className="map-zoom">
              <button title="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.25))}>
                <Icon name="minus" size={15} />
              </button>
              <span>{zoom.toFixed(2)}×</span>
              <button title="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
                <Icon name="plus" size={15} />
              </button>
              <button
                title={expanded ? "Exit expanded map" : "Expand map"}
                onClick={() => setExpanded(!expanded)}
              >
                <Icon name={expanded ? "close" : "expand"} size={15} />
              </button>
            </div>
          </>
        )}
        <span className="image-disclaimer">
          {visibleFitsImage
            ? "FITS DATA · WCS PROJECTION NOT APPLIED"
            : "REFERENCE IMAGE · NO CALIBRATED WCS"}
        </span>
      </div>
    );
  }

  const regionSelect = (
    <select
      aria-label="Selected astronomical region"
      value={region.startsWith("Custom") ? "custom" : region}
      onChange={(e) => {
        setRegion(e.target.value);
        setRa(
          e.target.value.includes("Andromeda")
            ? "10.6847"
            : e.target.value.includes("Pleiades")
              ? "56.7500"
              : "83.8221",
        );
        setDec(
          e.target.value.includes("Andromeda")
            ? "41.2690"
            : e.target.value.includes("Pleiades")
              ? "24.1167"
              : "-5.3911",
        );
        notify("Region context updated. Map uses illustrative Orion reference imagery.");
      }}
    >
      <option>Orion Nebula (M42)</option>
      <option>Andromeda Galaxy (M31)</option>
      <option>Pleiades Cluster (M45)</option>
      {region.startsWith("Custom") && <option value="custom">{region}</option>}
    </select>
  );
  const regionDetails = (
    <Panel
      className="region-panel"
      title="Selected region"
      action={<span className="tiny-label">REGION 01</span>}
    >
      <div className="region-content">
        <div className="region-title">
          <span className="region-symbol">
            <Icon name="sky" size={24} />
          </span>
          <div>
            <h3>{region}</h3>
            <p>
              {region.includes("Orion")
                ? "Emission nebula · Orion constellation"
                : "Illustrative sky region"}
            </p>
          </div>
        </div>
        <div className="data-label">CENTER COORDINATES</div>
        <div className="coordinate-pair">
          <div>
            <span>Right ascension</span>
            <strong>
              {Number(ra).toFixed(4)}
              <small>°</small>
            </strong>
          </div>
          <div>
            <span>Declination</span>
            <strong>
              {Number(dec).toFixed(4)}
              <small>°</small>
            </strong>
          </div>
        </div>
        <div className="detail-rows">
          <div>
            <span>Angular size</span>
            <b>
              {radius}° × {radius}°
            </b>
          </div>
          <div>
            <span>Available observations</span>
            <b>
              3 <span className="muted">epochs</span>
            </b>
          </div>
          <div>
            <span>Spectral bands</span>
            <b>
              102 <span className="muted">bands</span>
            </b>
          </div>
          <div>
            <span>Wavelength range</span>
            <b>
              Wavelength range <span className="muted">requires calibration metadata</span>
            </b>
          </div>
        </div>
        <div className="coverage-heading">
          <span>Observation coverage</span>
          <strong>
            99.8<span>%</span>
          </strong>
        </div>
        <div className="progress-track">
          <span style={{ width: "99.8%" }} />
        </div>
        <p className="coverage-note">
          <span className="live-dot" />
          High-quality coverage across all bands
        </p>
        <div className="region-actions">
          <Button primary icon="time" onClick={() => navigate(1, 1)}>
            Compare observations
            <Icon name="arrow" size={15} />
          </Button>
          <Button icon="spectrum" onClick={() => navigate(2)}>
            Explore spectral data
            <Icon name="arrow" size={15} />
          </Button>
        </div>
      </div>
    </Panel>
  );

  function ObservationTable() {
    return (
      <Panel
        className="observations-panel"
        title={
          <>
            <Icon name="layers" size={17} /> Available observations{" "}
            <span className="count-pill">3</span>
          </>
        }
        action={
          <button className="text-link" onClick={() => navigate(1)}>
            Open Temporal Vision <Icon name="arrow" size={14} />
          </button>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>OBSERVATION ID</th>
                <th>
                  OBSERVATION DATE <span>↓</span>
                </th>
                <th>SPECTRAL BANDS</th>
                <th>COVERAGE</th>
                <th>DATA QUALITY</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {observations.map((o, i) => (
                <tr
                  key={o.id}
                  onClick={() => {
                    setObservation(i);
                    navigate(0, 4);
                  }}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setObservation(i);
                      navigate(0, 4);
                    }
                  }}
                >
                  <td>
                    <div
                      className={`observation-thumb thumb-${i}`}
                      style={{ backgroundImage: `url(${skyImage})` }}
                    />
                    <span className="mono">{o.id}</span>
                    {o.tag && <span className="latest-tag">{o.tag}</span>}
                  </td>
                  <td>
                    {o.date}
                    <small>{o.time}</small>
                  </td>
                  <td>
                    <span className="mono">{o.band}</span> <span className="muted">bands</span>
                  </td>
                  <td>
                    <span className="mini-progress">
                      <i style={{ width: o.coverage }} />
                    </span>
                    <span className="mono">{o.coverage}</span>
                  </td>
                  <td>
                    <Badge color={o.quality === "Excellent" ? "green" : "blue"}>{o.quality}</Badge>
                  </td>
                  <td>
                    <button className="icon-button" aria-label={`View observation ${o.id}`}>
                      <Icon name="chevron" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  }
  function CandidateTable({ catalog = false }: { catalog?: boolean }) {
    const visible = candidates
      .filter(
        (c) =>
          (catalog ? saved.includes(c.id) : moduleIndex !== 3 || resultIds.includes(c.id)) &&
          (filter === "All statuses" || c.status === filter) &&
          (category === "All categories" || c.type === category),
      )
      .sort((a, b) =>
        sort === "Confidence" ? b.confidence - a.confidence : a.id.localeCompare(b.id),
      );
    const page = Math.min(candidatePage, Math.max(1, Math.ceil(visible.length / pageSize)));
    return (
      <Panel
        className="candidate-table-panel"
        title={
          <>
            {catalog ? "Discovery candidates" : "Detected candidates"}{" "}
            <span className="count-pill">{visible.length}</span>
          </>
        }
        action={
          <div className="table-actions">
            <select
              aria-label="Filter candidate category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setCandidatePage(1);
              }}
            >
              <option>All categories</option>
              {[...new Set(candidates.map((c) => c.type))].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <select
              aria-label="Filter review status"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setCandidatePage(1);
              }}
            >
              {["All statuses", "Pending review", "Validated", "Needs review", "Discarded"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
            <select
              aria-label="Sort candidates"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setCandidatePage(1);
              }}
            >
              <option>Confidence</option>
              <option>Identifier</option>
            </select>
          </div>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>CANDIDATE ID</th>
                <th>RA / DEC (J2000)</th>
                <th>DISPLACEMENT</th>
                <th>CONFIDENCE</th>
                <th>REVIEW STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.slice((page - 1) * pageSize, page * pageSize).map((c) => (
                <tr
                  key={c.id}
                  onClick={() => {
                    setSelectedCandidate(c.id);
                    navigate(catalog ? 4 : 3, catalog ? 2 : 4);
                  }}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setSelectedCandidate(c.id);
                      navigate(catalog ? 4 : 3, catalog ? 2 : 4);
                    }
                  }}
                >
                  <td>
                    <span className="candidate-dot" />
                    <span className="mono strong">{c.id}</span>
                    <small className="candidate-type">{c.type}</small>
                  </td>
                  <td className="mono">
                    {c.ra}
                    <small>{c.dec}</small>
                  </td>
                  <td className="mono">
                    {c.motion} <span className="muted">arcsec</span>
                  </td>
                  <td>
                    <span className="confidence-bar">
                      <i style={{ width: `${c.confidence}%` }} />
                    </span>
                    <span className="mono">{c.confidence}%</span>
                  </td>
                  <td>
                    <Badge
                      color={
                        c.status === "Validated"
                          ? "green"
                          : c.status === "Discarded"
                            ? "gray"
                            : "yellow"
                      }
                    >
                      {c.status}
                    </Badge>
                  </td>
                  <td>
                    <Icon name="chevron" size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && (
            <div className="empty-state">
              <Icon name="catalog" size={28} />
              <h3>No candidates in this view</h3>
              <p>Adjust the filter or save a candidate from Object Detection.</p>
              <Button
                onClick={() => {
                  setFilter("All statuses");
                  setCategory("All categories");
                  setCandidatePage(1);
                  navigate(3, 3);
                }}
              >
                Explore detections
              </Button>
            </div>
          )}
        </div>
        <Pagination
          total={visible.length}
          page={page}
          size={pageSize}
          onPage={setCandidatePage}
          onSize={(size) => {
            setPageSize(size);
            setCandidatePage(1);
          }}
        />
      </Panel>
    );
  }
  function Comparison({ mode = tab }: { mode?: number }) {
    return (
      <Panel
        className="comparison-panel"
        title={
          <>
            <Icon name="time" size={17} />{" "}
            {mode === 2
              ? "Swipe comparison"
              : mode === 3
                ? "Blink comparison"
                : mode === 4
                  ? "Difference imaging"
                  : "Observation comparison"}
          </>
        }
        action={
          <span className="sync-label">
            <Icon name="layers" size={14} /> Synchronized coordinates
          </span>
        }
      >
        <div className="comparison-controls">
          <label>
            <span className="epoch-label a">A</span>
            <select
              aria-label="Observation A"
              value={dateA}
              onChange={(e) => setDateA(e.target.value)}
            >
              {observations.map((o, i) => (
                <option key={o.id} value={i}>
                  {o.date}
                </option>
              ))}
            </select>
          </label>
          <span className="time-delta">
            {Math.abs(
              Math.round(
                (new Date(observations[Number(dateA)].date).getTime() -
                  new Date(observations[Number(dateB)].date).getTime()) /
                  86400000,
              ),
            )}{" "}
            days between observations
          </span>
          <label>
            <span className="epoch-label b">B</span>
            <select
              aria-label="Observation B"
              value={dateB}
              onChange={(e) => setDateB(e.target.value)}
            >
              {observations.map((o, i) => (
                <option key={o.id} value={i}>
                  {o.date}
                </option>
              ))}
            </select>
          </label>
        </div>
        {mode === 2 ? (
          <div className="swipe-view">
            <SkyMap small epoch selection={false} />
            <div className="swipe-overlay" style={{ clipPath: `inset(0 ${100 - swipe}% 0 0)` }}>
              <SkyMap small selection={false} />
            </div>
            <div className="swipe-divider" style={{ left: `${swipe}%` }}>
              <span>‹ ›</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={swipe}
              onChange={(e) => setSwipe(Number(e.target.value))}
              aria-label="Reveal observation A or B"
            />
            <span className="swipe-date a">A · {observations[Number(dateA)].date}</span>
            <span className="swipe-date b">B · {observations[Number(dateB)].date}</span>
          </div>
        ) : mode === 3 ? (
          <div className="blink-view">
            <SkyMap small epoch={blink} selection={false} />
            <span className="blink-date">
              <span className={`epoch-label ${blink ? "b" : "a"}`}>{blink ? "B" : "A"}</span>
              {observations[Number(blink ? dateB : dateA)].date}
            </span>
          </div>
        ) : mode === 4 ? (
          <SkyMap difference selection={false} />
        ) : (
          <div className="side-by-side">
            <div>
              <SkyMap small epoch={dateA === "0"} selection={false} />
              <span className="image-epoch">A · {observations[Number(dateA)].date}</span>
            </div>
            <div>
              <SkyMap small epoch={dateB === "0"} selection={false} />
              <span className="image-epoch">B · {observations[Number(dateB)].date}</span>
            </div>
          </div>
        )}
        <div className="playback-bar">
          <div>
            <Button
              icon={playing ? "pause" : "play"}
              onClick={() => {
                if (mode !== 3) setTab(3);
                setPlaying(!playing);
              }}
            >
              {playing ? "Pause" : "Play blink"}
            </Button>
            <select
              aria-label="Playback interval"
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
            >
              <option value="1200">Slow · 1.2s</option>
              <option value="700">Normal · 0.7s</option>
              <option value="300">Fast · 0.3s</option>
            </select>
          </div>
          <div>
            <button
              className="icon-button"
              title="Zoom out synchronized images"
              onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
            >
              <Icon name="minus" size={16} />
            </button>
            <span className="mono">{zoom.toFixed(2)}×</span>
            <button
              className="icon-button"
              title="Zoom in synchronized images"
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            >
              <Icon name="plus" size={16} />
            </button>
            <span className="muted">Synchronized zoom</span>
          </div>
        </div>
      </Panel>
    );
  }
  function Report({ object = false }: { object?: boolean }) {
    return (
      <div className="report-layout">
        <Panel
          className="report-main"
          title={
            <>
              <Icon name="catalog" size={18} />{" "}
              {object ? "Candidate scientific report" : currentModule.name + " report"}
            </>
          }
          action={<Badge color="violet">Simulated analysis</Badge>}
        >
          <div className="report-intro">
            <span className="eyebrow">SPHEREX — PLANET X / RESEARCH WORKSPACE</span>
            <h2>{object ? candidate.id : region}</h2>
            <p>
              {object
                ? "Candidate evidence, observation history and validation summary."
                : "A reproducible overview of the selected region and illustrative analysis."}
            </p>
          </div>
          <div className="report-facts">
            <div>
              <span>REGION</span>
              <strong>{region}</strong>
            </div>
            <div>
              <span>DATE RANGE</span>
              <strong>Mar 18 – Sep 18, 2025</strong>
            </div>
            <div>
              <span>DATA RELEASE</span>
              <strong>Illustrative dataset v1.0</strong>
            </div>
            <div>
              <span>COORDINATES</span>
              <strong className="mono">
                {ra}° / {dec}°
              </strong>
            </div>
          </div>
          <div className="report-section">
            <h3>{moduleIndex === 2 ? "Spectral response" : "Temporal displacement"}</h3>
            <p>
              {moduleIndex === 2
                ? "Calibrated spectrum unavailable; no wavelength/flux samples loaded."
                : "Illustrative displacement (arcsec) over the observation interval."}
            </p>
            <Chart spectral={moduleIndex === 2} />
          </div>
          <div className="report-section">
            <h3>Analysis summary</h3>
            <div className="detail-rows">
              <div>
                <span>Sources processed</span>
                <b>1,284</b>
              </div>
              <div>
                <span>Candidate sources</span>
                <b>{candidates.length}</b>
              </div>
              <div>
                <span>Detection threshold</span>
                <b>{threshold}%</b>
              </div>
              <div>
                <span>Algorithm sensitivity</span>
                <b>{sensitivity}</b>
              </div>
              <div>
                <span>Validation status</span>
                <Badge color="yellow">{object ? candidate.status : "Human review required"}</Badge>
              </div>
            </div>
          </div>
          <div className="report-disclaimer">
            <Icon name="info" size={18} />
            <p>
              Demonstration only. All observation dates, spectra, detections and trajectories are
              simulated. Reference imagery is optical photography, not calibrated SPHEREx data. This
              report is not scientific evidence.
            </p>
          </div>
        </Panel>
        <div className="right-stack">
          <Panel title="Export & provenance">
            <div className="panel-body">
              <p className="muted">
                Download a text report containing the current region, analysis parameters and
                candidate records.
              </p>
              <Button primary icon="download" onClick={exportReport}>
                Export demo report
              </Button>
              <div className="divider" />
              <div className="data-label">IMAGE CREDIT</div>
              <p>Samuel PASTEUR-FOSSE</p>
              <a
                href="https://unsplash.com/@sam_astro"
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                Photography on Unsplash <Icon name="external" size={13} />
              </a>
              <div className="data-label mt">TRACEABILITY</div>
              <p className="mono muted small-text">
                Demo pipeline v1.0
                <br />
                Reference frame: ICRS / J2000
                <br />
                Photometric calibration: simulated
              </p>
            </div>
          </Panel>
          <Button icon="arrow" onClick={() => navigate(moduleIndex === 4 ? 0 : moduleIndex + 1)}>
            Continue to {moduleIndex === 4 ? "Sky Explorer" : modules[moduleIndex + 1].name}
          </Button>
        </div>
      </div>
    );
  }

  function renderSky() {
    if (tab === 2)
      return (
        <div className="workspace-grid">
          <Panel title="Find your place in the sky" className="search-panel">
            <form onSubmit={searchCoordinates} className="panel-body">
              <div className="form-intro">
                <span className="form-icon">
                  <Icon name="cross" size={26} />
                </span>
                <h2>Coordinate search</h2>
                <p>Define a sky position in the ICRS / J2000 reference frame.</p>
              </div>
              <label className="field-label">
                Object name
                <select
                  value={region.startsWith("Custom") ? "custom" : region}
                  onChange={(e) => {
                    const name = e.target.value;
                    setRegion(name);
                    setRa(
                      name.includes("Andromeda")
                        ? "10.6847"
                        : name.includes("Pleiades")
                          ? "56.7500"
                          : "83.8221",
                    );
                    setDec(
                      name.includes("Andromeda")
                        ? "41.2690"
                        : name.includes("Pleiades")
                          ? "24.1167"
                          : "-5.3911",
                    );
                  }}
                >
                  <option>Orion Nebula (M42)</option>
                  <option>Andromeda Galaxy (M31)</option>
                  <option>Pleiades Cluster (M45)</option>
                  {region.startsWith("Custom") && <option value="custom">{region}</option>}
                </select>
              </label>
              <div className="form-row">
                <label className="field-label">
                  Right ascension (°)
                  <input
                    type="number"
                    step="any"
                    required
                    min="0"
                    max="359.999999"
                    value={ra}
                    onChange={(e) => setRa(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Declination (°)
                  <input
                    type="number"
                    step="any"
                    required
                    min="-90"
                    max="90"
                    value={dec}
                    onChange={(e) => setDec(e.target.value)}
                  />
                </label>
              </div>
              <label className="field-label">
                Search radius (degrees)
                <input
                  type="number"
                  step=".1"
                  min=".1"
                  max="5"
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  required
                />
              </label>
              <button className="button primary" type="submit">
                <Icon name="search" size={16} />
                Search region
                <Icon name="arrow" size={15} />
              </button>
              <p className="field-hint">
                Demo positions update the region context. Imagery remains an illustrative Orion
                reference field.
              </p>
            </form>
          </Panel>
          <div className="right-stack">
            <SkyMap small />
            {regionDetails}
          </div>
        </div>
      );
    if (tab === 4) {
      const o = observations[observation];
      return (
        <>
          <div className="workspace-grid">
            <Panel
              title="Observation preview"
              action={
                <select
                  aria-label="Select observation"
                  value={observation}
                  onChange={(e) => setObservation(Number(e.target.value))}
                >
                  {observations.map((obs, i) => (
                    <option key={obs.id} value={i}>
                      {obs.date}
                    </option>
                  ))}
                </select>
              }
            >
              <SkyMap />
            </Panel>
            <Panel title="Observation metadata">
              <div className="panel-body">
                <Badge color="violet">Illustrative observation</Badge>
                <h3 className="mono mt">{o.id}</h3>
                <div className="detail-rows spaced">
                  <div>
                    <span>Observation date</span>
                    <b>{o.date}</b>
                  </div>
                  <div>
                    <span>Acquisition time</span>
                    <b>{o.time}</b>
                  </div>
                  <div>
                    <span>RA / DEC</span>
                    <b>
                      {ra}° / {dec}°
                    </b>
                  </div>
                  <div>
                    <span>Coordinate input frame</span>
                    <b>ICRS / J2000 · field center only</b>
                  </div>
                  <div>
                    <span>Spectral bands</span>
                    <b>102</b>
                  </div>
                  <div>
                    <span>Data quality</span>
                    <Badge>{o.quality}</Badge>
                  </div>
                  <div>
                    <span>Sky coverage</span>
                    <b>{o.coverage}</b>
                  </div>
                  <div>
                    <span>Wavelength</span>
                    <b>Calibration metadata unavailable</b>
                  </div>
                </div>
                <Button
                  primary
                  icon="time"
                  onClick={() => {
                    setDateB(String(observation));
                    navigate(1, 1);
                  }}
                >
                  Compare this observation
                </Button>
              </div>
            </Panel>
          </div>
          <ObservationTable />
        </>
      );
    }
    if (tab === 5)
      return (
        <>
          <div className="info-banner">
            <Icon name="info" size={17} /> 1,284 simulated sources in this region. Showing 5
            illustrative objects of interest.
            <Button icon="target" onClick={() => navigate(3, 1)}>
              Run detection
            </Button>
          </div>
          <CandidateTable />
          <div className="workspace-grid">
            <SkyMap small />
            {regionDetails}
          </div>
        </>
      );
    return (
      <>
        <div className="workspace-grid">
          <Panel
            className="map-panel"
            title={
              <>
                <Icon name="sky" size={17} />
                {tab === 3 ? "Region selection" : "Interactive sky map"}
              </>
            }
            action={
              <div className="map-panel-actions">
                <span className="map-live">
                  <span className="live-dot" />
                  {tab === 3 ? "REGION SELECTED" : "SKY VIEW"}
                </span>
                <button
                  className={`icon-button ${grid ? "selected" : ""}`}
                  title="Toggle coordinate grid"
                  onClick={() => setGrid(!grid)}
                >
                  <Icon name="grid" size={15} />
                </button>
                <button
                  className="icon-button"
                  title="Open map fullscreen"
                  onClick={() => setExpanded(true)}
                >
                  <Icon name="expand" size={15} />
                </button>
                <button
                  className={`view-toggle ${celestialView ? "active" : ""}`}
                  title="Toggle celestial sphere"
                  onClick={() => setCelestialView(!celestialView)}
                >
                  <Icon name="globe" size={14} />
                  {celestialView ? "Sphere" : "Image"}
                </button>
              </div>
            }
          >
            <div className="map-region-bar">
              <div>
                <span className="muted">
                  <Icon name="search" size={15} />
                </span>
                {regionSelect}
              </div>
              <button className="text-link" onClick={() => setTab(2)}>
                Search coordinates
                <Icon name="cross" size={14} />
              </button>
            </div>
            <SkyMap />
            <div className="map-footer">
              <span>
                <span className="legend-dot cyan" />
                Selected region
              </span>
              <span>
                <span className="legend-dot purple" />
                Detected source
              </span>
              <span className="map-footer-right">
                <Icon name="info" size={13} />
                Reference center · WCS unavailable
              </span>
            </div>
          </Panel>
          {regionDetails}
        </div>
        {tab === 3 && (
          <Panel title="Selection geometry">
            <div className="selection-settings">
              <label className="field-label">
                Selection shape
                <select
                  value={circleSelection ? "Circle" : "Rectangle"}
                  onChange={(e) => setCircleSelection(e.target.value === "Circle")}
                >
                  <option>Rectangle</option>
                  <option>Circle</option>
                </select>
              </label>
              <label className="field-label">
                Angular size (°)
                <input
                  type="number"
                  min=".1"
                  max="5"
                  step=".1"
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                />
              </label>
              <div>
                <span className="muted">3 available observations</span>
                <Button primary icon="arrow" onClick={() => setTab(4)}>
                  Explore selected region
                </Button>
              </div>
            </div>
          </Panel>
        )}
        <ObservationTable />
      </>
    );
  }
  function TemporalUniverse() {
    const tracks = [
      {
        name: "Moving candidate · PX-2025-0042",
        color: "#b1a2ff",
        points: [
          { x: 24, y: 62 },
          { x: 31, y: 54 },
          { x: 40, y: 47 },
        ],
      },
      {
        name: "Variable source · demo",
        color: "#64d7e5",
        points: [
          { x: 68, y: 28 },
          { x: 68, y: 28 },
          { x: 68, y: 28 },
        ],
      },
      {
        name: "Transient source · demo",
        color: "#8ddeaa",
        points: [
          { x: 19, y: 24 },
          { x: 24, y: 28 },
          { x: 29, y: 33 },
        ],
      },
    ];
    const timePosition = observations.length - 1 - Number(dateB);
    const project = (point: { x: number; y: number }, epoch: number) => ({
      x: 135 + point.x * 4.1 + epoch * 66,
      y: 51 + point.y * 1.28 + epoch * 37,
    });
    const plane = (epoch: number) => {
      const points = [
        project({ x: 0, y: 0 }, epoch),
        project({ x: 100, y: 0 }, epoch),
        project({ x: 100, y: 100 }, epoch),
        project({ x: 0, y: 100 }, epoch),
      ];
      return points.map((point) => `${point.x},${point.y}`).join(" ");
    };
    const selectedTrack = tracks[selectedTemporalTrack];

    return (
      <Panel
        className="temporal-universe-panel"
        title={
          <>
            <Icon name="time" size={17} /> Temporal universe · 3D time view
          </>
        }
        action={<Badge color="violet">Z = time · not distance</Badge>}
      >
        <div className="temporal-scene-wrap">
          <svg
            className="temporal-scene"
            viewBox="0 0 820 310"
            role="img"
            aria-label="Three-dimensional sky-position chart with observation time as the depth axis"
          >
            {[0, 1, 2].map((epoch) => (
              <g key={epoch}>
                <polygon
                  points={plane(epoch)}
                  fill={epoch === timePosition ? "#766bc51c" : "#101a2b50"}
                  stroke={epoch === timePosition ? "#aaa0f6a0" : "#66758d50"}
                  strokeWidth={epoch === timePosition ? 1.5 : 1}
                />
                {[1, 2, 3, 4].map((step) => (
                  <g key={step}>
                    <line
                      x1={135 + step * 82 + epoch * 66}
                      y1={51 + epoch * 37}
                      x2={135 + step * 82 + epoch * 66}
                      y2={179 + epoch * 37}
                    />
                    <line
                      x1={135 + epoch * 66}
                      y1={51 + step * 32 + epoch * 37}
                      x2={545 + epoch * 66}
                      y2={51 + step * 32 + epoch * 37}
                    />
                  </g>
                ))}
                <text x={110 + epoch * 66} y={45 + epoch * 37} textAnchor="end">
                  {observations[2 - epoch].date}
                </text>
              </g>
            ))}
            <line className="temporal-axis" x1="135" y1="51" x2="545" y2="51" />
            <line className="temporal-axis" x1="135" y1="51" x2="135" y2="179" />
            <line className="temporal-axis temporal-time-axis" x1="135" y1="51" x2="267" y2="125" />
            <text className="temporal-axis-label" x="540" y="214">
              X · position in sky
            </text>
            <text className="temporal-axis-label" x="100" y="196">
              Y · position in sky
            </text>
            <text className="temporal-axis-label" x="58" y="90">
              Z · observation time
            </text>
            {tracks.map((track, trackIndex) => {
              const points = track.points.map((point, epoch) => project(point, epoch));
              return (
                <g
                  key={track.name}
                  className={
                    selectedTemporalTrack === trackIndex
                      ? "temporal-track selected"
                      : "temporal-track"
                  }
                  style={{ color: track.color }}
                >
                  <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} />
                  {points.map((point, epoch) => (
                    <circle
                      key={epoch}
                      cx={point.x}
                      cy={point.y}
                      r={epoch === timePosition ? 6 : 4}
                    >
                      <title>
                        {track.name} · {observations[2 - epoch].date}
                      </title>
                    </circle>
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="temporal-track-list" aria-label="Select an illustrative source trajectory">
          {tracks.map((track, index) => (
            <button
              key={track.name}
              className={selectedTemporalTrack === index ? "active" : ""}
              onClick={() => setSelectedTemporalTrack(index)}
            >
              <i style={{ backgroundColor: track.color }} />
              {track.name}
            </button>
          ))}
        </div>
        <div className="temporal-scrubber">
          <Button icon={playing ? "pause" : "play"} onClick={() => setPlaying((value) => !value)}>
            {playing ? "Pause time" : "Play time"}
          </Button>
          <div className="temporal-scrubber-control">
            <input
              type="range"
              min="0"
              max={observations.length - 1}
              step="1"
              value={timePosition}
              aria-label="Observation epoch on the temporal axis"
              onChange={(event) =>
                setDateB(String(observations.length - 1 - Number(event.target.value)))
              }
            />
            <div className="temporal-scrubber-labels">
              <span>{observations[2].date}</span>
              <strong>Observation B · {observations[Number(dateB)].date}</strong>
              <span>{observations[0].date}</span>
            </div>
          </div>
        </div>
        <div className="temporal-selection">
          <span>
            <i style={{ backgroundColor: selectedTrack.color }} />
            {selectedTrack.name}
          </span>
          <span className="mono">
            Field center · RA {ra}° · DEC {dec}°
          </span>
          <Badge color="blue">Illustrative trajectory</Badge>
        </div>
        <p className="temporal-integrity">
          <Icon name="info" size={13} /> Positions and trajectories are illustrative. Depth encodes
          observation time only; it does not represent astronomical distance.
        </p>
      </Panel>
    );
  }
  function renderTemporal() {
    if (tab === 5) return <Report />;
    return (
      <>
        <div className="context-bar">
          <div>
            <Icon name="sky" size={17} />
            {regionSelect}
          </div>
          <div className="context-meta">
            <span className="live-dot" />3 epochs available
            <span className="mono">
              RA {ra}° · DEC {dec}°
            </span>
          </div>
        </div>
        <TemporalUniverse />
        <Comparison mode={tab === 0 ? 1 : tab} />
        <Panel
          title="Observation timeline"
          action={<span className="muted small-text">Select an epoch to set observation B</span>}
        >
          <div className="timeline">
            {[...observations].reverse().map((o, index) => (
              <button
                key={o.id}
                className={`timeline-item ${Number(dateB) === 2 - index ? "active" : ""}`}
                onClick={() => setDateB(String(2 - index))}
              >
                <span className="timeline-point" />
                <span className="timeline-date">{o.date}</span>
                <span className="mono muted">{o.id}</span>
                <Badge color="blue">102 bands</Badge>
              </button>
            ))}
          </div>
        </Panel>
        {tab === 4 && <CandidateTable />}
        <div className="workflow-next">
          <span>
            <Icon name="info" size={16} />
            Apparent motion is simulated for demonstration.
          </span>
          <Button primary onClick={() => navigate(3, 1)} icon="target">
            Analyze this region
            <Icon name="arrow" size={15} />
          </Button>
        </div>
      </>
    );
  }
  function SpectralCube() {
    const bandFraction = (band - 1) / 101;
    const bandX = 120 + bandFraction * 360;
    const bandY = 218 + bandFraction * 76;
    const planeWidth = { x: 130, y: -64 };
    const intensityHeight = 126;
    const spatialSlots = Array.from({ length: 5 }, (_, index) => index);
    const bandTicks = Array.from({ length: 102 }, (_, index) => {
      const fraction = index / 101;
      return {
        x: 120 + fraction * 360,
        y: 218 + fraction * 76,
        index: index + 1,
      };
    });

    return (
      <Panel
        className="spectral-cube-panel"
        title={
          <>
            <Icon name="spectrum" size={17} /> Spectral cube · discrete sample grid
          </>
        }
        action={<Badge color="violet">Schematic · no mission data loaded</Badge>}
      >
        <div className="spectral-cube-layout">
          <div
            className="spectral-cube-scene"
            onPointerDown={(event) => {
              cubeDragStart.current = { x: event.clientX, y: event.clientY };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!cubeDragStart.current) return;
              const deltaX = event.clientX - cubeDragStart.current.x;
              const deltaY = event.clientY - cubeDragStart.current.y;
              cubeDragStart.current = { x: event.clientX, y: event.clientY };
              setCubeRotation((rotation) => ({
                x: Math.max(-35, Math.min(20, rotation.x + deltaY * 0.3)),
                y: Math.max(-45, Math.min(45, rotation.y + deltaX * 0.3)),
              }));
            }}
            onPointerUp={() => {
              cubeDragStart.current = null;
            }}
            onPointerCancel={() => {
              cubeDragStart.current = null;
            }}
          >
            <svg
              className="spectral-cube-graphic"
              viewBox="0 0 720 360"
              style={{
                transform: `perspective(950px) rotateX(${cubeRotation.x}deg) rotateY(${cubeRotation.y}deg)`,
              }}
              role="img"
              aria-label={`Discrete spectral cube coordinate grid at band ${band}; intensity measurements are not loaded`}
            >
              <polygon className="cube-plane back" points="120,218 480,294 610,230 250,154" />
              <polygon className="cube-plane side" points="480,294 610,230 610,104 480,168" />
              <polygon className="cube-plane top" points="120,218 250,154 610,104 480,168" />
              {bandTicks.map((tick) => {
                const endX = tick.x + planeWidth.x;
                const endY = tick.y + planeWidth.y;
                const selected = Math.abs(tick.index - band) < 1;
                return (
                  <g
                    key={tick.index}
                    className={selected ? "cube-band-slice active" : "cube-band-slice"}
                  >
                    <line x1={tick.x} y1={tick.y} x2={endX} y2={endY} />
                    {selected && (
                      <>
                        <line x1={tick.x} y1={tick.y} x2={tick.x} y2={tick.y - intensityHeight} />
                        <line x1={endX} y1={endY} x2={endX} y2={endY - intensityHeight} />
                        <line
                          x1={tick.x}
                          y1={tick.y - intensityHeight}
                          x2={endX}
                          y2={endY - intensityHeight}
                        />
                      </>
                    )}
                  </g>
                );
              })}
              {spatialSlots.map((x) =>
                spatialSlots.map((y) => {
                  const xPosition = bandX + (x / 4) * planeWidth.x;
                  const yPosition = bandY + (x / 4) * planeWidth.y;
                  const position = {
                    x: xPosition + (y / 4) * 28,
                    y: yPosition - (y / 4) * 14,
                  };
                  const selected = cubePosition.x === x && cubePosition.y === y;
                  return (
                    <circle
                      key={`${x}-${y}`}
                      className={selected ? "cube-sample selected" : "cube-sample"}
                      cx={position.x}
                      cy={position.y}
                      r={selected ? 5 : 2.5}
                    />
                  );
                }),
              )}
              <line className="cube-axis" x1="120" y1="218" x2="480" y2="294" />
              <line className="cube-axis" x1="120" y1="218" x2="250" y2="154" />
              <line className="cube-axis cube-intensity-axis" x1="120" y1="218" x2="120" y2="88" />
              <text className="cube-axis-label" x="420" y="326">
                X · band index · ordinal, not wavelength-scaled
              </text>
              <text className="cube-axis-label" x="256" y="148">
                Y · position in region
              </text>
              <text className="cube-axis-label" x="34" y="92">
                Z · intensity
              </text>
              <text className="cube-axis-note" x="34" y="108">
                values not loaded
              </text>
              <text className="cube-band-label" x="112" y="245">
                B01
              </text>
              <text className="cube-band-label" x="468" y="320">
                B102
              </text>
              <text
                className="cube-current-label"
                x={Math.min(510, bandX + 6)}
                y={Math.max(76, bandY - 112)}
              >
                BAND {String(band).padStart(3, "0")} · CALIBRATION UNAVAILABLE
              </text>
            </svg>
            <span className="cube-drag-hint">
              <Icon name="move" size={13} /> Drag to rotate
            </span>
          </div>
          <div className="cube-inspector">
            <span className="data-label">SELECTED SAMPLE POSITION</span>
            <strong>
              Pixel {String.fromCharCode(65 + cubePosition.y)}
              {cubePosition.x + 1}
            </strong>
            <span className="mono">
              Band {String(band).padStart(3, "0")} · wavelength unavailable
            </span>
            <div
              className="cube-pixel-grid"
              role="group"
              aria-label="Select spatial sample position"
            >
              {spatialSlots.flatMap((y) =>
                spatialSlots.map((x) => (
                  <button
                    key={`${x}-${y}`}
                    className={cubePosition.x === x && cubePosition.y === y ? "active" : ""}
                    aria-label={`Select sample position ${String.fromCharCode(65 + y)}${x + 1}`}
                    aria-pressed={cubePosition.x === x && cubePosition.y === y}
                    onClick={() => setCubePosition({ x, y })}
                  />
                )),
              )}
            </div>
            <div className="cube-value-placeholder">
              <Icon name="info" size={15} />
              <span>
                Intensity unavailable
                <br />
                <small>No calibrated cube is connected.</small>
              </span>
            </div>
            <label className="field-label cube-compare-select">
              Compare with
              <select
                value={comparisonBand}
                onChange={(event) => setComparisonBand(Number(event.target.value))}
              >
                {Array.from({ length: 102 }, (_, index) => (
                  <option key={index} value={index + 1}>
                    Band {String(index + 1).padStart(3, "0")}
                  </option>
                ))}
              </select>
            </label>
            <Button icon="layers" onClick={() => setTab(2)}>
              Compare bands
            </Button>
          </div>
        </div>
        <p className="cube-integrity">
          <Icon name="info" size={13} /> This is a coordinate-grid schematic, not a measured cube.
          It shows discrete band and spatial sample locations only; no continuous surface or
          synthetic intensity values are drawn.
        </p>
      </Panel>
    );
  }
  function SpectralEvolutionSurface() {
    return (
      <Panel
        title={
          <>
            <Icon name="spectrum" size={17} /> Spectral evolution · time vs channel
          </>
        }
        action={
          <label className="surface-epoch-select">
            Observation epoch
            <select
              aria-label="Spectral surface observation epoch"
              value={observation}
              onChange={(event) => setObservation(Number(event.target.value))}
            >
              {observations.map((item, index) => (
                <option key={item.id} value={index}>
                  {item.date}
                </option>
              ))}
            </select>
          </label>
        }
      >
        <div className="spectral-surface-empty">
          <svg
            viewBox="0 0 640 230"
            role="img"
            aria-label="Empty spectral-time coordinate grid; intensity surface unavailable without calibrated measurements"
          >
            <path d="M92 166 383 205 528 133 238 95Z" />
            <path d="M92 166V51M92 166 383 205M92 166 238 95" />
            {[0, 1, 2, 3].map((step) => (
              <path
                key={step}
                d={`M${92 + step * 36} ${148 - step * 18}l291 39M${92 + step * 73} ${166 + step * 10}l146 -72`}
              />
            ))}
            <text x="390" y="215">
              X · band index
            </text>
            <text x="242" y="88">
              Y · observation date
            </text>
            <text x="24" y="52">
              Z · intensity
            </text>
            <text className="surface-empty-label" x="195" y="146">
              No calibrated intensity samples
            </text>
          </svg>
          <div>
            <strong>Surface not available yet</strong>
            <p>
              A measured surface requires calibrated wavelength centers, intensity and uncertainty
              for each channel and observation. Missing samples will remain gaps; no interpolation
              is shown.
            </p>
            <span>Spatial intensity heatmap / volume is unavailable for the same reason.</span>
          </div>
        </div>
      </Panel>
    );
  }
  function renderSpectral() {
    if (tab === 5) return <Report />;
    return (
      <>
        <div className="context-bar">
          <div>
            <Icon name="sky" size={17} />
            {regionSelect}
          </div>
          <span className="mono muted">102 BANDS · WAVELENGTH CALIBRATION UNAVAILABLE</span>
        </div>
        <div className="spectral-readout" aria-label="Spectral overview">
          <div className="spectral-readout-main">
            <span className="data-label">SELECTED CHANNEL</span>
            <strong>
              Band {String(band).padStart(3, "0")}
              <small> / 102</small>
            </strong>
            <div className="spectrum-ribbon">
              <i />
              <i />
              <i />
              <i />
              <i />
              <b style={{ left: `${((band - 1) / 101) * 100}%` }} />
            </div>
          </div>
          <div>
            <span className="data-label">WAVELENGTH</span>
            <strong>Not calibrated</strong>
            <small>Instrument metadata not connected</small>
          </div>
          <div>
            <span className="data-label">SPECTRAL RESPONSE</span>
            <strong>Unavailable</strong>
            <small>No calibrated samples loaded</small>
          </div>
          <div>
            <span className="data-label">SIGNAL QUALITY</span>
            <strong className="cyan-text">Not measured</strong>
            <small>Uncertainty metadata unavailable</small>
          </div>
        </div>
        {tab !== 2 && tab !== 4 && <SpectralCube />}
        {tab !== 2 && tab !== 4 && <SpectralEvolutionSurface />}
        {tab === 2 ? (
          <Panel
            title="Multi-band comparison"
            action={
              <span className="sync-label">
                <Icon name="layers" size={14} />
                Synchronized field of view
              </span>
            }
          >
            <div className="band-comparison">
              <div>
                <div className="band-compare-select">
                  Band A
                  <select
                    aria-label="Comparison band A"
                    value={band}
                    onChange={(e) => setBand(Number(e.target.value))}
                  >
                    {Array.from({ length: 102 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        Band {String(i + 1).padStart(3, "0")}
                      </option>
                    ))}
                  </select>
                </div>
                <SkyMap small spectralBand={band} selection={false} />
              </div>
              <div>
                <div className="band-compare-select">
                  Band B
                  <select
                    aria-label="Comparison band B"
                    value={comparisonBand}
                    onChange={(e) => setComparisonBand(Number(e.target.value))}
                  >
                    {Array.from({ length: 102 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        Band {String(i + 1).padStart(3, "0")}
                      </option>
                    ))}
                  </select>
                </div>
                <SkyMap small spectralBand={comparisonBand} selection={false} />
              </div>
            </div>
          </Panel>
        ) : tab === 4 ? (
          <Panel
            title="Source spectral energy distribution"
            action={<Badge color="violet">Simulated spectrum</Badge>}
          >
            <div className="spectral-graph-body">
              <div className="graph-heading">
                <div>
                  <h2>{candidate.id}</h2>
                  <p className="muted">Measured flux / calibrated wavelength metadata required</p>
                </div>
                <select
                  aria-label="Spectral source"
                  value={selectedCandidate}
                  onChange={(e) => setSelectedCandidate(e.target.value)}
                >
                  {candidates.map((c) => (
                    <option key={c.id}>{c.id}</option>
                  ))}
                </select>
              </div>
              <Chart spectral />
              <div className="graph-caption">
                Calibrated spectrum unavailable · no wavelength/flux samples loaded
              </div>
            </div>
          </Panel>
        ) : (
          <div className="workspace-grid">
            <Panel title="Spectral image" action={<Badge color="blue">Band {band} / 102</Badge>}>
              <SkyMap spectralBand={band} />
            </Panel>
            <Panel title="Band properties">
              <div className="panel-body">
                <div className="band-orb">
                  <Icon name="spectrum" size={40} />
                </div>
                <span className="data-label">WAVELENGTH CALIBRATION</span>
                <div className="wavelength">Unavailable</div>
                <Badge color="violet">Band {band} · no calibration table</Badge>
                <div className="detail-rows spaced">
                  <div>
                    <span>Band index</span>
                    <b>{String(band).padStart(3, "0")} / 102</b>
                  </div>
                  <div>
                    <span>Spectral resolution</span>
                    <b>Calibration metadata unavailable</b>
                  </div>
                  <div>
                    <span>Image mode</span>
                    <b>Illustrative color mapping</b>
                  </div>
                  <div>
                    <span>Observation</span>
                    <b>{observations[observation].date}</b>
                  </div>
                </div>
                <Button icon="spectrum" onClick={() => setTab(4)}>
                  View spectral graph
                  <Icon name="arrow" size={15} />
                </Button>
              </div>
            </Panel>
          </div>
        )}
        <Panel
          title={tab === 1 ? "102 spectral bands" : "Explore the spectrum"}
          action={
            <span className="mono muted small-text">
              BAND {String(band).padStart(3, "0")} · calibration unavailable
            </span>
          }
        >
          <div className="spectrum-controls">
            <div className="spectrum-slider-row">
              <Button icon={playing ? "pause" : "play"} onClick={() => setPlaying(!playing)}>
                {playing ? "Pause" : "Scan"}
              </Button>
              <div className="spectral-range">
                <input
                  aria-label="Spectral band"
                  type="range"
                  min="1"
                  max="102"
                  value={band}
                  onChange={(e) => setBand(Number(e.target.value))}
                />
                <div>
                  <span>Band 1</span>
                  <span>Band index · calibration unavailable</span>
                  <span>Band 102</span>
                </div>
              </div>
              <input
                className="band-number"
                aria-label="Band number"
                type="number"
                min="1"
                max="102"
                value={band}
                onChange={(e) => setBand(Math.min(102, Math.max(1, Number(e.target.value))))}
              />
            </div>
            {(tab === 1 || tab === 0) && (
              <div className="band-grid">
                {Array.from({ length: 102 }, (_, i) => (
                  <button
                    key={i}
                    title={`Band ${String(i + 1).padStart(3, "0")} · wavelength calibration unavailable`}
                    onClick={() => setBand(i + 1)}
                    className={band === i + 1 ? "active" : ""}
                    style={
                      { "--band-color": `hsl(${220 + i * 1.2} 50% 55%)` } as React.CSSProperties
                    }
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Panel>
        {tab !== 4 && (
          <Panel
            title="Spectral response"
            action={
              <button className="text-link" onClick={() => setTab(4)}>
                Open graph
                <Icon name="arrow" size={14} />
              </button>
            }
          >
            <Chart spectral compact />
          </Panel>
        )}
      </>
    );
  }
  function SourceScatter3D() {
    const sourceCoordinates = candidates.map((item) => ({
      item,
      ra: Number.parseFloat(item.ra),
      dec: Number.parseFloat(item.dec.replace("−", "-")),
    }));
    const raValues = sourceCoordinates.map((source) => source.ra);
    const decValues = sourceCoordinates.map((source) => source.dec);
    const raMin = Math.min(...raValues);
    const raRange = Math.max(...raValues) - raMin || 1;
    const decMin = Math.min(...decValues);
    const decRange = Math.max(...decValues) - decMin || 1;

    return (
      <Panel
        title={
          <>
            <Icon name="target" size={17} /> 3D source distribution
          </>
        }
        action={<Badge color="violet">Illustrative candidates</Badge>}
      >
        <div className="source-scatter-layout">
          <svg
            className="source-scatter-plot"
            viewBox="0 0 640 300"
            role="img"
            aria-label="Three-dimensional scatter plot of candidate right ascension, declination and illustrative confidence"
          >
            {[0, 1, 2, 3].map((step) => (
              <g key={step} className="scatter-grid">
                <line
                  x1={100 + step * 110}
                  y1={220 + step * 13}
                  x2={230 + step * 110}
                  y2={155 + step * 13}
                />
                <line
                  x1={100 + step * 32}
                  y1={220 - step * 22}
                  x2={430 + step * 32}
                  y2={255 - step * 22}
                />
                <line x1="100" y1={220 - step * 42} x2="430" y2={255 - step * 42} />
              </g>
            ))}
            <line className="scatter-axis" x1="100" y1="220" x2="430" y2="255" />
            <line className="scatter-axis" x1="100" y1="220" x2="230" y2="155" />
            <line className="scatter-axis scatter-z-axis" x1="100" y1="220" x2="100" y2="65" />
            <text className="scatter-axis-label" x="426" y="278">
              RA · right ascension
            </text>
            <text className="scatter-axis-label" x="235" y="151">
              DEC · declination
            </text>
            <text className="scatter-axis-label" x="34" y="69">
              Z · confidence
            </text>
            {sourceCoordinates.map(({ item, ra, dec }) => {
              const raPosition = (ra - raMin) / raRange;
              const decPosition = (dec - decMin) / decRange;
              const baseX = 100 + raPosition * 330 + decPosition * 130;
              const baseY = 220 + raPosition * 35 - decPosition * 65;
              const x = baseX;
              const y = baseY - (item.confidence / 100) * 125;
              return (
                <g
                  key={item.id}
                  className={
                    selectedCandidate === item.id ? "scatter-point active" : "scatter-point"
                  }
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${item.id}: RA ${item.ra}, DEC ${item.dec}, illustrative confidence ${item.confidence}%`}
                  onClick={() => setSelectedCandidate(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedCandidate(item.id);
                    }
                  }}
                >
                  <line x1={baseX} y1={baseY} x2={x} y2={y} />
                  <circle cx={x} cy={y} r={selectedCandidate === item.id ? 6 : 4} />
                  <title>{`${item.id} · RA ${item.ra} · DEC ${item.dec} · demo confidence ${item.confidence}%`}</title>
                </g>
              );
            })}
          </svg>
          <div className="scatter-readout">
            <span className="data-label">SELECTED DEMO SOURCE</span>
            <strong>{candidate.id}</strong>
            <span>
              Right ascension <b>{candidate.ra}</b>
            </span>
            <span>
              Declination <b>{candidate.dec}</b>
            </span>
            <span>
              Illustrative confidence <b>{candidate.confidence}%</b>
            </span>
            <span>
              Measurement uncertainty <b>Unavailable</b>
            </span>
          </div>
        </div>
        <p className="scatter-integrity">
          <Icon name="info" size={13} /> X/Y are sky coordinates; Z is the demo confidence score,
          not physical depth or statistical significance. Each point is selectable.
        </p>
      </Panel>
    );
  }
  function renderDetection() {
    if (tab === 5) return <Report />;
    if (tab === 4)
      return (
        <div className="candidate-detail-layout">
          <div className="left-stack">
            <Panel
              title={
                <>
                  <Icon name="target" size={18} />
                  Candidate {candidate.id}
                </>
              }
              action={<Badge color="yellow">{candidate.status}</Badge>}
            >
              <div className="side-by-side">
                <div>
                  <SkyMap small selection={false} />
                  <span className="image-epoch">A · {observations[Number(dateA)].date}</span>
                </div>
                <div>
                  <SkyMap small epoch selection={false} />
                  <span className="image-epoch">B · {observations[Number(dateB)].date}</span>
                </div>
              </div>
            </Panel>
            <Panel
              title="Estimated displacement"
              action={<span className="mono cyan-text">{candidate.motion} arcsec / 184 days</span>}
            >
              <Chart />
            </Panel>
          </div>
          <Panel title="Scientific review">
            <div className="panel-body">
              <div className="data-label">DETECTION CONFIDENCE</div>
              <div className="confidence-value">
                {candidate.confidence}
                <small>%</small>
              </div>
              <div className="progress-track">
                <span style={{ width: `${candidate.confidence}%` }} />
              </div>
              <div className="detail-rows spaced">
                <div>
                  <span>Right ascension</span>
                  <b>{candidate.ra}</b>
                </div>
                <div>
                  <span>Declination</span>
                  <b>{candidate.dec}</b>
                </div>
                <div>
                  <span>Preliminary class</span>
                  <b>{candidate.type}</b>
                </div>
                <div>
                  <span>Displacement</span>
                  <b>{candidate.motion} arcsec</b>
                </div>
                <div>
                  <span>Current status</span>
                  <b>{candidate.status}</b>
                </div>
              </div>
              <div className="validation-buttons">
                <Button primary icon="check" onClick={() => updateStatus("Validated")}>
                  Validate candidate
                </Button>
                <Button icon="bell" onClick={() => updateStatus("Needs review")}>
                  Mark for review
                </Button>
                <Button icon="close" className="danger-button" onClick={() => setModal("discard")}>
                  Discard candidate
                </Button>
                <div className="divider" />
                <Button
                  icon="catalog"
                  onClick={() => {
                    setSaved((s) => [...new Set([...s, candidate.id])]);
                    notify("Candidate saved in the demo catalog.");
                    navigate(4, 2);
                  }}
                >
                  {saved.includes(candidate.id)
                    ? "Open in Discovery Catalog"
                    : "Save to Discovery Catalog"}
                  <Icon name="arrow" size={15} />
                </Button>
              </div>
              <p className="field-hint">
                Validation updates this demo session only. It does not confirm a real astronomical
                discovery.
              </p>
            </div>
          </Panel>
        </div>
      );
    if (tab === 2)
      return (
        <Panel
          title="Detection pipeline"
          action={
            <Badge color={progress === 100 ? "green" : "blue"}>
              {progress === 100 ? "Complete" : processing ? "Processing demo" : "Ready to process"}
            </Badge>
          }
        >
          <div className="processing-body">
            <div className={`processing-orbit ${processing ? "spinning" : ""}`}>
              <Icon name={progress === 100 ? "check" : "target"} size={42} />
            </div>
            <span className="eyebrow">ILLUSTRATIVE ANALYSIS PIPELINE</span>
            <h2>
              {progress === 100
                ? "Your candidates are ready."
                : processing
                  ? "Looking for subtle differences…"
                  : "Ready to explore the unknown."}
            </h2>
            <p>{region} · 2 observation epochs · 102 spectral bands</p>
            <div className="processing-progress">
              <span>{progress}%</span>
              <div className="progress-track">
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="pipeline-stages">
              {[
                "Load observations",
                "Extract sources",
                "Compare positions",
                "Evaluate candidates",
              ].map((s, i) => (
                <div
                  key={s}
                  className={
                    progress >= (i + 1) * 25 ? "complete" : progress >= i * 25 ? "current" : ""
                  }
                >
                  <span>
                    {progress >= (i + 1) * 25 ? <Icon name="check" size={15} /> : `0${i + 1}`}
                  </span>
                  <h4>{s}</h4>
                  <p>
                    {progress >= (i + 1) * 25
                      ? "Complete"
                      : progress >= i * 25 && processing
                        ? "In progress"
                        : "Waiting"}
                  </p>
                </div>
              ))}
            </div>
            {progress === 100 ? (
              <Button primary icon="arrow" onClick={() => setTab(3)}>
                Review {resultIds.length} candidates
              </Button>
            ) : (
              <Button
                primary
                icon={processing ? "pause" : "play"}
                onClick={() =>
                  processing
                    ? setProcessing(false)
                    : progress === 0
                      ? runAnalysis()
                      : setProcessing(true)
                }
              >
                {processing
                  ? "Pause processing"
                  : progress > 0
                    ? "Resume processing"
                    : "Start demo analysis"}
              </Button>
            )}
            <p className="field-hint">
              This prototype simulates processing. No scientific detection algorithm is executed.
            </p>
          </div>
        </Panel>
      );
    if (tab === 1)
      return (
        <div className="workspace-grid">
          <Panel title="Configure a detection run">
            <div className="panel-body config-body">
              <label className="field-label">Target region{regionSelect}</label>
              <div className="form-row">
                <label className="field-label">
                  Observation A
                  <select value={dateA} onChange={(e) => setDateA(e.target.value)}>
                    {observations.map((o, i) => (
                      <option value={i} key={o.id}>
                        {o.date}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Observation B
                  <select value={dateB} onChange={(e) => setDateB(e.target.value)}>
                    {observations.map((o, i) => (
                      <option value={i} key={o.id}>
                        {o.date}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="divider" />
              <label className="field-label">
                Detection confidence threshold <span className="range-value">{threshold}%</span>
                <input
                  aria-label="Detection threshold"
                  type="range"
                  min="50"
                  max="99"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                />
              </label>
              <p className="field-hint">
                Only demo candidates above this confidence appear after processing.
              </p>
              <label className="field-label">
                Algorithm sensitivity
                <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value)}>
                  <option>Conservative</option>
                  <option>Balanced</option>
                  <option>High sensitivity</option>
                </select>
              </label>
              <div className="processing-options">
                <span>
                  <Icon name="check" size={15} />
                  Source extraction
                </span>
                <span>
                  <Icon name="check" size={15} />
                  Position cross-matching
                </span>
                <span>
                  <Icon name="check" size={15} />
                  Artifact rejection
                </span>
              </div>
              <Button primary icon="play" disabled={dateA === dateB} onClick={runAnalysis}>
                Start demo analysis
                <Icon name="arrow" size={15} />
              </Button>
              {dateA === dateB && (
                <p className="warning-text">Choose two different observation dates.</p>
              )}
            </div>
          </Panel>
          <div className="right-stack">
            <SkyMap small />
            {regionDetails}
          </div>
        </div>
      );
    return (
      <>
        {tab === 0 && (
          <div className="detection-overview">
            <SourceScatter3D />
            <Panel title="Your next discovery">
              <div className="panel-body detection-cta">
                <span className="form-icon">
                  <Icon name="target" size={28} />
                </span>
                <h2>
                  A little motion.
                  <br />A big possibility.
                </h2>
                <p>Compare two epochs and surface sources that deserve a closer look.</p>
                <Button primary icon="plus" onClick={() => setTab(1)}>
                  New detection run
                </Button>
              </div>
            </Panel>
          </div>
        )}
        {tab === 3 && (
          <Panel
            title="Candidate positions"
            action={<span className="muted small-text">Select a marker to review</span>}
          >
            <SkyMap difference selection={false} />
          </Panel>
        )}
        <CandidateTable />
        {progress === 100 && (
          <div className="info-banner">
            <Icon name="info" size={17} />
            Run configuration: {threshold}% threshold · {sensitivity}. {resultIds.length} of{" "}
            {candidates.length} candidates match the configured threshold and sensitivity.
          </div>
        )}
        <div className="workflow-next">
          <span>All candidates are simulated and require human review.</span>
          <Button icon="settings" onClick={() => setTab(1)}>
            Configure analysis
          </Button>
        </div>
      </>
    );
  }
  function renderCatalog() {
    const catalogObjects = candidates.filter((c) => saved.includes(c.id));
    let segmentEnd = 0;
    const catalogGradient = ["Validated", "Pending review", "Needs review", "Discarded"]
      .map((status, i) => {
        const segmentStart = segmentEnd;
        segmentEnd += catalogObjects.length
          ? (catalogObjects.filter((c) => c.status === status).length / catalogObjects.length) * 100
          : 0;
        return `${["#8a79c6", "#c5ab77", "#738fbd", "#465269"][i]} ${segmentStart}% ${segmentEnd}%`;
      })
      .join(", ");
    if (tab === 5) return <Report object />;
    if (tab === 2)
      return (
        <div className="candidate-detail-layout">
          <div className="left-stack">
            <Panel
              title="Candidate field"
              action={<Badge color="violet">Simulated candidate</Badge>}
            >
              <SkyMap selection={false} />
            </Panel>
            <Panel
              title="Observation history"
              action={
                <button className="text-link" onClick={() => setTab(3)}>
                  Full timeline
                  <Icon name="arrow" size={14} />
                </button>
              }
            >
              <div className="history-list">
                {observations.map((o, i) => (
                  <div key={o.id}>
                    <span className="history-dot" />
                    <div>
                      <strong>{o.date}</strong>
                      <span className="mono">{o.id}</span>
                    </div>
                    <span className="mono">
                      {(Number.parseFloat(candidate.ra) - i * 0.0003).toFixed(4)}°
                    </span>
                    <Badge color="blue">Epoch {3 - i}</Badge>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <Panel title="Object identification">
            <div className="panel-body">
              <span className="eyebrow">DISCOVERY CATALOG / CANDIDATE</span>
              <h2 className="object-id">{candidate.id}</h2>
              <Badge color={candidate.status === "Validated" ? "green" : "yellow"}>
                {candidate.status}
              </Badge>
              <div className="detail-rows spaced">
                <div>
                  <span>Right ascension</span>
                  <b>{candidate.ra}</b>
                </div>
                <div>
                  <span>Declination</span>
                  <b>{candidate.dec}</b>
                </div>
                <div>
                  <span>Detection date</span>
                  <b>Sep 18, 2025</b>
                </div>
                <div>
                  <span>Preliminary class</span>
                  <b>{candidate.type}</b>
                </div>
                <div>
                  <span>Displacement</span>
                  <b>{candidate.motion} arcsec</b>
                </div>
                <div>
                  <span>Confidence</span>
                  <b className="cyan-text">{candidate.confidence}%</b>
                </div>
                <div>
                  <span>Catalog status</span>
                  <b>{saved.includes(candidate.id) ? "Saved this session" : "Not saved"}</b>
                </div>
              </div>
              <div className="validation-buttons">
                <Button primary icon="time" onClick={() => setTab(4)}>
                  View visual evidence
                </Button>
                <Button icon="target" onClick={() => navigate(3, 4)}>
                  Review candidate
                </Button>
                <Button
                  icon="catalog"
                  onClick={() => {
                    setSaved((s) => [...new Set([...s, candidate.id])]);
                    notify("Candidate saved to this demo session.");
                  }}
                  disabled={saved.includes(candidate.id)}
                >
                  {saved.includes(candidate.id) ? "Saved in catalog" : "Save candidate"}
                </Button>
                <Button icon="download" onClick={() => setTab(5)}>
                  Scientific report
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      );
    if (tab === 3)
      return (
        <>
          <div className="context-bar">
            <div>
              <Icon name="target" size={17} />
              <strong className="mono">{candidate.id}</strong>
            </div>
            <Button icon="time" onClick={() => navigate(1, 1)}>
              Compare observations
            </Button>
          </div>
          <Panel title="Object observation timeline">
            <div className="object-timeline">
              {[...observations].reverse().map((o, i) => (
                <div key={o.id}>
                  <span className="timeline-point" />
                  <div>
                    <span className="eyebrow">EPOCH 0{i + 1}</span>
                    <h3>{o.date}</h3>
                    <p className="mono muted">{o.id}</p>
                    <div
                      className="timeline-image"
                      style={{
                        backgroundImage: `url(${skyImage})`,
                        backgroundPosition: `${40 + i * 8}% center`,
                      }}
                    >
                      <span className="timeline-target" />
                    </div>
                    <div className="detail-rows">
                      <div>
                        <span>RA</span>
                        <b>{(Number.parseFloat(candidate.ra) - (2 - i) * 0.0003).toFixed(4)}°</b>
                      </div>
                      <div>
                        <span>Flux (simulated)</span>
                        <b>{(12.8 + i * 0.4).toFixed(1)} mJy</b>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Illustrative position evolution">
            <Chart />
          </Panel>
        </>
      );
    if (tab === 4)
      return (
        <>
          <div className="context-bar">
            <div>
              <Icon name="target" size={17} />
              <strong className="mono">{candidate.id}</strong>
              <Badge color="violet">Visual evidence · Demo</Badge>
            </div>
            <Button icon="download" onClick={() => setTab(5)}>
              Open report
            </Button>
          </div>
          <Comparison mode={2} />
          <div className="workspace-grid">
            <Panel title="Difference image">
              <SkyMap small difference selection={false} />
            </Panel>
            <Panel title="Processing provenance">
              <div className="panel-body">
                <div className="detail-rows">
                  <div>
                    <span>Pipeline</span>
                    <b>Demo cross-match v1.0</b>
                  </div>
                  <div>
                    <span>Confidence threshold</span>
                    <b>{threshold}%</b>
                  </div>
                  <div>
                    <span>Reference frame</span>
                    <b>ICRS / J2000</b>
                  </div>
                  <div>
                    <span>Available bands</span>
                    <b>102 illustrative bands</b>
                  </div>
                  <div>
                    <span>Astrometry</span>
                    <b>Simulated</b>
                  </div>
                </div>
                <p className="field-hint mt">
                  Visual shifts and residuals demonstrate the review workflow; they are not measured
                  from the reference photograph.
                </p>
                <Button icon="spectrum" onClick={() => navigate(2, 4)}>
                  Inspect source spectrum
                </Button>
              </div>
            </Panel>
          </div>
        </>
      );
    return (
      <>
        {tab === 0 && (
          <div className="detection-overview">
            <Panel title="Candidate distribution">
              <div className="distribution">
                <div
                  className="donut"
                  style={{
                    background: catalogObjects.length
                      ? `conic-gradient(${catalogGradient})`
                      : "#263044",
                  }}
                >
                  <div>
                    {saved.length}
                    <span>CANDIDATES</span>
                  </div>
                </div>
                <div className="distribution-legend">
                  {["Validated", "Pending review", "Needs review", "Discarded"].map((s, i) => (
                    <div key={s}>
                      <span className={`distribution-dot dot-${i}`} />
                      <span>{s}</span>
                      <b>
                        {candidates.filter((c) => saved.includes(c.id) && c.status === s).length}
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
            <Panel title="Recent activity">
              <div className="activity-list">
                {saved
                  .slice(-3)
                  .reverse()
                  .map((id, i) => (
                    <button
                      key={id}
                      onClick={() => {
                        setSelectedCandidate(id);
                        setTab(2);
                      }}
                    >
                      <span className="activity-icon">
                        <Icon name="catalog" size={16} />
                      </span>
                      <span>
                        <strong>{id}</strong>
                        <span>Added to demo catalog</span>
                      </span>
                      <small>{i + 1}h ago</small>
                      <Icon name="chevron" size={14} />
                    </button>
                  ))}
              </div>
            </Panel>
          </div>
        )}
        <CandidateTable catalog />
        <div className="workflow-next">
          <span>
            <Icon name="info" size={15} />
            Catalog changes are held in this prototype session only.
          </span>
          <Button icon="target" primary onClick={() => navigate(3, 3)}>
            Discover more candidates
            <Icon name="arrow" size={15} />
          </Button>
        </div>
      </>
    );
  }

  const isDetection = moduleIndex === 3;
  const isCatalog = moduleIndex === 4;
  const statCandidates = candidates.filter((c) =>
    isCatalog ? saved.includes(c.id) : resultIds.includes(c.id),
  );
  const meanConfidence = statCandidates.length
    ? `${(statCandidates.reduce((sum, c) => sum + c.confidence, 0) / statCandidates.length).toFixed(1)}%`
    : "—";
  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <button className="brand" onClick={() => navigate(0)} aria-label="SPHEREX home">
          <span className="brand-mark">
            <svg viewBox="0 0 44 44" fill="none">
              <circle cx="22" cy="22" r="13" stroke="currentColor" strokeWidth="1.4" />
              <ellipse
                cx="22"
                cy="22"
                rx="21"
                ry="7"
                stroke="currentColor"
                strokeWidth="1.4"
                transform="rotate(-40 22 22)"
              />
              <path d="m26 4-8 36" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="35" cy="9" r="2.3" fill="#a5a1ff" />
            </svg>
          </span>
          <span className="brand-name">
            SPHEREX<span>— PLANET X</span>
          </span>
        </button>
        <div className="workspace-switch">
          <span className="workspace-avatar">
            <Icon name="globe" size={19} />
          </span>
          <div>
            <strong>Research workspace</strong>
            <span>Space Apps Challenge</span>
          </div>
          <Icon name="chevron" size={13} />
        </div>
        <div className="nav-group-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${dashboard ? "active" : ""}`}
            onClick={() => {
              setDashboard(true);
              setMobileMenu(false);
            }}
          >
            <Icon name="grid" />
            Dashboard
          </button>
          {modules.map((m, i) => (
            <button
              key={m.name}
              className={`nav-item ${!dashboard && moduleIndex === i ? "active" : ""}`}
              onClick={() => navigate(i)}
            >
              <Icon name={m.icon} />
              <span>{displayModuleName(i)}</span>
              {i === 3 && <span className="nav-count">{candidates.length}</span>}
              {i === 0 && !dashboard && moduleIndex === 0 && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-context">
          <span className="nav-group-label">ACTIVE REGION</span>
          <div>
            <span className="live-dot" />
            <span>{region}</span>
          </div>
          <p className="mono">
            {Number(ra).toFixed(4)}° · {Number(dec).toFixed(4)}°
          </p>
          <button onClick={() => navigate(0, 2)}>
            Change region
            <Icon name="arrow" size={13} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="mission-card">
            <div>
              <span className="mission-orbit">
                <Icon name="globe" size={20} />
              </span>
              <Badge color="green">Mission active</Badge>
            </div>
            <strong>A new view of the universe.</strong>
            <p>
              One sky. 102 infrared bands.
              <br />
              Endless possibilities.
            </p>
            <a href="https://science.nasa.gov/mission/spherex/" target="_blank" rel="noreferrer">
              About SPHEREx
              <Icon name="external" size={12} />
            </a>
          </div>
          <button className="nav-item" onClick={() => setModal("settings")}>
            <Icon name="settings" />
            Settings
          </button>
          <button className="nav-item" onClick={() => setModal("help")}>
            <Icon name="help" />
            Help & documentation
            <Icon name="external" size={12} />
          </button>
          <div className="sidebar-footer">
            <span className="nasa-label">NASA</span>
            <span>
              SPACE APPS CHALLENGE<span>Built for curiosity.</span>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileMenu(true)}
            >
              <Icon name="menu" />
            </button>
            <Icon name="globe" size={16} />
            <span>Workspace</span>
            <Icon name="chevron" size={12} />
            <strong>{dashboard ? "Dashboard" : displayModuleName(moduleIndex)}</strong>
          </div>
          <div className="topbar-right">
            <div className="experience-switch" role="group" aria-label="Experience level">
              <button
                type="button"
                aria-pressed={experienceMode === "public"}
                className={experienceMode === "public" ? "active" : ""}
                onClick={() => setExperienceMode("public")}
              >
                Explore
              </button>
              <button
                type="button"
                aria-pressed={experienceMode === "advanced"}
                className={experienceMode === "advanced" ? "active" : ""}
                onClick={() => setExperienceMode("advanced")}
              >
                Observatory
              </button>
            </div>
            <form className="global-search" onSubmit={globalSearch}>
              <Icon name="search" size={16} />
              <input
                aria-label="Search objects, regions, coordinates"
                placeholder="Search objects, regions, coordinates…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <span className="data-status">
              <span className="live-dot" />
              {apiState === "online" ? "Backend connected" : apiState === "checking" ? "Connecting to backend" : "Backend unavailable"}
            </span>
            <span className="topbar-divider" />
            <button
              className="notification-button icon-button"
              title="Notifications"
              onClick={() => setModal("notifications")}
            >
              <Icon name="bell" size={19} />
              <span />
            </button>
            <button
              className="profile-avatar"
              title="Researcher profile"
              onClick={() => setModal("profile")}
            >
              AC
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                {dashboard ? "YOUR UNIVERSE, CONNECTED" : "EXPLORE. COMPARE. DISCOVER."}
              </div>
              <h1>
                {dashboard ? "Mission Control" : displayModuleName(moduleIndex)}
                <span className="section-index">/ {dashboard ? "00" : `0${moduleIndex + 1}`}</span>
              </h1>
              <p>
                {dashboard
                  ? experienceMode === "public"
                    ? "Start with the sky. Discover what changes and what its light can tell us."
                    : "Your starting point for a new perspective on the universe."
                  : experienceMode === "public"
                    ? publicModuleDescriptions[moduleIndex]
                    : currentModule.description}
              </p>
            </div>
            <div className="heading-actions">
              <span className="demo-badge">
                <span />
                ILLUSTRATIVE VIEWS · API DATA SEPARATE
              </span>
              <Button icon="download" onClick={exportReport}>
                Export{!dashboard && moduleIndex === 0 ? " view" : " report"}
              </Button>
              <Button
                primary
                icon={
                  dashboard
                    ? "sky"
                    : moduleIndex === 0
                      ? "plus"
                      : moduleIndex === 3
                        ? "play"
                        : "arrow"
                }
                onClick={() =>
                  dashboard
                    ? navigate(0)
                    : moduleIndex === 0
                      ? navigate(0, 2)
                      : moduleIndex === 3
                        ? setTab(1)
                        : moduleIndex === 4
                          ? navigate(3, 3)
                          : setTab(5)
                }
              >
                {dashboard
                  ? "Explore the sky"
                  : moduleIndex === 0
                    ? "New exploration"
                    : moduleIndex === 3
                      ? "New detection"
                      : moduleIndex === 4
                        ? "Add candidate"
                        : "Create report"}
              </Button>
            </div>
          </div>
          <div className="stats-grid">
            <Stat
              label={
                isDetection
                  ? experienceMode === "public"
                    ? "Objects to explore"
                    : "Total candidates"
                  : isCatalog
                    ? experienceMode === "public"
                      ? "Saved discoveries"
                      : "Catalog candidates"
                    : experienceMode === "public"
                      ? "Observing dates"
                      : "Available observations"
              }
              value={
                isDetection
                  ? String(resultIds.length).padStart(2, "0")
                  : isCatalog
                    ? String(saved.length).padStart(2, "0")
                    : "03"
              }
              foot={
                isDetection || isCatalog
                  ? experienceMode === "public"
                    ? "Illustrative demo objects"
                    : "In the current demo region"
                  : experienceMode === "public"
                    ? "Three example dates"
                    : "Across 3 observation epochs"
              }
              icon={isDetection ? "target" : isCatalog ? "catalog" : "layers"}
              visual={isDetection || isCatalog ? "sources" : "epochs"}
            />
            <Stat
              label={
                isDetection || isCatalog
                  ? experienceMode === "public"
                    ? "Need a closer look"
                    : "Pending review"
                  : "Spectral channels"
              }
              value={
                isDetection || isCatalog
                  ? String(
                      statCandidates.filter((c) => c.status === "Pending review").length,
                    ).padStart(2, "0")
                  : "102"
              }
              foot={
                isDetection || isCatalog
                  ? experienceMode === "public"
                    ? "Awaiting expert review"
                    : "Awaiting scientific validation"
                  : "102 channel positions · calibration unavailable"
              }
              icon={isDetection || isCatalog ? "time" : "spectrum"}
              color="violet"
              visual={isDetection || isCatalog ? "reviews" : "bands"}
            />
            <Stat
              label={
                isDetection || isCatalog
                  ? experienceMode === "public"
                    ? "Reviewed objects"
                    : "Validated candidates"
                  : "Sources in region"
              }
              value={
                isDetection || isCatalog
                  ? String(statCandidates.filter((c) => c.status === "Validated").length).padStart(
                      2,
                      "0",
                    )
                  : "1,284"
              }
              foot={
                isDetection || isCatalog
                  ? "Reviewed in this demo session"
                  : experienceMode === "public"
                    ? "Illustrative demo count"
                    : "Illustrative cataloged sources"
              }
              icon={isDetection || isCatalog ? "check" : "target"}
              color="cyan"
              visual="sources"
            />
            <Stat
              label={
                isDetection || isCatalog
                  ? experienceMode === "public"
                    ? "Average score"
                    : "Mean confidence"
                  : experienceMode === "public"
                    ? "Field coverage"
                    : "Sky coverage"
              }
              value={isDetection || isCatalog ? meanConfidence : "99.8%"}
              foot={
                isDetection || isCatalog
                  ? "Illustrative detection confidence"
                  : experienceMode === "public"
                    ? "Illustrative demo estimate"
                    : "Of the selected region"
              }
              icon="sky"
              color="green"
              visual="coverage"
            />
          </div>
          {dashboard ? (
            <>
              <div className="dashboard-hero">
                <div>
                  <span className="eyebrow">THE SKY IS NOT STANDING STILL.</span>
                  <h2>Neither is discovery.</h2>
                  <p>
                    Explore a region, travel through time and follow the light.
                    <br />
                    Your next question starts with a closer look.
                  </p>
                  <Button primary icon="sky" onClick={() => navigate(0)}>
                    Launch Sky Explorer
                    <Icon name="arrow" size={16} />
                  </Button>
                </div>
                <div className="dashboard-planet" />
                <span className="hero-credit">ILLUSTRATIVE RESEARCH WORKSPACE</span>
              </div>
              <div className="module-cards">
                {modules.map((m, i) => (
                  <button key={m.name} onClick={() => navigate(i)}>
                    <span className={`module-card-icon module-${i}`}>
                      <Icon name={m.icon} size={25} />
                    </span>
                    <span className="data-label">MODULE 0{i + 1} / 06 VIEWS</span>
                    <h3>{displayModuleName(i)}</h3>
                    <p>
                      {experienceMode === "public" ? publicModuleDescriptions[i] : m.description}
                    </p>
                    <span className="text-link">
                      Open module
                      <Icon name="arrow" size={15} />
                    </span>
                  </button>
                ))}
              </div>
              <ObservationTable />
            </>
          ) : (
            <>
              <div
                className="module-tabs"
                role="tablist"
                aria-label={`${displayModuleName(moduleIndex)} views`}
              >
                {currentModule.tabs.map((t, i) => (
                  <button
                    role="tab"
                    aria-selected={tab === i}
                    key={t}
                    className={tab === i ? "active" : ""}
                    onClick={() => {
                      setTab(i);
                      setPlaying(false);
                    }}
                  >
                    {i === 0 && <Icon name="grid" size={14} />}
                    {displayTabName(i)}
                    {i === 0 && <span className="tab-dot" />}
                  </button>
                ))}
              </div>
              {experienceMode === "public" && (
                <div className="public-mode-note">
                  <Icon name="info" size={15} />
                  <span>{publicModuleDescriptions[moduleIndex]}</span>
                  <button onClick={() => setExperienceMode("advanced")}>
                    Show scientific details
                  </button>
                </div>
              )}
              <div className="module-content">
                <BackendPanel />
                {moduleIndex === 0
                  ? renderSky()
                  : moduleIndex === 1
                    ? renderTemporal()
                    : moduleIndex === 2
                      ? renderSpectral()
                      : moduleIndex === 3
                        ? renderDetection()
                        : renderCatalog()}
              </div>
            </>
          )}
          <footer className="page-footer">
            <span>
              <span className="live-dot" />
              SPHEREX — PLANET X<span className="footer-separator">/</span>A universe of
              possibilities.
            </span>
            <span>
              NASA Space Apps concept<span className="footer-separator">·</span>Demo workspace v1.0
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Icon name="check" size={17} />
          </span>
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast("")}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-heading">
              <h3>
                {modal === "discard"
                  ? "Discard this candidate?"
                  : modal === "settings"
                    ? "Workspace settings"
                    : modal === "help"
                      ? "Your guide to discovery"
                      : modal === "profile"
                        ? "Researcher profile"
                        : "Workspace notifications"}
              </h3>
              <button
                className="icon-button"
                autoFocus
                aria-label="Close dialog"
                onClick={() => setModal(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="panel-body">
              {modal === "discard" ? (
                <>
                  <Badge color="yellow">Scientific review</Badge>
                  <h2 className="mt">{candidate.id}</h2>
                  <p className="muted mt">
                    Mark this illustrative candidate as an image artifact or non-moving source. The
                    record stays available in the catalog, and you can change its review status
                    later.
                  </p>
                  <div className="confirmation-actions">
                    <Button onClick={() => setModal(null)}>Keep candidate</Button>
                    <Button
                      icon="close"
                      className="danger-button"
                      onClick={() => {
                        updateStatus("Discarded");
                        setModal(null);
                      }}
                    >
                      Confirm discard
                    </Button>
                  </div>
                </>
              ) : modal === "settings" ? (
                <>
                  <p className="muted">Tune your view. Settings apply across the workspace.</p>
                  <label className="field-label mt">
                    Coordinate display
                    <select value={units} onChange={(e) => setUnits(e.target.value)}>
                      <option>Degrees</option>
                      <option>Hours (RA)</option>
                    </select>
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={grid}
                      onChange={(e) => setGrid(e.target.checked)}
                    />
                    Show celestial coordinate grid
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={showMarkers}
                      onChange={(e) => setShowMarkers(e.target.checked)}
                    />
                    Show candidate markers
                  </label>
                  <label className="field-label">
                    Animation interval
                    <select value={speed} onChange={(e) => setSpeed(e.target.value)}>
                      <option value="1200">Slow · 1.2s</option>
                      <option value="700">Normal · 0.7s</option>
                      <option value="300">Fast · 0.3s</option>
                    </select>
                  </label>
                  <Button primary icon="check" onClick={() => setModal(null)}>
                    Done
                  </Button>
                </>
              ) : modal === "help" ? (
                <>
                  <Badge color="violet">Interactive prototype</Badge>
                  <h2 className="mt">Five modules. One connected sky.</h2>
                  <p className="muted mt">
                    Start in Sky Explorer, select a region, then compare dates in Temporal Vision.
                    Explore 102 illustrative bands, run a simulated detection and save reviewed
                    candidates to the catalog.
                  </p>
                  <div className="help-steps">
                    {modules.map((m, i) => (
                      <button
                        key={m.name}
                        onClick={() => {
                          navigate(i);
                          setModal(null);
                        }}
                      >
                        <span>0{i + 1}</span>
                        <Icon name={m.icon} />
                        <strong>{m.name}</strong>
                        <Icon name="arrow" size={15} />
                      </button>
                    ))}
                  </div>
                  <p className="field-hint">
                    All scientific data is simulated. The prototype does not connect to NASA
                    archives, perform real detection or persist records after reload. NASA and
                    SPHEREx do not endorse this concept.
                  </p>
                  <a
                    className="text-link"
                    href="https://science.nasa.gov/mission/spherex/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Explore the real SPHEREx mission
                    <Icon name="external" size={14} />
                  </a>
                </>
              ) : modal === "profile" ? (
                <>
                  <div className="profile-card">
                    <span className="profile-avatar">AC</span>
                    <div>
                      <h2>Alex Chen</h2>
                      <p>Citizen scientist · Demo researcher</p>
                    </div>
                  </div>
                  <div className="detail-rows spaced">
                    <div>
                      <span>Workspace</span>
                      <b>Space Apps Challenge</b>
                    </div>
                    <div>
                      <span>Access</span>
                      <Badge color="blue">Prototype explorer</Badge>
                    </div>
                    <div>
                      <span>Saved candidates</span>
                      <b>{saved.length}</b>
                    </div>
                  </div>
                  <p className="field-hint">
                    This is an illustrative profile, not an authenticated account.
                  </p>
                </>
              ) : (
                <>
                  <div className="notification-entry">
                    <span className="activity-icon">
                      <Icon name="layers" size={20} />
                    </span>
                    <div>
                      <h3>Your demo workspace is ready</h3>
                      <p>
                        Three illustrative epochs and 102 spectral bands are available for
                        exploration.
                      </p>
                      <small>Workspace notification</small>
                    </div>
                  </div>
                  {progress === 100 && (
                    <div className="notification-entry">
                      <Icon name="check" />
                      <div>
                        <h3>Demo detection complete</h3>
                        <p>
                          {resultIds.length} simulated candidates match the latest run
                          configuration.
                        </p>
                        <button
                          className="text-link"
                          onClick={() => {
                            navigate(3, 3);
                            setModal(null);
                          }}
                        >
                          View results
                          <Icon name="arrow" size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="field-hint">No live mission notifications are connected.</p>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
