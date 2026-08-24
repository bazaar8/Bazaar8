export interface StockMeta {
  ticker: string;
  name: string;
  sector: string;
  basePrice: number;
}

export const STOCKS_CATALOG: StockMeta[] = [
  { ticker: "RELIANCE", name: "Reliance Industries Ltd", sector: "Energy & Conglomerate", basePrice: 2950.0 },
  { ticker: "TCS", name: "Tata Consultancy Services", sector: "Information Technology", basePrice: 3820.0 },
  { ticker: "HDFCBANK", name: "HDFC Bank Ltd", sector: "Banking & Finance", basePrice: 1680.0 },
  { ticker: "INFY", name: "Infosys Ltd", sector: "Information Technology", basePrice: 1540.0 },
  { ticker: "ICICIBANK", name: "ICICI Bank Ltd", sector: "Banking & Finance", basePrice: 1120.0 },
  { ticker: "BHARTIARTL", name: "Bharti Airtel Ltd", sector: "Telecommunications", basePrice: 1340.0 },
  { ticker: "TATAMOTORS", name: "Tata Motors Ltd", sector: "Automobile", basePrice: 990.0 },
  { ticker: "ITC", name: "ITC Ltd", sector: "FMCG", basePrice: 430.0 },
  { ticker: "LT", name: "Larsen & Toubro Ltd", sector: "Infrastructure", basePrice: 3580.0 },
  { ticker: "SBIN", name: "State Bank of India", sector: "Banking & Finance", basePrice: 810.0 }
];