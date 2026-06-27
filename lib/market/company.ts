// Company name lookup: hardcoded map for ~120 common US tickers with fallback
// to Twelve Data /quote. Returns the ticker symbol if nothing resolves.

const COMPANY_MAP: Record<string, string> = {
  // ETFs
  SPY: "SPDR S&P 500 ETF",
  QQQ: "Invesco QQQ Trust (Nasdaq-100)",
  DIA: "SPDR Dow Jones Industrial Average ETF",
  IWM: "iShares Russell 2000 ETF",
  VTI: "Vanguard Total Stock Market ETF",
  VOO: "Vanguard S&P 500 ETF",
  GLD: "SPDR Gold Shares",
  SLV: "iShares Silver Trust",
  TLT: "iShares 20+ Year Treasury Bond ETF",
  XLF: "Financial Select Sector SPDR",
  XLE: "Energy Select Sector SPDR",
  XLK: "Technology Select Sector SPDR",
  XLV: "Health Care Select Sector SPDR",
  ARKK: "ARK Innovation ETF",
  // Big Tech
  AAPL: "Apple Inc.",
  MSFT: "Microsoft Corp.",
  GOOGL: "Alphabet Inc. (Google)",
  GOOG: "Alphabet Inc. (Google)",
  AMZN: "Amazon.com Inc.",
  META: "Meta Platforms Inc.",
  NVDA: "NVIDIA Corp.",
  TSLA: "Tesla Inc.",
  ORCL: "Oracle Corp.",
  CRM: "Salesforce Inc.",
  ADBE: "Adobe Inc.",
  INTC: "Intel Corp.",
  AMD: "Advanced Micro Devices Inc.",
  QCOM: "Qualcomm Inc.",
  AVGO: "Broadcom Inc.",
  TXN: "Texas Instruments Inc.",
  MU: "Micron Technology Inc.",
  NFLX: "Netflix Inc.",
  UBER: "Uber Technologies Inc.",
  LYFT: "Lyft Inc.",
  SNAP: "Snap Inc.",
  SHOP: "Shopify Inc.",
  SQ: "Block Inc.",
  PYPL: "PayPal Holdings Inc.",
  ZM: "Zoom Video Communications Inc.",
  PLTR: "Palantir Technologies Inc.",
  RBLX: "Roblox Corp.",
  COIN: "Coinbase Global Inc.",
  ABNB: "Airbnb Inc.",
  DASH: "DoorDash Inc.",
  HOOD: "Robinhood Markets Inc.",
  SNOW: "Snowflake Inc.",
  NET: "Cloudflare Inc.",
  CRWD: "CrowdStrike Holdings Inc.",
  ZS: "Zscaler Inc.",
  PANW: "Palo Alto Networks Inc.",
  OKTA: "Okta Inc.",
  DDOG: "Datadog Inc.",
  MDB: "MongoDB Inc.",
  HUBS: "HubSpot Inc.",
  SPOT: "Spotify Technology S.A.",
  TWLO: "Twilio Inc.",
  DOCU: "DocuSign Inc.",
  // Healthcare
  JNJ: "Johnson & Johnson",
  PFE: "Pfizer Inc.",
  MRK: "Merck & Co. Inc.",
  ABBV: "AbbVie Inc.",
  LLY: "Eli Lilly and Co.",
  BMY: "Bristol-Myers Squibb Co.",
  AMGN: "Amgen Inc.",
  GILD: "Gilead Sciences Inc.",
  BIIB: "Biogen Inc.",
  REGN: "Regeneron Pharmaceuticals Inc.",
  MRNA: "Moderna Inc.",
  BNTX: "BioNTech SE",
  CVS: "CVS Health Corp.",
  UNH: "UnitedHealth Group Inc.",
  HUM: "Humana Inc.",
  ABT: "Abbott Laboratories",
  TMO: "Thermo Fisher Scientific Inc.",
  MDT: "Medtronic plc",
  ISRG: "Intuitive Surgical Inc.",
  // Finance
  JPM: "JPMorgan Chase & Co.",
  BAC: "Bank of America Corp.",
  WFC: "Wells Fargo & Co.",
  C: "Citigroup Inc.",
  GS: "Goldman Sachs Group Inc.",
  MS: "Morgan Stanley",
  BLK: "BlackRock Inc.",
  SCHW: "Charles Schwab Corp.",
  AXP: "American Express Co.",
  V: "Visa Inc.",
  MA: "Mastercard Inc.",
  COF: "Capital One Financial Corp.",
  USB: "U.S. Bancorp",
  PNC: "PNC Financial Services Group Inc.",
  // Energy
  XOM: "Exxon Mobil Corp.",
  CVX: "Chevron Corp.",
  COP: "ConocoPhillips",
  EOG: "EOG Resources Inc.",
  SLB: "Schlumberger (SLB)",
  OXY: "Occidental Petroleum Corp.",
  VLO: "Valero Energy Corp.",
  PSX: "Phillips 66",
  HAL: "Halliburton Co.",
  // Consumer
  WMT: "Walmart Inc.",
  TGT: "Target Corp.",
  COST: "Costco Wholesale Corp.",
  HD: "The Home Depot Inc.",
  LOW: "Lowe's Companies Inc.",
  MCD: "McDonald's Corp.",
  SBUX: "Starbucks Corp.",
  YUM: "Yum! Brands Inc.",
  CMG: "Chipotle Mexican Grill Inc.",
  DPZ: "Domino's Pizza Inc.",
  NKE: "Nike Inc.",
  LULU: "Lululemon Athletica Inc.",
  TJX: "TJX Companies Inc.",
  ROST: "Ross Stores Inc.",
  EBAY: "eBay Inc.",
  ETSY: "Etsy Inc.",
  // Airlines
  LUV: "Southwest Airlines Co.",
  AAL: "American Airlines Group Inc.",
  UAL: "United Airlines Holdings Inc.",
  DAL: "Delta Air Lines Inc.",
  JBLU: "JetBlue Airways Corp.",
  ALK: "Alaska Air Group Inc.",
  // Industrials
  GE: "GE Aerospace",
  HON: "Honeywell International Inc.",
  CAT: "Caterpillar Inc.",
  DE: "Deere & Company",
  BA: "Boeing Co.",
  LMT: "Lockheed Martin Corp.",
  RTX: "RTX Corp.",
  NOC: "Northrop Grumman Corp.",
  GD: "General Dynamics Corp.",
  UPS: "United Parcel Service Inc.",
  FDX: "FedEx Corp.",
  MMM: "3M Co.",
  // Telecom
  T: "AT&T Inc.",
  VZ: "Verizon Communications Inc.",
  TMUS: "T-Mobile US Inc.",
  // Media
  DIS: "The Walt Disney Co.",
  CMCSA: "Comcast Corp.",
  WBD: "Warner Bros. Discovery Inc.",
  // Real Estate / Utilities
  AMT: "American Tower Corp.",
  PLD: "Prologis Inc.",
  EQIX: "Equinix Inc.",
  NEE: "NextEra Energy Inc.",
  // Autos
  F: "Ford Motor Co.",
  GM: "General Motors Co.",
  RIVN: "Rivian Automotive Inc.",
  // Crypto-adjacent
  MSTR: "MicroStrategy Inc.",
  MARA: "Marathon Digital Holdings Inc.",
  RIOT: "Riot Platforms Inc.",
  // Berkshire
  BRKB: "Berkshire Hathaway Inc. (Class B)",
  BRKA: "Berkshire Hathaway Inc. (Class A)",
};

export function lookupCompanyName(ticker: string): string | null {
  return COMPANY_MAP[ticker.toUpperCase()] ?? null;
}

export async function getCompanyName(ticker: string): Promise<string> {
  const upper = ticker.toUpperCase();
  const mapped = COMPANY_MAP[upper];
  if (mapped) return mapped;

  const key = process.env.TWELVE_DATA_API_KEY;
  if (key) {
    try {
      const res = await fetch(
        `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(upper)}&apikey=${encodeURIComponent(key)}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.name === "string" && data.name.trim()) return data.name.trim();
      }
    } catch {
      // fall through to ticker fallback
    }
  }

  return upper;
}
