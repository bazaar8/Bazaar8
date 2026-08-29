export interface User {
  displayName: string;
  email: string;
  role: 'student' | 'admin';
  cashBalance: number;
  startingBalance: number;
  createdAt: number;
}

export interface Holding {
  ticker: string;
  quantity: number;
  avgPrice: number;
  positionType: 'long' | 'short';
}

export interface Order {
  uid: string;
  ticker: string;
  side: 'BUY' | 'SELL' | 'SHORT' | 'COVER';
  quantity: number;
  priceAtExecution: number;
  timestamp: any;
  status: 'pending' | 'completed' | 'rejected';
}

export interface Stock {
  ticker: string;
  name: string;
  sector: string;
  basePrice: number;
  currentPrice: number;
  listedAt: number;
  isIPO: boolean;
}

export interface NewsEvent {
  time: number;
  targetTickers: string[];
  headline: string;
  description: string;
  impactDirection: 'positive' | 'negative' | 'neutral';
  impactStrength: number;
  durationMinutes: number;
  status: 'scheduled' | 'active' | 'completed';
  firedAt: number;
}